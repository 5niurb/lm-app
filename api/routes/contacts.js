import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { logAction } from '../middleware/auditLog.js';
import { supabaseAdmin } from '../services/supabase.js';

const router = Router();

// All contact routes require authentication
router.use(verifyToken);

/**
 * GET /api/contacts
 * List contacts with pagination, filtering, and search.
 *
 * Query params:
 *   page (default 1), pageSize (default 50), source, search, sort, order
 *   tag — filter by tag (e.g. 'patient', 'lead', 'partner')
 *   tags — filter by multiple tags, comma-separated (e.g. 'patient,vip')
 *   list — filter by list membership (e.g. 'diamond', 'to-book')
 */
router.get('/', logAction('contacts.list'), async (req, res) => {
	const page = Math.max(1, parseInt(req.query.page, 10) || 1);
	const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 50));
	const offset = (page - 1) * pageSize;

	let query = supabaseAdmin.from('contacts').select('*', { count: 'exact' });

	// Filter by source
	if (req.query.source) {
		query = query.eq('source', req.query.source);
	}

	// Filter by tag (single tag — uses array containment)
	if (req.query.tag) {
		query = query.contains('tags', [req.query.tag]);
	}

	// Filter by multiple tags (comma-separated — contact must have ALL specified tags)
	if (req.query.tags) {
		const tagList = req.query.tags
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean);
		if (tagList.length > 0) {
			query = query.contains('tags', tagList);
		}
	}

	// Filter by list membership
	if (req.query.list) {
		query = query.contains('lists', [req.query.list]);
	}

	// Search by name, phone, or email
	if (req.query.search) {
		const s = req.query.search;
		query = query.or(
			`full_name.ilike.%${s}%,first_name.ilike.%${s}%,last_name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%`
		);
	}

	// Sorting
	const sortField = req.query.sort || 'full_name';
	const sortOrder = req.query.order === 'desc' ? false : true;
	query = query.order(sortField, { ascending: sortOrder });

	// Pagination
	query = query.range(offset, offset + pageSize - 1);

	const { data, error, count } = await query;

	if (error) {
		console.error('Failed to fetch contacts:', error.message);
		return res.status(500).json({ error: 'Failed to fetch contacts' });
	}

	return res.json({
		data: data || [],
		count: count || 0,
		page,
		pageSize
	});
});

/**
 * GET /api/contacts/stats
 * Get contact statistics including tag and list counts.
 */
router.get('/stats', logAction('contacts.stats'), async (req, res) => {
	// Fetch all contacts' tags, lists, and source (lightweight)
	const { data: contacts } = await supabaseAdmin.from('contacts').select('source, tags, lists');

	const total = contacts?.length || 0;
	const sources = {};
	const tags = {};
	const lists = {};

	if (contacts) {
		for (const c of contacts) {
			// Count by source
			sources[c.source] = (sources[c.source] || 0) + 1;

			// Count by tag
			if (c.tags && Array.isArray(c.tags)) {
				for (const t of c.tags) {
					tags[t] = (tags[t] || 0) + 1;
				}
			}

			// Count by list
			if (c.lists && Array.isArray(c.lists)) {
				for (const l of c.lists) {
					lists[l] = (lists[l] || 0) + 1;
				}
			}
		}
	}

	return res.json({
		total,
		bySource: sources,
		byTag: tags,
		byList: lists
	});
});

/**
 * GET /api/contacts/search
 * Quick search for contact matching (used by call log UI).
 * Returns minimal data for autocomplete.
 *
 * Query params: q (search term), limit (default 10)
 */
router.get('/search', logAction('contacts.search'), async (req, res) => {
	const q = req.query.q;
	if (!q || q.length < 2) {
		return res.json({ data: [] });
	}

	const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 10));

	const { data, error } = await supabaseAdmin
		.from('contacts')
		.select('id, full_name, first_name, last_name, phone, email, source')
		.or(
			`full_name.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`
		)
		.order('full_name', { ascending: true })
		.limit(limit);

	if (error) {
		console.error('Failed to search contacts:', error.message);
		return res.status(500).json({ error: 'Failed to search contacts' });
	}

	return res.json({ data: data || [] });
});

/**
 * POST /api/contacts/:id/tags
 * Add one or more tags to a contact.
 * Body: { tags: ['vip', 'partner'] }
 */
router.post('/:id/tags', logAction('contacts.addTags'), async (req, res) => {
	const { id } = req.params;
	const { tags: newTags } = req.body;

	if (!Array.isArray(newTags) || newTags.length === 0) {
		return res.status(400).json({ error: 'tags must be a non-empty array' });
	}

	// Fetch current tags
	const { data: contact, error: fetchErr } = await supabaseAdmin
		.from('contacts')
		.select('tags')
		.eq('id', id)
		.single();

	if (fetchErr || !contact) {
		return res.status(404).json({ error: 'Contact not found' });
	}

	// Merge (no duplicates)
	const currentTags = contact.tags || [];
	const mergedTags = [...new Set([...currentTags, ...newTags.map((t) => t.toLowerCase().trim())])];

	const { data, error } = await supabaseAdmin
		.from('contacts')
		.update({ tags: mergedTags, updated_at: new Date().toISOString() })
		.eq('id', id)
		.select()
		.single();

	if (error) {
		console.error('Failed to add tags:', error.message);
		return res.status(500).json({ error: 'Failed to add tags' });
	}

	return res.json({ data });
});

