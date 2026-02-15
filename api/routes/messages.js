import { Router } from 'express';
import twilio from 'twilio';
import { verifyToken } from '../middleware/auth.js';
import { logAction } from '../middleware/auditLog.js';
import { supabaseAdmin } from '../services/supabase.js';

const router = Router();

// All message routes require authentication
router.use(verifyToken);

/**
 * GET /api/messages/conversations
 * List all conversations, sorted by most recent.
 *
 * Query: search, status (active|archived), page, pageSize, twilioNumber
 */
router.get('/conversations', logAction('messages.list'), async (req, res) => {
	const page = Math.max(1, parseInt(req.query.page, 10) || 1);
	const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 50));
	const offset = (page - 1) * pageSize;

	let query = supabaseAdmin.from('conversations').select('*', { count: 'exact' });

	if (req.query.status && req.query.status !== 'all') {
		query = query.eq('status', req.query.status);
	} else {
		query = query.eq('status', 'active');
	}

	// Filter by Twilio number
	if (req.query.twilioNumber) {
		query = query.eq('twilio_number', req.query.twilioNumber);
	}

	if (req.query.search) {
		query = query.or(
			`phone_number.ilike.%${req.query.search}%,display_name.ilike.%${req.query.search}%,last_message.ilike.%${req.query.search}%`
		);
	}

	query = query.order('last_at', { ascending: false }).range(offset, offset + pageSize - 1);

	const { data, error, count } = await query;

	if (error) {
		console.error('Failed to fetch conversations:', error.message);
		return res.status(500).json({ error: 'Failed to fetch conversations' });
	}

	return res.json({ data: data || [], count: count || 0, page, pageSize });
});

/**
 * GET /api/messages/conversations/:id
 * Get messages for a conversation.
 *
 * Query: page, pageSize, before (cursor timestamp)
 */
router.get('/conversations/:id', logAction('messages.read'), async (req, res) => {
	const { id } = req.params;
	const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 50));

	let query = supabaseAdmin
		.from('messages')
		.select('*, sender:profiles!messages_sent_by_fkey(full_name, email)')
		.eq('conversation_id', id)
		.order('created_at', { ascending: true })
		.limit(pageSize);

	if (req.query.before) {
		query = query.lt('created_at', req.query.before);
	}

	const { data, error } = await query;

	if (error) {
		console.error('Failed to fetch messages:', error.message);
		return res.status(500).json({ error: 'Failed to fetch messages' });
	}

	// Mark conversation as read
	await supabaseAdmin.from('conversations').update({ unread_count: 0 }).eq('id', id);

	return res.json({ data: data || [] });
});

/**
 * GET /api/messages/stats
 * Unread conversation count for sidebar badge.
 */
router.get('/stats', logAction('messages.stats'), async (req, res) => {
	const { count } = await supabaseAdmin
		.from('conversations')
		.select('id', { count: 'exact', head: true })
		.gt('unread_count', 0)
		.eq('status', 'active');

	return res.json({ unreadConversations: count || 0 });
});

/**
 * GET /api/messages/lookup
 * Look up an existing conversation and/or contact by phone number.
 * Used by the messages page when navigating from quick action icons
 * to decide whether to open an existing thread or new compose view.
 *
 * Query: phone (required)
 * Returns: { conversation?, contact? }
 */
router.get('/lookup', logAction('messages.lookup'), async (req, res) => {
	const phone = req.query.phone;
	if (!phone) {
		return res.status(400).json({ error: 'Phone number is required' });
	}

	// Normalize phone number variants for matching
	let normalized = phone.replace(/[^\d+]/g, '');
	if (normalized.length === 10) normalized = '+1' + normalized;
	if (!normalized.startsWith('+') && normalized.length === 11) normalized = '+' + normalized;

	// Also build variant without + for matching
	const digits = normalized.replace(/\D/g, '');
	const variants = [normalized, digits];
	if (digits.length === 11 && digits.startsWith('1')) variants.push(digits.slice(1));
	if (digits.length === 10) variants.push('+1' + digits, '1' + digits);

	// Look for existing conversation
	let conversation = null;
	for (const v of variants) {
		const { data } = await supabaseAdmin
			.from('conversations')
			.select('*')
			.eq('phone_number', v)
			.maybeSingle();
		if (data) {
			conversation = data;
			break;
		}
	}

	// Look for contact
	let contact = null;
	const orFilter = variants.map((v) => `phone_normalized.eq.${v},phone.eq.${v}`).join(',');
	const { data: contactData } = await supabaseAdmin
		.from('contacts')
		.select('id, full_name, first_name, last_name, phone, tags')
		.or(orFilter)
		.limit(1)
		.maybeSingle();

	if (contactData) {
		contact = contactData;
	}

	return res.json({ conversation, contact });
});

