import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { logAction } from '../middleware/auditLog.js';
import { supabaseAdmin } from '../services/supabase.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { sanitizeSearch } from '../utils/sanitize.js';
import { apiError } from '../utils/responses.js';

const router = Router();

router.use(verifyToken);

/**
 * GET /api/templates
 * List all SMS templates.
 * Query: category, search, active (true|false)
 */
router.get('/', logAction('templates.list'), async (req, res) => {
	const page = Math.max(1, parseInt(req.query.page) || 1);
	const per_page = Math.min(100, Math.max(1, parseInt(req.query.per_page) || 50));
	const offset = (page - 1) * per_page;

	let query = supabaseAdmin.from('sms_templates').select('*', { count: 'exact' });

	if (req.query.category && req.query.category !== 'all') {
		query = query.eq('category', req.query.category);
	}

	if (req.query.active !== undefined) {
		query = query.eq('is_active', req.query.active === 'true');
	} else {
		query = query.eq('is_active', true);
	}

	if (req.query.search) {
		const s = sanitizeSearch(req.query.search);
		query = query.or(`name.ilike.%${s}%,body.ilike.%${s}%`);
	}

	query = query.order('name', { ascending: true }).range(offset, offset + per_page - 1);

	const { data, count, error } = await query;

	if (error) {
		console.error('Failed to fetch templates:', error.message);
		return apiError(res, 500, 'server_error', 'Failed to fetch templates');
	}

	return res.json({
		data: data || [],
		meta: { total: count, page, per_page, total_pages: Math.ceil((count || 0) / per_page) }
	});
});

/**
 * GET /api/templates/:id
 * Get a single template.
 */
router.get('/:id', logAction('templates.read'), async (req, res) => {
	const { data, error } = await supabaseAdmin
		.from('sms_templates')
		.select('*')
		.eq('id', req.params.id)
		.single();

	if (error || !data) {
		return apiError(res, 404, 'not_found', 'Template not found');
	}

	return res.json({ data });
});

/**
 * POST /api/templates
 * Create a new SMS template.
 * Body: { name, body, category?, tags? }
 */
router.post('/', requireAdmin, logAction('templates.create'), async (req, res) => {
	const { name, body, category, tags } = req.body;

	if (!name || !body) {
		return apiError(res, 400, 'validation_error', 'Name and body are required');
	}

	const { data, error } = await supabaseAdmin
		.from('sms_templates')
		.insert({
			name,
			body,
			category: category || 'general',
			tags: tags || [],
			created_by: req.user?.id || null
		})
		.select()
		.single();

	if (error) {
		console.error('Failed to create template:', error.message);
		return apiError(res, 500, 'server_error', 'Failed to create template');
	}

	return res.status(201).json({ data });
});

/**
 * PATCH /api/templates/:id
 * Update a template.
 * Body: { name?, body?, category?, tags?, is_active? }
 */
router.patch('/:id', requireAdmin, logAction('templates.update'), async (req, res) => {
	const updates = {};
	const allowed = ['name', 'body', 'category', 'tags', 'is_active'];

	for (const key of allowed) {
		if (req.body[key] !== undefined) {
			updates[key] = req.body[key];
		}
	}

	if (Object.keys(updates).length === 0) {
		return apiError(res, 400, 'validation_error', 'No valid fields to update');
	}

	const { data, error } = await supabaseAdmin
		.from('sms_templates')
		.update(updates)
		.eq('id', req.params.id)
		.select()
		.single();

	if (error) {
		console.error('Failed to update template:', error.message);
		return apiError(res, 500, 'server_error', 'Failed to update template');
	}

	return res.json({ data });
});

/**
 * DELETE /api/templates/:id
 * Delete a template (soft: set is_active=false).
 */
router.delete('/:id', requireAdmin, logAction('templates.delete'), async (req, res) => {
	const { error } = await supabaseAdmin
		.from('sms_templates')
		.update({ is_active: false })
		.eq('id', req.params.id);

	if (error) {
		console.error('Failed to delete template:', error.message);
		return apiError(res, 500, 'server_error', 'Failed to delete template');
	}

	return res.status(204).end();
});

export default router;
