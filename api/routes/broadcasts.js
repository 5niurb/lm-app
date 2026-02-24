import { Router } from 'express';
import twilio from 'twilio';
import { verifyToken } from '../middleware/auth.js';
import { logAction } from '../middleware/auditLog.js';
import { supabaseAdmin } from '../services/supabase.js';
import { findConversation, normalizePhone } from '../services/phone-lookup.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { apiError } from '../utils/responses.js';

const router = Router();

router.use(verifyToken);

/**
 * GET /api/broadcasts
 * List all broadcasts, newest first.
 */
router.get('/', logAction('broadcasts.list'), async (req, res) => {
	const page = Math.max(1, parseInt(req.query.page) || 1);
	const per_page = Math.min(100, Math.max(1, parseInt(req.query.per_page) || 50));
	const offset = (page - 1) * per_page;

	const { data, count, error } = await supabaseAdmin
		.from('broadcasts')
		.select('*', { count: 'exact' })
		.order('created_at', { ascending: false })
		.range(offset, offset + per_page - 1);

	if (error) {
		console.error('Failed to fetch broadcasts:', error.message);
		return apiError(res, 500, 'server_error', 'Failed to fetch broadcasts');
	}

	return res.json({
		data: data || [],
		meta: { total: count, page, per_page, total_pages: Math.ceil((count || 0) / per_page) }
	});
});

/**
 * POST /api/broadcasts
 * Create a new broadcast (draft).
 * Body: { name, body, templateId?, recipientFilter?, fromNumber? }
 */
router.post('/', requireAdmin, logAction('broadcasts.create'), async (req, res) => {
	const { name, body, templateId, recipientFilter, fromNumber } = req.body;

	if (!name || !body) {
		return apiError(res, 400, 'validation_error', 'Name and body are required');
	}

	const { data, error } = await supabaseAdmin
		.from('broadcasts')
		.insert({
			name,
			body,
			template_id: templateId || null,
			recipient_filter: recipientFilter || {},
			from_number: fromNumber || null,
			created_by: req.user?.id || null
		})
		.select()
		.single();

	if (error) {
		console.error('Failed to create broadcast:', error.message);
		return apiError(res, 500, 'server_error', 'Failed to create broadcast');
	}

	return res.status(201).json({ data });
});

/**
 * PATCH /api/broadcasts/:id
 * Update a draft broadcast.
 */
router.patch('/:id', requireAdmin, logAction('broadcasts.update'), async (req, res) => {
	const { id } = req.params;

	// Only allow editing drafts
	const { data: existing } = await supabaseAdmin
		.from('broadcasts')
		.select('status')
		.eq('id', id)
		.single();

	if (!existing) return apiError(res, 404, 'not_found', 'Broadcast not found');
	if (existing.status !== 'draft') {
		return apiError(res, 400, 'validation_error', 'Only draft broadcasts can be edited');
	}

	const allowed = ['name', 'body', 'template_id', 'recipient_filter', 'from_number'];
	const updates = {};
	for (const key of allowed) {
		if (req.body[key] !== undefined) updates[key] = req.body[key];
	}

	if (Object.keys(updates).length === 0) {
		return apiError(res, 400, 'validation_error', 'No valid fields to update');
	}

	const { data, error } = await supabaseAdmin
		.from('broadcasts')
		.update(updates)
		.eq('id', id)
		.select()
		.single();

	if (error) {
		console.error('Failed to update broadcast:', error.message);
		return apiError(res, 500, 'server_error', 'Failed to update broadcast');
	}

	return res.json({ data });
});

/**
 * DELETE /api/broadcasts/:id
 * Delete a draft broadcast.
 */