/**
 * POST /api/messages/send
 * Send an SMS/RCS message from the app.
 *
 * Body: { to, body, conversationId?, from? }
 */
router.post('/send', logAction('messages.send'), async (req, res) => {
	const { to, body, conversationId } = req.body;

	if (!to || !body) {
		return res.status(400).json({ error: 'Both "to" and "body" are required' });
	}

	// Normalize phone number
	let toNumber = to.replace(/[^\d+]/g, '');
	if (toNumber.length === 10) toNumber = '+1' + toNumber;
	if (!toNumber.startsWith('+')) toNumber = '+' + toNumber;

	// Use explicitly provided from number, or fall back to env defaults
	const fromNumber =
		req.body.from ||
		process.env.TWILIO_SMS_FROM_NUMBER ||
		process.env.TWILIO_TEST1_PHONE_NUMBER ||
		process.env.TWILIO_PHONE_NUMBER ||
		process.env.TWILIO_MAIN_PHONE_NUMBER;

	if (!fromNumber) {
		return res.status(500).json({ error: 'No Twilio phone number configured' });
	}

	try {
		// Send via Twilio
		const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

		// Build the status callback URL for delivery tracking
		const baseUrl = process.env.RENDER_EXTERNAL_URL || process.env.API_BASE_URL || '';
		const statusCallback = baseUrl ? `${baseUrl}/api/webhooks/sms/status` : undefined;

		const twilioMsg = await client.messages.create({
			to: toNumber,
			from: fromNumber,
			body,
			...(statusCallback && { statusCallback })
		});

		// Find or create conversation (scoped to twilio number)
		let convId = conversationId;
		if (!convId) {
			// Look up existing conversation by phone number + twilio number
			let existingQuery = supabaseAdmin
				.from('conversations')
				.select('id')
				.eq('phone_number', toNumber);
			if (fromNumber) existingQuery = existingQuery.eq('twilio_number', fromNumber);

			const { data: existing } = await existingQuery.maybeSingle();

			if (existing) {
				convId = existing.id;
			} else {
				// Look up contact
				const phoneDigits = toNumber.replace(/\D/g, '');
				const { data: contact } = await supabaseAdmin
					.from('contacts')
					.select('id, full_name')
					.or(`phone_normalized.eq.${phoneDigits},phone.eq.${toNumber}`)
					.limit(1)
					.maybeSingle();

				const { data: newConv } = await supabaseAdmin
					.from('conversations')
					.insert({
						phone_number: toNumber,
						twilio_number: fromNumber || null,
						display_name: contact?.full_name || null,
						contact_id: contact?.id || null,
						last_message: body,
						last_at: new Date().toISOString()
					})
					.select('id')
					.single();

				convId = newConv?.id;
			}
		}

		// Insert message record
		const { data: msg, error: msgErr } = await supabaseAdmin
			.from('messages')
			.insert({
				conversation_id: convId,
				direction: 'outbound',
				body,
				from_number: fromNumber,
				to_number: toNumber,
				twilio_sid: twilioMsg.sid,
				status: twilioMsg.status || 'sent',
				sent_by: req.user?.id || null
			})
			.select()
			.single();

		if (msgErr) {
			console.error('Failed to save outbound message:', msgErr.message);
		}

		// Update conversation last_message
		await supabaseAdmin
			.from('conversations')
			.update({
				last_message: body,
				last_at: new Date().toISOString(),
				status: 'active'
			})
			.eq('id', convId);

		return res.json({
			data: msg,
			conversation_id: convId,
			twilio_sid: twilioMsg.sid,
			status: twilioMsg.status
		});
	} catch (err) {
		console.error('Failed to send message:', err.message);
		return res.status(500).json({ error: err.message });
	}
});

export default router;
