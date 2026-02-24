import { Router } from 'express';
import { randomUUID } from 'crypto';
import twilio from 'twilio';
import multer from 'multer';
import { verifyToken } from '../middleware/auth.js';
import { logAction } from '../middleware/auditLog.js';
import { supabaseAdmin } from '../services/supabase.js';
import { findConversation, normalizePhone } from '../services/phone-lookup.js';
import { resolveTags } from '../services/tag-resolver.js';
import { generateSuggestions } from '../services/ai-suggest.js';
import { sanitizeSearch } from '../utils/sanitize.js';
import { apiError } from '../utils/responses.js';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MIME_TO_EXT = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/gif': 'gif',
	'image/webp': 'webp'
};

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
	fileFilter: (_req, file, cb) => {
		if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
			return cb(new Error('Only JPEG, PNG, GIF, and WebP images are allowed'));
		}
		cb(null, true);
	}
});

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
		const s = sanitizeSearch(req.query.search);
		query = query.or(
			`phone_number.ilike.%${s}%,display_name.ilike.%${s}%,last_message.ilike.%${s}%`
		);
	}

	query = query.order('last_at', { ascending: false }).range(offset, offset + pageSize - 1);

	const { data, error, count } = await query;

	if (error) {
		console.error('Failed to fetch conversations:', error.message);
		return apiError(res, 500, 'server_error', 'Failed to fetch conversations');
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
		return apiError(res, 500, 'server_error', 'Failed to fetch messages');
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
		return apiError(res, 400, 'validation_error', 'Phone number is required');
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
 * Send an SMS/MMS message from the app.
 * Accepts JSON (text only) or multipart/form-data (text + image).
 *
 * JSON body: { to, body, conversationId?, from? }
 * Multipart fields: to, body?, conversationId?, from?, image (file)
 */
router.post(
	'/send',
	(req, res, next) => {
		upload.single('image')(req, res, (err) => {
			if (err) {
				return apiError(res, 400, 'validation_error', err.message || 'Invalid file upload');
			}
			next();
		});
	},
	logAction('messages.send'),
	async (req, res) => {
		const { to, body, conversationId } = req.body;

		if (!to || (!body && !req.file)) {
			return apiError(res, 400, 'validation_error', '"to" is required, plus "body" or an image');
		}

		const toNumber = normalizePhone(to);

		const fromNumber =
			req.body.from ||
			process.env.TWILIO_SMS_FROM_NUMBER ||
			process.env.TWILIO_PHONE_NUMBER ||
			process.env.TWILIO_MAIN_PHONE_NUMBER;

		if (!fromNumber) {
			return apiError(res, 500, 'server_error', 'No Twilio phone number configured');
		}

		// Resolve dynamic tags (e.g. {{first_name}}) before sending
		const resolvedBody = body
			? await resolveTags(body, { phoneNumber: toNumber, conversationId })
			: '';

		let storagePath = null;
		try {
			let mediaUrl = null;

			// Upload image to Supabase Storage if present
			if (req.file) {
				const ext = MIME_TO_EXT[req.file.mimetype] || 'jpg';
				storagePath = `${randomUUID()}.${ext}`;

				const { error: uploadErr } = await supabaseAdmin.storage
					.from('mms')
					.upload(storagePath, req.file.buffer, {
						contentType: req.file.mimetype,
						upsert: false
					});

				if (uploadErr) {
					console.error('Supabase Storage upload failed:', uploadErr.message);
					return apiError(res, 500, 'server_error', 'Failed to upload image');
				}

				// Signed URL — Twilio fetches once at send time; 1-hour expiry is plenty
				const { data: signedData, error: signErr } = await supabaseAdmin.storage
					.from('mms')
					.createSignedUrl(storagePath, 3600);
				if (signErr || !signedData?.signedUrl) {
					console.error('Failed to create signed URL:', signErr?.message);
					return apiError(res, 500, 'server_error', 'Failed to generate image URL');
				}
				mediaUrl = signedData.signedUrl;
			}

			// Send via Twilio
			const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

			const baseUrl = process.env.RENDER_EXTERNAL_URL || process.env.API_BASE_URL || '';
			const statusCallback = baseUrl ? `${baseUrl}/api/webhooks/sms/status` : undefined;

			const twilioMsg = await client.messages.create({
				to: toNumber,
				from: fromNumber,
				body: resolvedBody,
				...(mediaUrl && { mediaUrl: [mediaUrl] }),
				...(statusCallback && { statusCallback })
			});

			// Find or create conversation
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
							last_message: resolvedBody || (mediaUrl ? '[Image]' : ''),
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
					body: resolvedBody,
					from_number: fromNumber,
					to_number: toNumber,
					twilio_sid: twilioMsg.sid,
					status: twilioMsg.status || 'sent',
					sent_by: req.user?.id || null,
					...(mediaUrl && { media_urls: [mediaUrl] })
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
					last_message: resolvedBody || (mediaUrl ? '[Image]' : ''),
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
			// Clean up orphaned storage file if upload succeeded but send failed
			if (storagePath) {
				supabaseAdmin.storage
					.from('mms')
					.remove([storagePath])
					.catch(() => {});
			}
			console.error('Failed to send message:', err.message);
			return apiError(res, 500, 'server_error', 'Failed to send message');
		}
	}
);

/**
 * POST /api/messages/ai-suggest
 * Generate AI response suggestions for a conversation.
 *
 * Body: { conversationId }
 */
router.post('/ai-suggest', logAction('messages.ai-suggest'), async (req, res) => {
	const { conversationId } = req.body;

	if (!conversationId) {
		return apiError(res, 400, 'validation_error', '"conversationId" is required');
	}

	if (!process.env.ANTHROPIC_API_KEY) {
		return apiError(res, 503, 'service_unavailable', 'AI features not configured');
	}

	try {
		const result = await generateSuggestions(conversationId);
		return res.json({ data: result });
	} catch (err) {
		if (err.status === 429) {
			return apiError(res, 429, 'rate_limited', err.message);
		}
		console.error('AI suggest failed:', err.message);
		return apiError(res, 500, 'server_error', 'Failed to generate suggestions');
	}
});

/**
 * POST /api/messages/note
 * Create an internal note on a conversation thread.
 * Notes are staff-only — no SMS is sent.
 *
 * Body: { conversationId, body }
 */
router.post('/note', logAction('messages.note'), async (req, res) => {
	const { conversationId, body } = req.body;

	if (!conversationId || !body) {
		return apiError(res, 400, 'validation_error', '"conversationId" and "body" are required');
	}

	try {
		// Insert internal note — no Twilio, no SMS
		const { data: note, error: noteErr } = await supabaseAdmin
			.from('messages')
			.insert({
				conversation_id: conversationId,
				direction: 'outbound',
				body,
				is_internal_note: true,
				sent_by: req.user?.id || null,
				status: 'delivered'
			})
			.select('id, conversation_id, body, is_internal_note, sent_by, created_at')
			.single();

		if (noteErr) {
			console.error('Failed to create internal note:', noteErr.message);
			return apiError(res, 500, 'server_error', 'Failed to create internal note');
		}

		// Update conversation last_at but NOT last_message (notes shouldn't show in preview)
		await supabaseAdmin
			.from('conversations')
			.update({ last_at: new Date().toISOString() })
			.eq('id', conversationId);

		return res.json({ data: note });
	} catch (err) {
		console.error('Failed to create internal note:', err.message);
		return apiError(res, 500, 'server_error', 'Failed to create internal note');
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

	// Exclude internal notes from the flat log view
	query = query.or('is_internal_note.is.null,is_internal_note.eq.false');

	if (req.query.direction) {
		query = query.eq('direction', req.query.direction);
	}

	if (req.query.twilioNumber) {
		query = query.eq('from_number', req.query.twilioNumber);
	}

	if (req.query.search) {
		const s = sanitizeSearch(req.query.search);
		query = query.or(`body.ilike.%${s}%,from_number.ilike.%${s}%,to_number.ilike.%${s}%`);
	}

	query = query.order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);

	const { data, error, count } = await query;

	if (error) {
		console.error('Failed to fetch message log:', error.message);
		return apiError(res, 500, 'server_error', 'Failed to fetch message log');
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
		return apiError(res, 400, 'validation_error', 'emoji is required');
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
			return apiError(res, 404, 'not_found', 'Message not found');
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
			return apiError(res, 500, 'server_error', 'Failed to save reaction');
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
		return apiError(res, 500, 'server_error', 'Failed to react to message');
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
		return apiError(res, 404, 'not_found', 'Message not found');
	}

	const mediaUrls = msg.media_urls;
	if (!Array.isArray(mediaUrls) || isNaN(idx) || idx < 0 || idx >= mediaUrls.length) {
		return apiError(res, 404, 'not_found', 'Media not found at this index');
	}

	const mediaUrl = mediaUrls[idx];

	// Only proxy Twilio media URLs — never send credentials to arbitrary hosts
	try {
		const parsed = new URL(mediaUrl);
		if (!/^(api|media)\.twilio(cdn)?\.com$/.test(parsed.hostname)) {
			return apiError(res, 403, 'forbidden', 'Only Twilio media URLs can be proxied');
		}
	} catch {
		return apiError(res, 400, 'validation_error', 'Invalid media URL');
	}

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
			return apiError(res, 502, 'bad_gateway', 'Failed to fetch media from Twilio');
		}

		res.set('Content-Type', twilioRes.headers.get('content-type') || 'application/octet-stream');
		const contentLength = twilioRes.headers.get('content-length');
		if (contentLength) res.set('Content-Length', contentLength);
		res.set('Cache-Control', 'private, max-age=3600');

		const reader = twilioRes.body.getReader();
		req.on('close', () => reader.cancel());
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
			return apiError(res, 502, 'bad_gateway', 'Failed to proxy media');
		}
	}
});

