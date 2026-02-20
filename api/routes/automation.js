import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { logAction } from '../middleware/auditLog.js';
import { supabaseAdmin } from '../services/supabase.js';
import { executeSequence, processScheduledAutomation } from '../services/automation.js';

const router = Router();

// All automation routes require authentication
router.use(verifyToken);

/** Admin-only guard middleware */
function requireAdmin(req, res, next) {
	if (req.user.role !== 'admin') {
		return res.status(403).json({ error: 'Admin access required' });
	}
	next();
}

// =============================================================================
// AUTOMATION SEQUENCES (message templates + timing config)
// =============================================================================

/**
 * GET /api/automation/sequences
 * List all automation sequences, optionally filtered.
 *
 * Query params: service_id, trigger_event, active (true/false)
 */
router.get('/sequences', logAction('automation.sequences.list'), async (req, res) => {
	try {
		let query = supabaseAdmin.from('automation_sequences').select(`
        *,
        service:services(id, name, slug, category),
        content:service_content(id, title, content_type, summary)
      `);

		if (req.query.service_id) {
			query = query.eq('service_id', req.query.service_id);
		}
		if (req.query.trigger_event) {
			query = query.eq('trigger_event', req.query.trigger_event);
		}
		if (req.query.active !== undefined) {
			query = query.eq('is_active', req.query.active === 'true');
		}

		query = query.order('sort_order', { ascending: true });

		const { data, error } = await query;
		if (error) throw error;

		res.json({ data: data || [] });
	} catch (err) {
		console.error('Automation sequences list error:', err.message);
		res.status(500).json({ error: 'Failed to load automation sequences' });
	}
});

/**
 * GET /api/automation/sequences/:id
 * Get a single sequence with related data.
 */
router.get('/sequences/:id', logAction('automation.sequences.read'), async (req, res) => {
	try {
		const { data, error } = await supabaseAdmin
			.from('automation_sequences')
			.select(
				`
        *,
        service:services(id, name, slug, category),
        content:service_content(id, title, content_type, summary, page_slug)
      `
			)
			.eq('id', req.params.id)
			.single();

		if (error) throw error;
		if (!data) return res.status(404).json({ error: 'Sequence not found' });

		res.json({ data });
	} catch (err) {
		console.error('Automation sequence read error:', err.message);
		res.status(500).json({ error: 'Failed to load sequence' });
	}
});

/**
 * POST /api/automation/sequences
 * Create a new automation sequence (admin only).
 */
router.post(
	'/sequences',
	requireAdmin,
	logAction('automation.sequences.create'),
	async (req, res) => {
		const {
			service_id,
			name,
			trigger_event,
			timing_offset,
			channel,
			template_type,
			content_ref,
			subject_line,
			message_body,
			rcs_actions,
			is_active,
			sort_order
		} = req.body;

		if (!name || !trigger_event || !timing_offset || !template_type) {
			return res
				.status(400)
				.json({ error: 'name, trigger_event, timing_offset, and template_type are required' });
		}

		try {
			const { data, error } = await supabaseAdmin
				.from('automation_sequences')
				.insert({
					service_id: service_id || null,
					name,
					trigger_event,
					timing_offset,
					channel: channel || 'both',
					template_type,
					content_ref: content_ref || null,
					subject_line: subject_line || null,
					message_body: message_body || null,
					rcs_actions: rcs_actions || null,
					is_active: is_active !== false,
					sort_order: sort_order || 0
				})
				.select(
					`
        *,
        service:services(id, name, slug, category),
        content:service_content(id, title, content_type, summary)
      `
				)
				.single();

			if (error) throw error;
			res.status(201).json({ data });
		} catch (err) {
			console.error('Automation sequence create error:', err.message);
			res.status(500).json({ error: 'Failed to create sequence' });
		}
	}
);

/**
 * PUT /api/automation/sequences/:id
 * Update an automation sequence (admin only).
 */