router.delete('/:id', requireAdmin, logAction('broadcasts.delete'), async (req, res) => {
	const { id } = req.params;

	const { data: existing } = await supabaseAdmin
		.from('broadcasts')
		.select('status')
		.eq('id', id)
		.single();

	if (!existing) return apiError(res, 404, 'not_found', 'Broadcast not found');
	if (existing.status !== 'draft') {
		return apiError(res, 400, 'validation_error', 'Only draft broadcasts can be deleted');
	}

	const { error } = await supabaseAdmin.from('broadcasts').delete().eq('id', id);

	if (error) {
		console.error('Failed to delete broadcast:', error.message);
		return apiError(res, 500, 'server_error', 'Failed to delete broadcast');
	}

	return res.status(204).end();
});

// ── BC-002: Recipient resolution ──

/**
 * Resolve recipient_filter to a list of contacts.
 * @param {object} filter
 * @returns {Promise<{contacts: any[], count: number}>}
 */
async function resolveRecipients(filter) {
	let query = supabaseAdmin
		.from('contacts')
		.select('id, full_name, first_name, last_name, phone, phone_normalized, tags');

	// Filter by tags
	if (filter.tags?.length > 0) {
		if (filter.tags_match === 'all') {
			query = query.contains('tags', filter.tags);
		} else {
			query = query.overlaps('tags', filter.tags);
		}
	}

	// Filter by source
	if (filter.source) {
		query = query.eq('source', filter.source);
	}

	const { data: contacts, error } = await query;

	if (error) throw new Error('Failed to resolve recipients');

	let filtered = (contacts || []).filter((c) => c.phone || c.phone_normalized);

	// Exclude contacts matching exclude_tags
	if (filter.exclude_tags?.length > 0) {
		filtered = filtered.filter((c) => {
			if (!c.tags || c.tags.length === 0) return true;
			return !filter.exclude_tags.some((t) => c.tags.includes(t));
		});
	}

	// De-duplicate by phone_normalized
	const seen = new Set();
	const deduped = [];
	for (const c of filtered) {
		const phone = c.phone_normalized || c.phone;
		if (!seen.has(phone)) {
			seen.add(phone);
			deduped.push(c);
		}
	}

	return { contacts: deduped, count: deduped.length };
}

/**
 * POST /api/broadcasts/:id/preview
 * Resolve filter → return count + sample contacts.
 */
router.post('/:id/preview', logAction('broadcasts.preview'), async (req, res) => {
	const { id } = req.params;

	const { data: broadcast } = await supabaseAdmin
		.from('broadcasts')
		.select('recipient_filter')
		.eq('id', id)
		.single();

	if (!broadcast) return apiError(res, 404, 'not_found', 'Broadcast not found');

	try {
		const { contacts, count } = await resolveRecipients(broadcast.recipient_filter || {});

		// Update recipient_count on broadcast
		await supabaseAdmin.from('broadcasts').update({ recipient_count: count }).eq('id', id);

		const sample = contacts.slice(0, 5).map((c) => ({
			name: c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim(),
			phone: c.phone || c.phone_normalized
		}));

		return res.json({ count, sample });
	} catch (err) {
		console.error('Failed to resolve recipients:', err.message);
		return apiError(res, 500, 'server_error', 'Failed to preview recipients');
	}
});

// ── BC-004: Send broadcast ──

/**
 * Resolve merge tags in a message body using contact data.
 * @param {string} body
 * @param {object} contact
 * @returns {string}
 */
function resolveMergeTags(body, contact) {
	return body
		.replace(/\{\{first_name\}\}/gi, contact.first_name || '')
		.replace(/\{\{last_name\}\}/gi, contact.last_name || '')
		.replace(
			/\{\{full_name\}\}/gi,
			contact.full_name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim()
		)
		.replace(/\{\{phone\}\}/gi, contact.phone || '');
}

/** Sleep for ms milliseconds */
function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * POST /api/broadcasts/:id/send
 * Start sending a broadcast. Returns immediately; sends in background.
 */
