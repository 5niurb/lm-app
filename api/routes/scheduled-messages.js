import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { logAction } from '../middleware/auditLog.js';
import { supabaseAdmin } from '../services/supabase.js';
import { normalizePhone } from '../services/phone-lookup.js';
import { apiError } from '../utils/responses.js';

const router = Router();

router.use(verifyToken);

/**
 * GET /api/scheduled-messages
 * List scheduled messages.
 * Query: status (pending|sent|failed|cancelled), page, pageSize
 */
router.get('/', logAction('scheduled.list'), async (req, res) => {
	const page = Math.max(1, parseInt(req.query.page, 10) || 1);
	const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 50));
	const offset = (page - 1) * pageSize;

	let query = supabaseAdmin
		.from('scheduled_messages')
		.select('*, template:sms_templates(id, name)', { count: 'exact' });

	if (req.query.conversationId) {
		query = query.eq('conversation_id', req.query.conversationId);
	}

	if (req.query.status && req.query.status !== 'all') {
		query = query.eq('status', req.query.status);
	} else {
		// Default: show pending
		query = query.eq('status', 'pending');
	}

	query = query.order('scheduled_at', { ascending: true }).range(offset, offset + pageSize - 1);

	const { data, error, count } = await query;

	if (error) {
		console.error('Failed to fetch scheduled messages:', error.message);
		return apiError(res, 500, 'server_error', 'Failed to fetch scheduled messages');
	}

	return res.json({ data: data || [], count: count || 0, page, pageSize });
});

/**
 * POST /api/scheduled-messages
 * Schedule a message for future delivery.
 * Body: { to, body, scheduledAt, from?, templateId?, conversationId? }
 */
router.post('/', logAction('scheduled.create'), async (req, res) => {
	const { to, body, scheduledAt, from, templateId, conversationId } = req.body;

	if (!to || !body || !scheduledAt) {
		return apiError(res, 400, 'validation_error', 'to, body, and scheduledAt are required');
	}

	const scheduledDate = new Date(scheduledAt);
	if (scheduledDate <= new Date()) {
		return apiError(res, 400, 'validation_error', 'scheduledAt must be in the future');
	}

	const toNumber = normalizePhone(to);

	const { data, error } = await supabaseAdmin
		.from('scheduled_messages')
		.insert({
			to_number: toNumber,
			from_number: from || null,
			body,
			template_id: templateId || null,
			conversation_id: conversationId || null,
			scheduled_at: scheduledDate.toISOString(),
			created_by: req.user?.id || null
		})
		.select()
		.single();

	if (error) {
		console.error('Failed to schedule message:', error.message);
		return apiError(res, 500, 'server_error', 'Failed to schedule message');
	}

	return res.status(201).json({ data });
});

/**
 * PATCH /api/scheduled-messages/:id
 * Update a scheduled message (only if still pending).
 * Body: { body?, scheduledAt?, status? }
 */
router.patch('/:id', logAction('scheduled.update'), async (req, res) => {
	const updates = {};

	// Accept both camelCase and snake_case field names
	const scheduledAt = req.body.scheduledAt || req.body.scheduled_at;
	if (scheduledAt) updates.scheduled_at = scheduledAt;
	if (req.body.body) updates.body = req.body.body;
	const toNumber = req.body.toNumber || req.body.to_number;
	if (toNumber) updates.to_number = toNumber;
	const fromNumber = req.body.fromNumber || req.body.from_number;
	if (fromNumber) updates.from_number = fromNumber;

	if (Object.keys(updates).length === 0) {
		return apiError(res, 400, 'validation_error', 'No valid fields to update');
	}

	const { data, error } = await supabaseAdmin
		.from('scheduled_messages')
		.update(updates)
		.eq('id', req.params.id)
		.eq('status', 'pending') // Only update pending messages
		.select()
		.single();

	if (error) {
		console.error('Failed to update scheduled message:', error.message);
		return apiError(res, 500, 'server_error', 'Failed to update scheduled message');
	}

	return res.json({ data });
});

/**
 * DELETE /api/scheduled-messages/:id
 * Cancel a scheduled message (sets status to cancelled).
 */
router.delete('/:id', logAction('scheduled.cancel'), async (req, res) => {
	const { error } = await supabaseAdmin
		.from('scheduled_messages')
		.update({ status: 'cancelled' })
		.eq('id', req.params.id)
		.eq('status', 'pending');

	if (error) {
		console.error('Failed to cancel scheduled message:', error.message);
		return apiError(res, 500, 'server_error', 'Failed to cancel scheduled message');
	}

	return res.status(204).end();
});

/**
 * GET /api/scheduled-messages/stats
 * Get counts for scheduled message statuses.
 */
router.get('/stats', logAction('scheduled.stats'), async (req, res) => {
	const { count: pending } = await supabaseAdmin
		.from('scheduled_messages')
		.select('id', { count: 'exact', head: true })
		.eq('status', 'pending');

	const { count: sent } = await supabaseAdmin
		.from('scheduled_messages')
		.select('id', { count: 'exact', head: true })
		.eq('status', 'sent');

	return res.json({ pending: pending || 0, sent: sent || 0 });
});

export default router;