/**
 * GET /api/messages/conversations/:id/timeline
 * Unified timeline — merges messages, calls, voicemails, and emails chronologically.
 * Attaches star/resolve flags from thread_item_flags.
 *
 * Query: pageSize (default 50), before (cursor timestamp)
 */
router.get('/conversations/:id/timeline', logAction('messages.timeline'), async (req, res) => {
	const { id } = req.params;
	const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 50));

	// Fetch conversation to get contact_id and phone for matching calls/voicemails
	const { data: convo, error: convoErr } = await supabaseAdmin
		.from('conversations')
		.select('id, contact_id, phone_number')
		.eq('id', id)
		.single();

	if (convoErr || !convo) {
		return apiError(res, 404, 'not_found', 'Conversation not found');
	}

	const phoneDigits = convo.phone_number?.replace(/\D/g, '') || '';
	const phoneE164 = normalizePhone(convo.phone_number);

	// Build phone variants for matching
	const phoneVariants = [convo.phone_number, phoneE164, phoneDigits].filter(Boolean);
	if (phoneDigits.length === 11 && phoneDigits.startsWith('1'))
		phoneVariants.push(phoneDigits.slice(1));
	if (phoneDigits.length === 10) phoneVariants.push('+1' + phoneDigits, '1' + phoneDigits);

	try {
		// Fetch all four types in parallel
		const [messagesRes, callsRes, voicemailsRes, emailsRes] = await Promise.all([
			// Messages
			supabaseAdmin
				.from('messages')
				.select('*, sender:profiles!messages_sent_by_fkey(full_name, email)')
				.eq('conversation_id', id)
				.order('created_at', { ascending: false })
				.limit(pageSize),
			// Calls — match by contact_id or phone number
			(async () => {
				let q = supabaseAdmin
					.from('call_logs')
					.select('*')
					.order('started_at', { ascending: false })
					.limit(pageSize);

				if (convo.contact_id) {
					q = q.eq('contact_id', convo.contact_id);
				} else {
					// Match by phone number variants
					const orFilter = phoneVariants
						.flatMap((v) => [`from_number.eq.${v}`, `to_number.eq.${v}`])
						.join(',');
					q = q.or(orFilter);
				}
				return q;
			})(),
			// Voicemails — match by phone number or via call_log contact_id
			(async () => {
				const orParts = phoneVariants.map((v) => `from_number.eq.${v}`).join(',');
				return supabaseAdmin
					.from('voicemails')
					.select('*')
					.or(orParts)
					.order('created_at', { ascending: false })
					.limit(pageSize);
			})(),
			// Emails
			supabaseAdmin
				.from('emails')
				.select('*')
				.eq('conversation_id', id)
				.order('created_at', { ascending: false })
				.limit(pageSize)
		]);

		// Tag each item with __type and normalize timestamp field
		const items = [];

		for (const msg of messagesRes.data || []) {
			items.push({ ...msg, __type: 'message' });
		}
		for (const call of callsRes.data || []) {
			items.push({ ...call, __type: 'call', created_at: call.started_at || call.created_at });
		}
		for (const vm of voicemailsRes.data || []) {
			items.push({ ...vm, __type: 'voicemail' });
		}
		for (const email of emailsRes.data || []) {
			items.push({ ...email, __type: 'email' });
		}

		// Sort chronologically (oldest first for display)
		items.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

		// Attach flags from thread_item_flags
		if (items.length > 0) {
			const itemIds = items.map((i) => i.id);
			const { data: flags } = await supabaseAdmin
				.from('thread_item_flags')
				.select('item_type, item_id, is_starred, is_resolved, starred_at, resolved_at')
				.eq('conversation_id', id)
				.in('item_id', itemIds);

			if (flags?.length) {
				const flagMap = new Map(flags.map((f) => [`${f.item_type}:${f.item_id}`, f]));
				for (const item of items) {
					const flag = flagMap.get(`${item.__type}:${item.id}`);
					item.is_starred = flag?.is_starred || false;
					item.is_resolved = flag?.is_resolved || false;
				}
			}
		}

		// Mark conversation as read
		await supabaseAdmin.from('conversations').update({ unread_count: 0 }).eq('id', id);

		return res.json({ data: items });
	} catch (err) {
		console.error('Failed to fetch timeline:', err.message);
		return apiError(res, 500, 'server_error', 'Failed to fetch timeline');
	}
});