router.post('/:id/send', requireAdmin, logAction('broadcasts.send'), async (req, res) => {
	const { id } = req.params;

	const { data: broadcast } = await supabaseAdmin
		.from('broadcasts')
		.select('*')
		.eq('id', id)
		.single();

	if (!broadcast) return apiError(res, 404, 'not_found', 'Broadcast not found');
	if (broadcast.status !== 'draft') {
		return apiError(res, 400, 'validation_error', 'Only draft broadcasts can be sent');
	}

	// Set to sending immediately
	await supabaseAdmin
		.from('broadcasts')
		.update({ status: 'sending', started_at: new Date().toISOString() })
		.eq('id', id);

	// Return immediately — send loop runs in background
	res.json({ status: 'sending' });

	// Background send loop
	try {
		const { contacts } = await resolveRecipients(broadcast.recipient_filter || {});

		const fromNumber =
			broadcast.from_number ||
			process.env.TWILIO_SMS_FROM_NUMBER ||
			process.env.TWILIO_PHONE_NUMBER;

		const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

		const baseUrl = process.env.RENDER_EXTERNAL_URL || process.env.API_BASE_URL || '';
		const statusCallback = baseUrl ? `${baseUrl}/api/webhooks/sms/status` : undefined;

		let sentCount = 0;
		let failedCount = 0;

		for (let i = 0; i < contacts.length; i++) {
			const contact = contacts[i];
			const phone = normalizePhone(contact.phone || contact.phone_normalized);
			const resolvedBody = resolveMergeTags(broadcast.body, contact);

			try {
				const twilioMsg = await client.messages.create({
					to: phone,
					from: fromNumber,
					body: resolvedBody,
					...(statusCallback && { statusCallback })
				});

				sentCount++;

				// BC-006: Create/update conversation and insert message record
				let convId;
				const existingConv = await findConversation(phone);
				if (existingConv) {
					convId = existingConv.id;
				} else {
					const { data: newConv } = await supabaseAdmin
						.from('conversations')
						.insert({
							phone_number: phone,
							twilio_number: fromNumber || null,
							display_name: contact.full_name || null,
							contact_id: contact.id || null,
							last_message: resolvedBody,
							last_at: new Date().toISOString()
						})
						.select('id')
						.single();
					convId = newConv?.id;
				}

				if (convId) {
					await supabaseAdmin.from('messages').insert({
						conversation_id: convId,
						direction: 'outbound',
						body: resolvedBody,
						from_number: fromNumber,
						to_number: phone,
						twilio_sid: twilioMsg.sid,
						status: twilioMsg.status || 'sent',
						sent_by: broadcast.created_by || null,
						metadata: { source: 'broadcast', broadcast_id: id }
					});

					await supabaseAdmin
						.from('conversations')
						.update({
							last_message: resolvedBody,
							last_at: new Date().toISOString(),
							status: 'active'
						})
						.eq('id', convId);
				}
			} catch (sendErr) {
				failedCount++;
				console.error(`Broadcast ${id}: failed to send to ${phone}:`, sendErr.message);
			}

			// Batch update progress every 10 messages
			if ((i + 1) % 10 === 0 || i === contacts.length - 1) {
				await supabaseAdmin
					.from('broadcasts')
					.update({ sent_count: sentCount, failed_count: failedCount })
					.eq('id', id);
			}

			// Rate limit: 100ms delay between sends
			if (i < contacts.length - 1) await sleep(100);
		}

		// Final status update
		await supabaseAdmin
			.from('broadcasts')
			.update({
				status: 'sent',
				sent_count: sentCount,
				failed_count: failedCount,
				completed_at: new Date().toISOString()
			})
			.eq('id', id);
	} catch (err) {
		console.error(`Broadcast ${id} failed:`, err.message);
		await supabaseAdmin.from('broadcasts').update({ status: 'failed' }).eq('id', id);
	}
});

// ── BC-005: Status endpoint ──

/**
 * GET /api/broadcasts/:id/status
 * Get send progress.
 */
router.get('/:id/status', logAction('broadcasts.status'), async (req, res) => {
	const { data, error } = await supabaseAdmin
		.from('broadcasts')
		.select('status, sent_count, failed_count, recipient_count, started_at, completed_at')
		.eq('id', req.params.id)
		.single();

	if (error || !data) return apiError(res, 404, 'not_found', 'Broadcast not found');

	return res.json({ data });
});

export default router;
