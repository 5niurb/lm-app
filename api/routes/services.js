import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { logAction } from '../middleware/auditLog.js';
import { supabaseAdmin } from '../services/supabase.js';

const router = Router();

// All service routes require authentication
router.use(verifyToken);

/** Strip characters that could inject additional filter clauses in Supabase .or() */
function sanitizeSearch(input) {
	return String(input).replace(/[,.()[\]{}]/g, '');
}

/** Admin-only guard middleware */
function requireAdmin(req, res, next) {
	if (req.user.role !== 'admin') {
		return res.status(403).json({ error: 'Admin access required' });
	}
	next();
}

// =============================================================================
// SERVICE CONTENT — literal /content/ routes MUST come before /:id params
// =============================================================================

/**
 * GET /api/services/content/:contentId
 * Get a single content block by ID.
 */
router.get('/content/:contentId', logAction('service_content.read'), async (req, res) => {
	try {
		const { data, error } = await supabaseAdmin
			.from('service_content')
			.select(
				`
        *,
        service:services(id, name, slug, category)
      `
			)
			.eq('id', req.params.contentId)
			.single();

		if (error) throw error;
		if (!data) return res.status(404).json({ error: 'Content not found' });

		res.json({ data });
	} catch (err) {
		console.error('Service content read error:', err.message);
		res.status(500).json({ error: 'Failed to load content' });
	}
});

/**
 * PUT /api/services/content/:contentId
 * Update a content block (admin only).
 */
router.put(
	'/content/:contentId',
	requireAdmin,
	logAction('service_content.update'),
	async (req, res) => {
		const { title, summary, page_slug, content_json, is_active } = req.body;

		try {
			const updates = {};
			if (title !== undefined) updates.title = title;
			if (summary !== undefined) updates.summary = summary;
			if (page_slug !== undefined) updates.page_slug = page_slug;
			if (content_json !== undefined) updates.content_json = content_json;
			if (is_active !== undefined) updates.is_active = is_active;

			if (Object.keys(updates).length === 0) {
				return res.status(400).json({ error: 'No fields to update' });
			}

			// Bump version on content change
			if (content_json !== undefined) {
				const { data: current } = await supabaseAdmin
					.from('service_content')
					.select('version')
					.eq('id', req.params.contentId)
					.single();
				if (current) {
					updates.version = (current.version || 1) + 1;
				}
			}

			const { data, error } = await supabaseAdmin
				.from('service_content')
				.update(updates)
				.eq('id', req.params.contentId)
				.select()
				.single();

			if (error) throw error;
			if (!data) return res.status(404).json({ error: 'Content not found' });

			res.json({ data });
		} catch (err) {
			console.error('Service content update error:', err.message);
			res.status(500).json({ error: 'Failed to update content' });
		}
	}
);

/**
 * DELETE /api/services/content/:contentId
 * Delete a content block (admin only).
 */
router.delete(
	'/content/:contentId',
	requireAdmin,
	logAction('service_content.delete'),
	async (req, res) => {
		try {
			const { error } = await supabaseAdmin
				.from('service_content')
				.delete()
				.eq('id', req.params.contentId);

			if (error) throw error;
			res.status(204).end();
		} catch (err) {
			console.error('Service content delete error:', err.message);
			res.status(500).json({ error: 'Failed to delete content' });
		}
	}
);

// =============================================================================
// SERVICES (treatment catalog) — parameterized /:id routes after literal routes
// =============================================================================

/**
 * GET /api/services
 * List all services, optionally filtered by category or active status.
 *
 * Query params: category, active (true/false), search
 */
router.get('/', logAction('services.list'), async (req, res) => {
	try {
		let query = supabaseAdmin.from('services').select('*');

		if (req.query.category) {
			query = query.eq('category', req.query.category);
		}
		if (req.query.active !== undefined) {
			query = query.eq('is_active', req.query.active === 'true');
		}
		if (req.query.search) {
			const s = sanitizeSearch(req.query.search);
			query = query.or(`name.ilike.%${s}%,description.ilike.%${s}%`);
		}

		query = query.order('sort_order', { ascending: true });

		const { data, error } = await query;
		if (error) throw error;

		res.json({ data: data || [] });
	} catch (err) {
		console.error('Services list error:', err.message);
		res.status(500).json({ error: 'Failed to load services' });
	}
});

/**
 * GET /api/services/:id
 * Get a single service with its content blocks.
 */
router.get('/:id', logAction('services.read'), async (req, res) => {
	try {
		const { data, error } = await supabaseAdmin
			.from('services')
			.select(
				`
        *,
        content:service_content(*)
      `
			)
			.eq('id', req.params.id)
			.single();

		if (error) throw error;
		if (!data) return res.status(404).json({ error: 'Service not found' });

		res.json({ data });
	} catch (err) {
		console.error('Service read error:', err.message);
		res.status(500).json({ error: 'Failed to load service' });
	}
});