/**
 * POST /api/messages/timeline/:itemType/:itemId/star
 * Toggle star on a thread item.
 */
router.post('/timeline/:itemType/:itemId/star', logAction('timeline.star'), async (req, res) => {
	const { itemType, itemId } = req.params;
	const ALLOWED_TYPES = ['message', 'call', 'voicemail', 'email'];
	if (!ALLOWED_TYPES.includes(itemType)) {
		return apiError(res, 400, 'validation_error', 'Invalid item type');
	}

	try {
		// Check for existing flag
		const { data: existing } = await supabaseAdmin
			.from('thread_item_flags')
			.select('id, is_starred, conversation_id')
			.eq('item_type', itemType)
			.eq('item_id', itemId)
			.maybeSingle();

		if (existing) {
			const newStarred = !existing.is_starred;
			const { data, error } = await supabaseAdmin
				.from('thread_item_flags')
				.update({
					is_starred: newStarred,
					starred_by: newStarred ? req.user?.id : null,
					starred_at: newStarred ? new Date().toISOString() : null
				})
				.eq('id', existing.id)
				.select()
				.single();
			if (error) return apiError(res, 500, 'server_error', 'Failed to update star');
			return res.json({ data });
		}

		// Need to resolve conversation_id from the item
		const conversationId = await resolveConversationId(itemType, itemId);

		const { data, error } = await supabaseAdmin
			.from('thread_item_flags')
			.insert({
				conversation_id: conversationId,
				item_type: itemType,
				item_id: itemId,
				is_starred: true,
				starred_by: req.user?.id,
				starred_at: new Date().toISOString()
			})
			.select()
			.single();
		if (error) return apiError(res, 500, 'server_error', 'Failed to create star');
		return res.json({ data });
	} catch (err) {
		console.error('Star toggle error:', err.message);
		return apiError(res, 500, 'server_error', 'Failed to toggle star');
	}
});