router.put(
	'/sequences/:id',
	requireAdmin,
	logAction('automation.sequences.update'),
	async (req, res) => {
		const {
			service_id,
			name,
			trigger_event,
			timing_offset,
			channel,
			template_type,
			content_ref,
			subject_line,
			message_body,
			rcs_actions,
			is_active,
			sort_order
		} = req.body;

		try {
			const updates = {};
			if (service_id !== undefined) updates.service_id = service_id || null;
			if (name !== undefined) updates.name = name;
			if (trigger_event !== undefined) updates.trigger_event = trigger_event;
			if (timing_offset !== undefined) updates.timing_offset = timing_offset;
			if (channel !== undefined) updates.channel = channel;
			if (template_type !== undefined) updates.template_type = template_type;
			if (content_ref !== undefined) updates.content_ref = content_ref || null;
			if (subject_line !== undefined) updates.subject_line = subject_line;
			if (message_body !== undefined) updates.message_body = message_body;
			if (rcs_actions !== undefined) updates.rcs_actions = rcs_actions;
			if (is_active !== undefined) updates.is_active = is_active;
			if (sort_order !== undefined) updates.sort_order = sort_order;

			if (Object.keys(updates).length === 0) {
				return res.status(400).json({ error: 'No fields to update' });
			}

			const { data, error } = await supabaseAdmin
				.from('automation_sequences')
				.update(updates)
				.eq('id', req.params.id)
				.select(
					`
        *,
        service:services(id, name, slug, category),
        content:service_content(id, title, content_type, summary)
      `
				)
				.single();

			if (error) throw error;
			if (!data) return res.status(404).json({ error: 'Sequence not found' });

			res.json({ data });
		} catch (err) {
			console.error('Automation sequence update error:', err.message);
			res.status(500).json({ error: 'Failed to update sequence' });
		}
	}
);

/**
 * DELETE /api/automation/sequences/:id
 * Delete an automation sequence (admin only).
 */
router.delete(
	'/sequences/:id',
	requireAdmin,
	logAction('automation.sequences.delete'),
	async (req, res) => {
		try {
			const { error } = await supabaseAdmin
				.from('automation_sequences')
				.delete()
				.eq('id', req.params.id);

			if (error) throw error;
			res.status(204).end();
		} catch (err) {
			console.error('Automation sequence delete error:', err.message);
			res.status(500).json({ error: 'Failed to delete sequence' });
		}
	}
);

/**
 * POST /api/automation/sequences/reorder
 * Bulk update sort_order for drag-and-drop reordering (admin only).
 * Body: { items: [{id, sort_order}, ...] }
 */
router.post(
	'/sequences/reorder',
	requireAdmin,
	logAction('automation.sequences.reorder'),
	async (req, res) => {
		const { items } = req.body;

		if (!items || !Array.isArray(items)) {
			return res.status(400).json({ error: 'items array is required' });
		}

		try {
			// Update each item's sort_order
			const promises = items.map((item) =>
				supabaseAdmin
					.from('automation_sequences')
					.update({ sort_order: item.sort_order })
					.eq('id', item.id)
			);

			await Promise.all(promises);
			res.json({ success: true });
		} catch (err) {
			console.error('Automation reorder error:', err.message);
			res.status(500).json({ error: 'Failed to reorder sequences' });
		}
	}
);

// =============================================================================
// AUTOMATION LOG (execution history)
// =============================================================================

/**
 * GET /api/automation/log
 * List automation execution log with pagination and filters.
 *
 * Query params: page, pageSize, client_id, status, channel, from, to
 */
router.get('/log', logAction('automation.log.list'), async (req, res) => {
	const page = Math.max(1, parseInt(req.query.page, 10) || 1);
	const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 25));
	const offset = (page - 1) * pageSize;

	try {
		let query = supabaseAdmin.from('automation_log').select(
			`
        *,
        client:contacts(id, full_name, phone, email),
        sequence:automation_sequences(id, name, trigger_event, channel, template_type)
      `,
			{ count: 'exact' }
		);

		if (req.query.client_id) {
			query = query.eq('client_id', req.query.client_id);
		}
		if (req.query.status) {
			query = query.eq('status', req.query.status);
		}
		if (req.query.channel) {
			query = query.eq('channel', req.query.channel);
		}
		if (req.query.from) {
			query = query.gte('created_at', req.query.from);
		}
		if (req.query.to) {
			query = query.lte('created_at', req.query.to);
		}

		query = query.order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);

		const { data, error, count } = await query;
		if (error) throw error;

		res.json({
			data: data || [],
			count: count || 0,
			page,
			pageSize
		});
	} catch (err) {
		console.error('Automation log list error:', err.message);
		res.status(500).json({ error: 'Failed to load automation log' });
	}
});

