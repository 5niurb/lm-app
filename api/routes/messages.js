import { Router } from 'express';
import twilio from 'twilio';
import { verifyToken } from '../middleware/auth.js';
import { logAction } from '../middleware/auditLog.js';
import { supabaseAdmin } from '../services/supabase.js';
import { findConversation, normalizePhone } from '../services/phone-lookup.js';

const router = Router();

/** Sanitize search input for Supabase .or() filter */
function sanitizeSearch(input) {
	return String(input).replace(/[,.()[\]{}]/g, '');
}

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
		const s = sanitizeSearch(req.query.search);
		query = query.or(
			`phone_number.ilike.%${s}%,display_name.ilike.%${s}%,last_message.ilike.%${s}%`
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

	// Fetch the NEWEST messages (descending), then reverse for chronological display
	let query = supabaseAdmin
		.from('messages')
		.select('*, sender:profiles!messages_sent_by_fkey(full_name, email)')
		.eq('conversation_id', id)
		.order('created_at', { ascending: false })
		.limit(pageSize);

	if (req.query.before) {
		query = query.lt('created_at', req.query.before);
	}

	const { data, error } = await query;

	if (error) {
		console.error('Failed to fetch messages:', error.message);
		return res.status(500).json({ error: 'Failed to fetch messages' });
	}

	// Reverse to chronological order (oldest → newest) for display
	const messages = (data || []).reverse();

	// Mark conversation as read
	await supabaseAdmin.from('conversations').update({ unread_count: 0 }).eq('id', id);

	return res.json({ data: messages });
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

	// Look for existing conversation — one thread per customer
	const conversation = await findConversation(phone);

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

	const toNumber = normalizePhone(to);

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

		// Find or create conversation — one thread per customer phone number
		let convId = conversationId;
		if (!convId) {
			const existingConv = await findConversation(toNumber);

			if (existingConv) {
				convId = existingConv.id;
			} else {
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
		return res.status(500).json({ error: 'Failed to send message' });
	}
});

/**
 * GET /api/messages/log
 * Flat message log (not grouped by conversation).
 * Used for Inbound/Outbound views.
 *
 * Query: direction (inbound|outbound), search, page, pageSize, twilioNumber
 */
router.get('/log', logAction('messages.log'), async (req, res) => {
	const page = Math.max(1, parseInt(req.query.page, 10) || 1);
	const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 50));
	const offset = (page - 1) * pageSize;

	let query = supabaseAdmin
		.from('messages')
		.select(
			'*, conversation:conversations!messages_conversation_id_fkey(id, phone_number, display_name, contact_id), sender:profiles!messages_sent_by_fkey(full_name, email)',
			{ count: 'exact' }
		);

	if (req.query.direction) {
		query = query.eq('direction', req.query.direction);
	}

	if (req.query.twilioNumber) {
		query = query.eq('from_number', req.query.twilioNumber);
	}

	if (req.query.search) {
		const s = req.query.search.replace(/[,.()[\]{}]/g, '');
		query = query.or(`body.ilike.%${s}%,from_number.ilike.%${s}%,to_number.ilike.%${s}%`);
	}

	query = query.order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);

	const { data, error, count } = await query;

	if (error) {
		console.error('Failed to fetch message log:', error.message);
		return res.status(500).json({ error: 'Failed to fetch message log' });
	}

	return res.json({ data: data || [], count: count || 0, page, pageSize });
});

/**
 * POST /api/messages/:id/react
 * Add an emoji reaction to a message.
 * Saves locally (JSONB) + sends SMS reply with context.
 *
 * Body: { emoji }
 */
