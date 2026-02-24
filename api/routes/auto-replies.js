import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { logAction } from '../middleware/auditLog.js';
import { supabaseAdmin } from '../services/supabase.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { apiError } from '../utils/responses.js';

const router = Router();

router.use(verifyToken);

/**
 * GET /api/auto-replies
 * List all auto-reply rules sorted by priority ascending.
 */
router.get('/', logAction('auto-replies.list'), async (req, res) => {
	const page = Math.max(1, parseInt(req.query.page) || 1);
	const per_page = Math.min(100, Math.max(1, parseInt(req.query.per_page) || 50));
	const offset = (page - 1) * per_page;

	const { data, count, error } = await supabaseAdmin
		.from('auto_reply_rules')
		.select('*', { count: 'exact' })
		.order('priority', { ascending: true })
		.range(offset, offset + per_page - 1);

	if (error) {
		console.error('Failed to fetch auto-reply rules:', error.message);
		return apiError(res, 500, 'server_error', 'Failed to fetch auto-reply rules');
	}

	return res.json({
		data: data || [],
		meta: { total: count, page, per_page, total_pages: Math.ceil((count || 0) / per_page) }
	});
});

/**
 * POST /api/auto-replies
 * Create a new auto-reply rule.
 * Body: { trigger_type?, trigger_keywords?, response_body, is_active?, priority?, hours_restriction?, metadata? }
 */
router.post('/', requireAdmin, logAction('auto-replies.create'), async (req, res) => {
	const {
		trigger_type,
		trigger_keywords,
		response_body,
		is_active,
		priority,
		hours_restriction,
		metadata
	} = req.body;

	if (!response_body) {
		return apiError(res, 400, 'validation_error', 'response_body is required');
	}

	if (
		(!trigger_type || trigger_type === 'keyword') &&
		(!Array.isArray(trigger_keywords) || trigger_keywords.length === 0)
	) {
		return apiError(res, 400, 'validation_error', 'Keyword rules require at least one keyword');
	}

	// Strip surrounding quotes from keywords (users sometimes wrap phrases in quotes)
	const cleanKeywords = (trigger_keywords || [])
		.map((k) =>
			k
				.trim()
				.replace(/^["']+|["']+$/g, '')
				.trim()
		)
		.filter(Boolean);

	const { data, error } = await supabaseAdmin
		.from('auto_reply_rules')
		.insert({
			trigger_type: trigger_type || 'keyword',
			trigger_keywords: cleanKeywords,
			response_body,
			is_active: is_active !== undefined ? is_active : true,
			priority: priority || 10,
			hours_restriction: hours_restriction || 'always',
			metadata: metadata || {},
			created_by: req.user?.id || null
		})
		.select()
		.single();

	if (error) {
		console.error('Failed to create auto-reply rule:', error.message);
		return apiError(res, 500, 'server_error', 'Failed to create auto-reply rule');
	}

	return res.status(201).json({ data });
});

/**
 * PATCH /api/auto-replies/:id
 * Update an auto-reply rule.
 * Body: { trigger_type?, trigger_keywords?, response_body?, is_active?, priority?, hours_restriction?, metadata? }
 */
router.patch('/:id', requireAdmin, logAction('auto-replies.update'), async (req, res) => {
	const updates = {};
	const allowed = [
		'trigger_type',
		'trigger_keywords',
		'response_body',
		'is_active',
		'priority',
		'hours_restriction',
		'metadata'
	];

	for (const key of allowed) {
		if (req.body[key] !== undefined) {
			updates[key] = req.body[key];
		}
	}

	// Strip surrounding quotes from keywords
	if (updates.trigger_keywords && Array.isArray(updates.trigger_keywords)) {
		updates.trigger_keywords = updates.trigger_keywords
			.map((k) =>
				k
					.trim()
					.replace(/^["']+|["']+$/g, '')
					.trim()
			)
			.filter(Boolean);
	}

	if (Object.keys(updates).length === 0) {
		return apiError(res, 400, 'validation_error', 'No valid fields to update');
	}

	const { data, error } = await supabaseAdmin
		.from('auto_reply_rules')
		.update(updates)
		.eq('id', req.params.id)
		.select()
		.single();

	if (error) {
		console.error('Failed to update auto-reply rule:', error.message);
		return apiError(res, 500, 'server_error', 'Failed to update auto-reply rule');
	}

	return res.json({ data });
});

/**
 * DELETE /api/auto-replies/:id
 * Soft delete — sets is_active=false.
 */
router.delete('/:id', requireAdmin, logAction('auto-replies.delete'), async (req, res) => {
	const { error } = await supabaseAdmin
		.from('auto_reply_rules')
		.update({ is_active: false })
		.eq('id', req.params.id);

	if (error) {
		console.error('Failed to delete auto-reply rule:', error.message);
		return apiError(res, 500, 'server_error', 'Failed to delete auto-reply rule');
	}

	return res.status(204).end();
});

export default router;