/**
 * GET /api/automation/stats
 * Automation performance statistics.
 *
 * Query params: days (default 30)
 */
router.get('/stats', logAction('automation.stats'), async (req, res) => {
	const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 30));
	const since = new Date();
	since.setDate(since.getDate() - days);

	try {
		const { data, error } = await supabaseAdmin
			.from('automation_log')
			.select('status, channel')
			.gte('created_at', since.toISOString());

		if (error) throw error;

		const log = data || [];
		const total = log.length;
		const sent = log.filter((l) => l.status === 'sent').length;
		const delivered = log.filter((l) => l.status === 'delivered').length;
		const opened = log.filter((l) => l.status === 'opened').length;
		const clicked = log.filter((l) => l.status === 'clicked').length;
		const failed = log.filter((l) => l.status === 'failed').length;
		const scheduled = log.filter((l) => l.status === 'scheduled').length;

		const byChannel = {
			sms: log.filter((l) => l.channel === 'sms').length,
			email: log.filter((l) => l.channel === 'email').length,
			rcs: log.filter((l) => l.channel === 'rcs').length
		};

		const deliveryRate =
			sent + delivered + opened + clicked > 0
				? Math.round(((delivered + opened + clicked) / (sent + delivered + opened + clicked)) * 100)
				: 0;

		const openRate = delivered > 0 ? Math.round(((opened + clicked) / delivered) * 100) : 0;

		res.json({
			total,
			scheduled,
			sent,
			delivered,
			opened,
			clicked,
			failed,
			byChannel,
			deliveryRate,
			openRate,
			days
		});
	} catch (err) {
		console.error('Automation stats error:', err.message);
		res.status(500).json({ error: 'Failed to load automation stats' });
	}
});

/**
 * POST /api/automation/trigger
 * Manually trigger an automation sequence for testing (admin only).
 *
 * Body: { sequence_id, client_id }
 */
router.post('/trigger', requireAdmin, logAction('automation.trigger'), async (req, res) => {
	const { sequence_id, client_id, dry_run } = req.body;

	if (!sequence_id || !client_id) {
		return res.status(400).json({ error: 'sequence_id and client_id are required' });
	}

	try {
		// Get the sequence with linked content
		const { data: sequence, error: seqErr } = await supabaseAdmin
			.from('automation_sequences')
			.select(
				`
        *,
        content:service_content(id, title, content_type, summary, content_json)
      `
			)
			.eq('id', sequence_id)
			.single();

		if (seqErr || !sequence) {
			return res.status(404).json({ error: 'Sequence not found' });
		}

		// Get the client
		const { data: client, error: clientErr } = await supabaseAdmin
			.from('contacts')
			.select('id, full_name, phone, email')
			.eq('id', client_id)
			.single();

		if (clientErr || !client) {
			return res.status(404).json({ error: 'Client not found' });
		}

		// Dry run — return what would be sent without actually sending
		if (dry_run) {
			return res.json({
				dry_run: true,
				sequence: {
					name: sequence.name,
					channel: sequence.channel,
					template_type: sequence.template_type
				},
				client: { name: client.full_name, phone: client.phone, email: client.email },
				content: sequence.content
					? { title: sequence.content.title, type: sequence.content.content_type }
					: null,
				channels: {
					sms: (sequence.channel === 'sms' || sequence.channel === 'both') && !!client.phone,
					email: (sequence.channel === 'email' || sequence.channel === 'both') && !!client.email
				}
			});
		}

		// Execute immediately (sends SMS/email and logs)
		const results = await executeSequence({
			sequence,
			client,
			content: sequence.content || null,
			triggeredBy: req.user.id,
			manual: true
		});

		const sent = results.logEntries.filter((e) => e.status === 'sent').length;
		const failed = results.logEntries.filter((e) => e.status === 'failed').length;

		res.status(201).json({
			data: results.logEntries,
			sms: results.smsResult || null,
			email: results.emailResult || null,
			message: `Sequence "${sequence.name}" executed for ${client.full_name}: ${sent} sent, ${failed} failed.`
		});
	} catch (err) {
		console.error('Automation trigger error:', err.message);
		res.status(500).json({ error: 'Failed to trigger automation' });
	}
});