/**
 * DELETE /api/contacts/:id/tags
 * Remove one or more tags from a contact.
 * Body: { tags: ['vip'] }
 */
router.delete('/:id/tags', logAction('contacts.removeTags'), async (req, res) => {
	const { id } = req.params;
	const { tags: removeTags } = req.body;

	if (!Array.isArray(removeTags) || removeTags.length === 0) {
		return res.status(400).json({ error: 'tags must be a non-empty array' });
	}

	// Fetch current tags
	const { data: contact, error: fetchErr } = await supabaseAdmin
		.from('contacts')
		.select('tags')
		.eq('id', id)
		.single();

	if (fetchErr || !contact) {
		return res.status(404).json({ error: 'Contact not found' });
	}

	const removeSet = new Set(removeTags.map((t) => t.toLowerCase().trim()));
	const updatedTags = (contact.tags || []).filter((t) => !removeSet.has(t));

	const { data, error } = await supabaseAdmin
		.from('contacts')
		.update({ tags: updatedTags, updated_at: new Date().toISOString() })
		.eq('id', id)
		.select()
		.single();

	if (error) {
		console.error('Failed to remove tags:', error.message);
		return res.status(500).json({ error: 'Failed to remove tags' });
	}

	return res.json({ data });
});

/**
 * GET /api/contacts/:id
 * Get a single contact with their call history.
 */
router.get('/:id', logAction('contacts.read'), async (req, res) => {
	const { id } = req.params;

	const { data: contact, error } = await supabaseAdmin
		.from('contacts')
		.select('*')
		.eq('id', id)
		.single();

	if (error || !contact) {
		return res.status(404).json({ error: 'Contact not found' });
	}

	// Get recent call history for this contact
	const { data: calls } = await supabaseAdmin
		.from('call_logs')
		.select(
			'id, direction, from_number, to_number, status, disposition, duration, started_at, caller_name'
		)
		.eq('contact_id', id)
		.order('started_at', { ascending: false })
		.limit(20);

	// Get form submissions for this contact
	const { data: formSubmissions } = await supabaseAdmin
		.from('contact_form_submissions')
		.select('id, message, interested_in, preferred_contact, referral_source, status, created_at')
		.eq('contact_id', id)
		.order('created_at', { ascending: false })
		.limit(10);

	return res.json({
		data: {
			...contact,
			recent_calls: calls || [],
			form_submissions: formSubmissions || []
		}
	});
});

/**
 * POST /api/contacts
 * Create a new contact manually.
 */
router.post('/', logAction('contacts.create'), async (req, res) => {
	const { first_name, last_name, full_name, phone, email, source, patient_status, metadata } =
		req.body;

	if (!full_name && !first_name && !phone && !email) {
		return res.status(400).json({ error: 'At least a name, phone, or email is required' });
	}

	const contactName = full_name || [first_name, last_name].filter(Boolean).join(' ') || null;
	const phoneNormalized = phone ? phone.replace(/\D/g, '') || null : null;

	const { data, error } = await supabaseAdmin
		.from('contacts')
		.insert({
			first_name: first_name || null,
			last_name: last_name || null,
			full_name: contactName,
			phone: phone || null,
			phone_normalized: phoneNormalized,
			email: email || null,
			source: source || 'manual',
			patient_status: patient_status || null,
			metadata: metadata || {}
		})
		.select()
		.single();

	if (error) {
		console.error('Failed to create contact:', error.message);
		return res.status(500).json({ error: 'Failed to create contact' });
	}

	return res.status(201).json({ data });
});

/**
 * PATCH /api/contacts/:id
 * Update an existing contact.
 */
router.patch('/:id', logAction('contacts.update'), async (req, res) => {
	const { id } = req.params;
	const { first_name, last_name, full_name, phone, email, source, patient_status, metadata } =
		req.body;

	const update = {};
	if (first_name !== undefined) update.first_name = first_name;
	if (last_name !== undefined) update.last_name = last_name;
	if (full_name !== undefined) update.full_name = full_name;
	if (phone !== undefined) {
		update.phone = phone;
		update.phone_normalized = phone ? phone.replace(/\D/g, '') || null : null;
	}
	if (email !== undefined) update.email = email;
	if (source !== undefined) update.source = source;
	if (patient_status !== undefined) update.patient_status = patient_status;
	if (metadata !== undefined) update.metadata = metadata;

	if (Object.keys(update).length === 0) {
		return res.status(400).json({ error: 'No fields to update' });
	}

	update.updated_at = new Date().toISOString();

	const { data, error } = await supabaseAdmin
		.from('contacts')
		.update(update)
		.eq('id', id)
		.select()
		.single();

	if (error) {
		console.error('Failed to update contact:', error.message);
		return res.status(500).json({ error: 'Failed to update contact' });
	}

	return res.json({ data });
});

export default router;
