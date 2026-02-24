import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { logAction } from '../middleware/auditLog.js';
import { supabaseAdmin } from '../services/supabase.js';
import { computeMerge } from '../services/contact-merge.js';

const router = Router();

/** Sanitize search input for Supabase .or() filter — strips PostgREST operators */
function sanitizeSearch(input) {
	return String(input).replace(/[,.()[\]{}]/g, '');
}

/** Allowlisted sort columns for contacts */
const CONTACTS_SORT_ALLOWLIST = [
	'full_name',
	'first_name',
	'last_name',
	'phone',
	'email',
	'source',
	'created_at',
	'updated_at',
	'last_synced_at'
];

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

	// Search by name, phone, or email (sanitized against filter injection)
	if (req.query.search) {
		const s = sanitizeSearch(req.query.search);
		query = query.or(
			`full_name.ilike.%${s}%,first_name.ilike.%${s}%,last_name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%`
		);
	}

	// Sorting (validated against allowlist)
	const sortField = CONTACTS_SORT_ALLOWLIST.includes(req.query.sort) ? req.query.sort : 'full_name';
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
 * Uses raw SQL to avoid Supabase's default 1000-row limit.
 */
router.get('/stats', logAction('contacts.stats'), async (req, res) => {
	// Use raw SQL for accurate counts — avoids Supabase 1000-row default limit
	const { data: rows, error } = await supabaseAdmin.rpc('exec_sql', {
		query: `
			SELECT
				count(*) as total,
				jsonb_object_agg(COALESCE(source, 'unknown'), source_count) as by_source,
				(
					SELECT jsonb_object_agg(tag, cnt)
					FROM (
						SELECT unnest(tags) as tag, count(*) as cnt
						FROM contacts
						WHERE tags IS NOT NULL
						GROUP BY tag
					) t
				) as by_tag,
				(
					SELECT jsonb_object_agg(list, cnt)
					FROM (
						SELECT unnest(lists) as list, count(*) as cnt
						FROM contacts
						WHERE lists IS NOT NULL
						GROUP BY list
					) t
				) as by_list
			FROM (
				SELECT source, count(*) as source_count
				FROM contacts
				GROUP BY source
			) s
		`
	});

	// Fallback: if the RPC doesn't exist, use paginated fetch
	if (error) {
		// Paginate to get ALL contacts (Supabase default limit is 1000)
		let allContacts = [];
		let from = 0;
		const batchSize = 1000;
		let keepGoing = true;

		while (keepGoing) {
			const { data: batch } = await supabaseAdmin
				.from('contacts')
				.select('source, tags, lists')
				.range(from, from + batchSize - 1);

			if (batch && batch.length > 0) {
				allContacts = allContacts.concat(batch);
				from += batchSize;
				if (batch.length < batchSize) keepGoing = false;
			} else {
				keepGoing = false;
			}
		}

		const total = allContacts.length;
		const sources = {};
		const tags = {};
		const lists = {};

		for (const c of allContacts) {
			sources[c.source || 'unknown'] = (sources[c.source || 'unknown'] || 0) + 1;
			if (c.tags && Array.isArray(c.tags)) {
				for (const t of c.tags) {
					tags[t] = (tags[t] || 0) + 1;
				}
			}
			if (c.lists && Array.isArray(c.lists)) {
				for (const l of c.lists) {
					lists[l] = (lists[l] || 0) + 1;
				}
			}
		}

		return res.json({ total, bySource: sources, byTag: tags, byList: lists });
	}

	// RPC succeeded — parse aggregated result
	const row = rows?.[0] || {};
	return res.json({
		total: parseInt(row.total, 10) || 0,
		bySource: row.by_source || {},
		byTag: row.by_tag || {},
		byList: row.by_list || {}
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
	const q = sanitizeSearch(req.query.q || '');
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
 * GET /api/contacts/duplicates
 * Find contacts that share the same phone_normalized.
 * Returns groups with 2+ members, each with a suggested merge preview.
 */
router.get('/duplicates', logAction('contacts.duplicates'), async (req, res) => {
	// Paginate to fetch ALL contacts with a phone
	let all = [];
	let from = 0;
	const batchSize = 1000;
	while (true) {
		const { data, error } = await supabaseAdmin
			.from('contacts')
			.select('*')
			.not('phone_normalized', 'is', null)
			.range(from, from + batchSize - 1);

		if (error) {
			console.error('Failed to fetch contacts for dedup:', error.message);
			return res.status(500).json({ error: 'Failed to fetch contacts' });
		}
		if (!data || data.length === 0) break;
		all = all.concat(data);
		if (data.length < batchSize) break;
		from += batchSize;
	}

	// Group by phone_normalized
	const phoneGroups = {};
	for (const c of all) {
		if (!phoneGroups[c.phone_normalized]) phoneGroups[c.phone_normalized] = [];
		phoneGroups[c.phone_normalized].push(c);
	}

	// Filter to groups with duplicates, compute merge preview for each
	const groups = [];
	for (const [phone, contacts] of Object.entries(phoneGroups)) {
		if (contacts.length < 2) continue;
		const merge = computeMerge(contacts);
		groups.push({
			phone,
			contacts,
			suggestedWinnerId: merge.winnerId,
			preview: merge.update
		});
	}

	return res.json({
		groups,
		totalGroups: groups.length,
		totalDuplicates: groups.reduce((n, g) => n + g.contacts.length - 1, 0)
	});
});

/**
 * POST /api/contacts/merge
 * Merge a group of duplicate contacts.
 * Body: { winnerId, loserIds }
 */
router.post('/merge', logAction('contacts.merge'), async (req, res) => {
	const { winnerId, loserIds } = req.body;

	if (!winnerId || !Array.isArray(loserIds) || loserIds.length === 0) {
		return res.status(400).json({ error: 'winnerId and loserIds[] are required' });
	}

	// Fetch all involved contacts
	const allIds = [winnerId, ...loserIds];
	const { data: contacts, error: fetchErr } = await supabaseAdmin
		.from('contacts')
		.select('*')
		.in('id', allIds);

	if (fetchErr || !contacts || contacts.length !== allIds.length) {
		return res.status(404).json({ error: 'One or more contacts not found' });
	}

	// Compute merge using the shared logic
	const merge = computeMerge(contacts);

	// Update winner with merged data
	const { error: updateErr } = await supabaseAdmin
		.from('contacts')
		.update(merge.update)
		.eq('id', merge.winnerId);

	if (updateErr) {
		console.error('Failed to update winner contact:', updateErr.message);
		return res.status(500).json({ error: 'Failed to update winner contact' });
	}

	// Repoint foreign keys from losers to winner
	let fkUpdates = 0;

	const { count: callCount } = await supabaseAdmin
		.from('call_logs')
		.update({ contact_id: merge.winnerId })
		.in('contact_id', merge.loserIds)
		.select('*', { count: 'exact', head: true });

	const { count: convoCount } = await supabaseAdmin
		.from('conversations')
		.update({ contact_id: merge.winnerId })
		.in('contact_id', merge.loserIds)
		.select('*', { count: 'exact', head: true });

	fkUpdates = (callCount || 0) + (convoCount || 0);

	// Delete losers
	const { error: delErr } = await supabaseAdmin.from('contacts').delete().in('id', merge.loserIds);

	if (delErr) {
		console.error('Failed to delete merged contacts:', delErr.message);
		return res.status(500).json({ error: 'Winner updated but failed to delete duplicates' });
	}

	// Fetch updated winner
	const { data: updated } = await supabaseAdmin
		.from('contacts')
		.select('*')
		.eq('id', merge.winnerId)
		.single();

	// Fire-and-forget audit log
	supabaseAdmin.from('audit_log').insert({
		action: 'contacts.merge',
		user_id: req.user?.id || null,
		resource_type: 'contact',
		resource_id: merge.winnerId,
		details: { loserIds: merge.loserIds, fkUpdates, merged: merge.loserIds.length }
	});

	return res.json({
		data: updated,
		merged: merge.loserIds.length,
		fkUpdates
	});
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