/**
 * POST /api/automation/process
 * Process all scheduled automation entries that are due.
 * Can be called by cron (pg_cron → pg_net) or manually by admin.
 */
router.post('/process', requireAdmin, logAction('automation.process'), async (req, res) => {
	try {
		const results = await processScheduledAutomation();
		res.json({
			message: `Processed ${results.processed} entries: ${results.sent} sent, ${results.failed} failed.`,
			...results
		});
	} catch (err) {
		console.error('Automation process error:', err.message);
		res.status(500).json({ error: 'Failed to process automation queue' });
	}
});

// =============================================================================
// CONSENT SUBMISSIONS
// =============================================================================

/**
 * GET /api/automation/consents
 * List consent submissions with filters.
 *
 * Query params: client_id, service_id, status, page, pageSize
 */
router.get('/consents', logAction('automation.consents.list'), async (req, res) => {
	const page = Math.max(1, parseInt(req.query.page, 10) || 1);
	const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 25));
	const offset = (page - 1) * pageSize;

	try {
		let query = supabaseAdmin.from('consent_submissions').select(
			`
        *,
        client:contacts(id, full_name, phone, email),
        form:service_content(id, title, content_type),
        service:services(id, name, slug)
      `,
			{ count: 'exact' }
		);

		if (req.query.client_id) {
			query = query.eq('client_id', req.query.client_id);
		}
		if (req.query.service_id) {
			query = query.eq('service_id', req.query.service_id);
		}
		if (req.query.status) {
			query = query.eq('status', req.query.status);
		}

		query = query.order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);

		const { data, error, count } = await query;
		if (error) throw error;

		res.json({
			data: data || [],
			count: count || 0,
			page,
			pageSize
		});
	} catch (err) {
		console.error('Consent submissions list error:', err.message);
		res.status(500).json({ error: 'Failed to load consent submissions' });
	}
});

/**
 * GET /api/automation/consents/:id
 * Get a single consent submission.
 */
router.get('/consents/:id', logAction('automation.consents.read'), async (req, res) => {
	try {
		const { data, error } = await supabaseAdmin
			.from('consent_submissions')
			.select(
				`
        *,
        client:contacts(id, full_name, phone, email),
        form:service_content(id, title, content_type, content_json),
        service:services(id, name, slug)
      `
			)
			.eq('id', req.params.id)
			.single();

		if (error) throw error;
		if (!data) return res.status(404).json({ error: 'Consent submission not found' });

		res.json({ data });
	} catch (err) {
		console.error('Consent submission read error:', err.message);
		res.status(500).json({ error: 'Failed to load consent submission' });
	}
});

/**
 * PATCH /api/automation/consents/:id
 * Update a consent submission status (admin only).
 * Primary use: voiding a consent.
 *
 * Body: { status: 'voided' | 'completed' | 'expired' }
 */
router.patch(
	'/consents/:id',
	requireAdmin,
	logAction('automation.consents.update'),
	async (req, res) => {
		const { status } = req.body;

		const validStatuses = ['completed', 'voided', 'expired', 'pending'];
		if (!status || !validStatuses.includes(status)) {
			return res
				.status(400)
				.json({ error: `status is required and must be one of: ${validStatuses.join(', ')}` });
		}

		try {
			const { data, error } = await supabaseAdmin
				.from('consent_submissions')
				.update({ status })
				.eq('id', req.params.id)
				.select(
					`
          *,
          client:contacts(id, full_name, phone, email),
          form:service_content(id, title, content_type),
          service:services(id, name, slug)
        `
				)
				.single();

			if (error) throw error;
			if (!data) return res.status(404).json({ error: 'Consent submission not found' });

			res.json({ data });
		} catch (err) {
			console.error('Consent submission update error:', err.message);
			res.status(500).json({ error: 'Failed to update consent submission' });
		}
	}
);

export default router;