/**
 * POST /api/services
 * Create a new service (admin only).
 */
router.post('/', requireAdmin, logAction('services.create'), async (req, res) => {
	const {
		name,
		slug,
		category,
		description,
		duration_min,
		price_from,
		is_active,
		sort_order,
		metadata
	} = req.body;

	if (!name || !slug || !category) {
		return res.status(400).json({ error: 'Name, slug, and category are required' });
	}

	try {
		const { data, error } = await supabaseAdmin
			.from('services')
			.insert({
				name,
				slug,
				category,
				description: description || null,
				duration_min: duration_min || null,
				price_from: price_from || null,
				is_active: is_active !== false,
				sort_order: sort_order || 0,
				metadata: metadata || {}
			})
			.select()
			.single();

		if (error) throw error;
		res.status(201).json({ data });
	} catch (err) {
		console.error('Service create error:', err.message);
		if (err.message?.includes('unique') || err.message?.includes('duplicate')) {
			return res.status(409).json({ error: 'A service with this slug already exists' });
		}
		res.status(500).json({ error: 'Failed to create service' });
	}
});

/**
 * PUT /api/services/:id
 * Update a service (admin only).
 */
router.put('/:id', requireAdmin, logAction('services.update'), async (req, res) => {
	const {
		name,
		slug,
		category,
		description,
		duration_min,
		price_from,
		is_active,
		sort_order,
		metadata
	} = req.body;

	try {
		const updates = {};
		if (name !== undefined) updates.name = name;
		if (slug !== undefined) updates.slug = slug;
		if (category !== undefined) updates.category = category;
		if (description !== undefined) updates.description = description;
		if (duration_min !== undefined) updates.duration_min = duration_min;
		if (price_from !== undefined) updates.price_from = price_from;
		if (is_active !== undefined) updates.is_active = is_active;
		if (sort_order !== undefined) updates.sort_order = sort_order;
		if (metadata !== undefined) updates.metadata = metadata;

		if (Object.keys(updates).length === 0) {
			return res.status(400).json({ error: 'No fields to update' });
		}

		const { data, error } = await supabaseAdmin
			.from('services')
			.update(updates)
			.eq('id', req.params.id)
			.select()
			.single();

		if (error) throw error;
		if (!data) return res.status(404).json({ error: 'Service not found' });

		res.json({ data });
	} catch (err) {
		console.error('Service update error:', err.message);
		res.status(500).json({ error: 'Failed to update service' });
	}
});

/**
 * DELETE /api/services/:id
 * Delete a service (admin only). Cascades to content and sequences.
 */
router.delete('/:id', requireAdmin, logAction('services.delete'), async (req, res) => {
	try {
		const { error } = await supabaseAdmin.from('services').delete().eq('id', req.params.id);

		if (error) throw error;
		res.status(204).end();
	} catch (err) {
		console.error('Service delete error:', err.message);
		res.status(500).json({ error: 'Failed to delete service' });
	}
});

// =============================================================================
// SERVICE CONTENT — per-service content lists + create
// =============================================================================

/**
 * GET /api/services/:serviceId/content
 * List all content blocks for a service.
 *
 * Query params: type (content_type filter)
 */
router.get('/:serviceId/content', logAction('service_content.list'), async (req, res) => {
	try {
		let query = supabaseAdmin
			.from('service_content')
			.select('*')
			.eq('service_id', req.params.serviceId);

		if (req.query.type) {
			query = query.eq('content_type', req.query.type);
		}

		query = query.order('content_type').order('version', { ascending: false });

		const { data, error } = await query;
		if (error) throw error;

		res.json({ data: data || [] });
	} catch (err) {
		console.error('Service content list error:', err.message);
		res.status(500).json({ error: 'Failed to load service content' });
	}
});

/**
 * POST /api/services/:serviceId/content
 * Create a content block for a service (admin only).
 */
router.post(
	'/:serviceId/content',
	requireAdmin,
	logAction('service_content.create'),
	async (req, res) => {
		const { content_type, title, summary, page_slug, content_json, is_active } = req.body;

		if (!content_type || !title) {
			return res.status(400).json({ error: 'content_type and title are required' });
		}

		try {
			const { data, error } = await supabaseAdmin
				.from('service_content')
				.insert({
					service_id: req.params.serviceId,
					content_type,
					title,
					summary: summary || null,
					page_slug: page_slug || null,
					content_json: content_json || [],
					is_active: is_active !== false,
					created_by: req.user.id
				})
				.select()
				.single();

			if (error) throw error;
			res.status(201).json({ data });
		} catch (err) {
			console.error('Service content create error:', err.message);
			if (err.message?.includes('idx_service_content_uniq')) {
				return res
					.status(409)
					.json({ error: 'An active content block of this type already exists for this service' });
			}
			res.status(500).json({ error: 'Failed to create content' });
		}
	}
);

export default router;