router.post('/:id/react', logAction('messages.react'), async (req, res) => {
	const { id } = req.params;
	const { emoji } = req.body;

	if (!emoji) {
		return res.status(400).json({ error: 'emoji is required' });
	}

	try {
		// Fetch the message being reacted to
		const { data: msg, error: msgErr } = await supabaseAdmin
			.from('messages')
			.select(
				'*, conversation:conversations!messages_conversation_id_fkey(id, phone_number, twilio_number)'
			)
			.eq('id', id)
			.single();

		if (msgErr || !msg) {
			return res.status(404).json({ error: 'Message not found' });
		}

		// Append reaction to JSONB array
		const reactions = Array.isArray(msg.reactions) ? msg.reactions : [];
		reactions.push({
			emoji,
			reacted_by: req.user?.id || null,
			created_at: new Date().toISOString()
		});

		const { data: updated, error: updateErr } = await supabaseAdmin
			.from('messages')
			.update({ reactions })
			.eq('id', id)
			.select()
			.single();

		if (updateErr) {
			console.error('Failed to save reaction:', updateErr.message);
			return res.status(500).json({ error: 'Failed to save reaction' });
		}

		// Send SMS reply with the reaction
		const convo = msg.conversation;
		if (convo?.phone_number && convo?.twilio_number) {
			try {
				// Check if this is the last message in the conversation
				const { data: latest } = await supabaseAdmin
					.from('messages')
					.select('id')
					.eq('conversation_id', convo.id)
					.order('created_at', { ascending: false })
					.limit(1)
					.single();

				const isLastMessage = latest?.id === id;

				let smsBody;
				if (isLastMessage) {
					smsBody = emoji;
				} else {
					const snippet = (msg.body || '').slice(0, 50);
					const ellipsis = (msg.body || '').length > 50 ? '\u2026' : '';
					smsBody = `${emoji} \u201c${snippet}${ellipsis}\u201d`;
				}

				const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

				const baseUrl = process.env.RENDER_EXTERNAL_URL || process.env.API_BASE_URL || '';
				const statusCallback = baseUrl ? `${baseUrl}/api/webhooks/sms/status` : undefined;

				await client.messages.create({
					to: convo.phone_number,
					from: convo.twilio_number,
					body: smsBody,
					...(statusCallback && { statusCallback })
				});
			} catch (smsErr) {
				console.error('Failed to send reaction SMS:', smsErr.message);
				// Don't fail the reaction save if SMS fails
			}
		}

		return res.json({ data: updated });
	} catch (err) {
		console.error('Failed to react to message:', err.message);
		return res.status(500).json({ error: 'Failed to react to message' });
	}
});

/**
 * GET /api/messages/:id/media/:index
 * Proxy Twilio MMS media so the browser doesn't need Twilio credentials.
 */
router.get('/:id/media/:index', logAction('messages.media'), async (req, res) => {
	const { id, index } = req.params;
	const idx = parseInt(index, 10);

	// Fetch the message to get media_urls
	const { data: msg, error } = await supabaseAdmin
		.from('messages')
		.select('media_urls')
		.eq('id', id)
		.single();

	if (error || !msg) {
		return res.status(404).json({ error: 'Message not found' });
	}

	const mediaUrls = msg.media_urls;
	if (!Array.isArray(mediaUrls) || isNaN(idx) || idx < 0 || idx >= mediaUrls.length) {
		return res.status(404).json({ error: 'Media not found at this index' });
	}

	const mediaUrl = mediaUrls[idx];

	try {
		const accountSid = process.env.TWILIO_ACCOUNT_SID;
		const authToken = process.env.TWILIO_AUTH_TOKEN;

		const twilioRes = await fetch(mediaUrl, {
			headers: {
				Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64')
			}
		});

		if (!twilioRes.ok) {
			console.error(`Twilio media fetch failed: ${twilioRes.status} ${twilioRes.statusText}`);
			return res.status(502).json({ error: 'Failed to fetch media from Twilio' });
		}

		res.set('Content-Type', twilioRes.headers.get('content-type') || 'application/octet-stream');
		const contentLength = twilioRes.headers.get('content-length');
		if (contentLength) res.set('Content-Length', contentLength);
		res.set('Cache-Control', 'private, max-age=3600');

		const reader = twilioRes.body.getReader();
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				res.end();
				break;
			}
			res.write(value);
		}
	} catch (e) {
		console.error('Media proxy error:', e.message);
		if (!res.headersSent) {
			return res.status(502).json({ error: 'Failed to proxy media' });
		}
	}
});

export default router;
