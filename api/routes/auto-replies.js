import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { logAction } from '../middleware/auditLog.js';
import { supabaseAdmin } from '../services/supabase.js';

const router = Router();

router.use(verifyToken);

/**
 * GET /api/auto-replies
 * List all auto-reply rules sorted by priority ascending.
 */
router.get('/', logAction('auto-replies.list'), async (req, res) => {
	const { data, error } = await supabaseAdmin
		.from('auto_reply_rules')
		.select('*')
		.order('priority', { ascending: true });

	if (error) {
		console.error('Failed to fetch auto-reply rules:', error.message);
		return res.status(500).json({ error: 'Failed to fetch auto-reply rules' });
	}

	return res.json({ data: data || [] });
});

/**
 * POST /api/auto-replies
 * Create a new auto-reply rule.
 * Body: { trigger_type?, trigger_keywords?, response_body, is_active?, priority?, hours_restriction?, metadata? }
 */
router.post('/', logAction('auto-replies.create'), async (req, res) => {
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
		return res.status(400).json({ error: 'response_body is required' });
	}

	const { data, error } = await supabaseAdmin
		.from('auto_reply_rules')
		.insert({
			trigger_type: trigger_type || 'keyword',
			trigger_keywords: trigger_keywords || [],
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
		return res.status(500).json({ error: 'Failed to create auto-reply rule' });
	}

	return res.status(201).json({ data });
});

/**
 * PUT /api/auto-replies/:id
 * Update an auto-reply rule.
 * Body: { trigger_type?, trigger_keywords?, response_body?, is_active?, priority?, hours_restriction?, metadata? }
 */
router.put('/:id', logAction('auto-replies.update'), async (req, res) => {
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

	if (Object.keys(updates).length === 0) {
		return res.status(400).json({ error: 'No valid fields to update' });
	}

	const { data, error } = await supabaseAdmin
		.from('auto_reply_rules')
		.update(updates)
		.eq('id', req.params.id)
		.select()
		.single();

	if (error) {
		console.error('Failed to update auto-reply rule:', error.message);
		return res.status(500).json({ error: 'Failed to update auto-reply rule' });
	}

	return res.json({ data });
});

/**
 * DELETE /api/auto-replies/:id
 * Soft delete — sets is_active=false.
 */
router.delete('/:id', logAction('auto-replies.delete'), async (req, res) => {
	const { error } = await supabaseAdmin
		.from('auto_reply_rules')
		.update({ is_active: false })
		.eq('id', req.params.id);

	if (error) {
		console.error('Failed to delete auto-reply rule:', error.message);
		return res.status(500).json({ error: 'Failed to delete auto-reply rule' });
	}

	return res.json({ success: true });
});

export default router;