/**
 * POST /api/messages/timeline/:itemType/:itemId/resolve
 * Toggle resolve on a thread item.
 */
router.post(
	'/timeline/:itemType/:itemId/resolve',
	logAction('timeline.resolve'),
	async (req, res) => {
		const { itemType, itemId } = req.params;
		const ALLOWED_TYPES = ['message', 'call', 'voicemail', 'email'];
		if (!ALLOWED_TYPES.includes(itemType)) {
			return apiError(res, 400, 'validation_error', 'Invalid item type');
		}

		try {
			const { data: existing } = await supabaseAdmin
				.from('thread_item_flags')
				.select('id, is_resolved, conversation_id')
				.eq('item_type', itemType)
				.eq('item_id', itemId)
				.maybeSingle();

			if (existing) {
				const newResolved = !existing.is_resolved;
				const { data, error } = await supabaseAdmin
					.from('thread_item_flags')
					.update({
						is_resolved: newResolved,
						resolved_by: newResolved ? req.user?.id : null,
						resolved_at: newResolved ? new Date().toISOString() : null
					})
					.eq('id', existing.id)
					.select()
					.single();
				if (error) return apiError(res, 500, 'server_error', 'Failed to update resolve');
				return res.json({ data });
			}

			const conversationId = await resolveConversationId(itemType, itemId);

			const { data, error } = await supabaseAdmin
				.from('thread_item_flags')
				.insert({
					conversation_id: conversationId,
					item_type: itemType,
					item_id: itemId,
					is_resolved: true,
					resolved_by: req.user?.id,
					resolved_at: new Date().toISOString()
				})
				.select()
				.single();
			if (error) return apiError(res, 500, 'server_error', 'Failed to create resolve');
			return res.json({ data });
		} catch (err) {
			console.error('Resolve toggle error:', err.message);
			return apiError(res, 500, 'server_error', 'Failed to toggle resolve');
		}
	}
);

/**
 * Resolve the conversation_id for a given item type and ID.
 * @param {string} itemType
 * @param {string} itemId
 * @returns {Promise<string|null>}
 */
async function resolveConversationId(itemType, itemId) {
	if (itemType === 'message' || itemType === 'email') {
		const table = itemType === 'message' ? 'messages' : 'emails';
		const { data } = await supabaseAdmin
			.from(table)
			.select('conversation_id')
			.eq('id', itemId)
			.single();
		return data?.conversation_id || null;
	}
	// For calls/voicemails, look up via contact_id → conversation
	if (itemType === 'call') {
		const { data: call } = await supabaseAdmin
			.from('call_logs')
			.select('contact_id, from_number, to_number')
			.eq('id', itemId)
			.single();
		if (call?.contact_id) {
			const { data: convo } = await supabaseAdmin
				.from('conversations')
				.select('id')
				.eq('contact_id', call.contact_id)
				.limit(1)
				.maybeSingle();
			return convo?.id || null;
		}
	}
	if (itemType === 'voicemail') {
		const { data: vm } = await supabaseAdmin
			.from('voicemails')
			.select('from_number')
			.eq('id', itemId)
			.single();
		if (vm?.from_number) {
			const convo = await findConversation(vm.from_number);
			return convo?.id || null;
		}
	}
	return null;
}

export default router;
