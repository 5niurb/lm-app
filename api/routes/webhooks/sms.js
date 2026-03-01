import { Router } from 'express';
import express from 'express';
import twilio from 'twilio';
import { supabaseAdmin } from '../../services/supabase.js';
import { validateTwilioSignature } from '../../middleware/twilioSignature.js';
import { forwardToTextMagic, sendSmsViaTextMagic } from './sms-forward.js';
import {
	lookupContactByPhone,
	findConversation,
	normalizePhone
} from '../../services/phone-lookup.js';
import { resolveTags } from '../../services/tag-resolver.js';
import { sendPushToAll } from '../../services/push-notify.js';

/**
 * Check if the business is currently open.
 * Mirrors the logic in voice.js hours-check endpoint.
 * @returns {'open' | 'closed'}
 */
function getBusinessHoursStatus() {
	if (process.env.FORCE_HOURS_OPEN === 'true') return 'open';

	const now = new Date();
	const laTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
	const day = laTime.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
	const hour = laTime.getHours();
	const minute = laTime.getMinutes();
	const timeDecimal = hour + minute / 60;

	if (day >= 1 && day <= 5 && timeDecimal >= 10 && timeDecimal < 18) return 'open';
	if (day === 6 && timeDecimal >= 10 && timeDecimal < 16) return 'open';
	return 'closed';
}

/**
 * Find the highest-priority auto-reply rule that matches the inbound message.
 * Rules are sorted by priority ascending — first match wins.
 * @param {string} messageBody - The inbound message text
 * @returns {Promise<object|null>} The matched rule, or null
 */
async function findMatchingAutoReplyRule(messageBody) {
	const { data: rules, error } = await supabaseAdmin
		.from('auto_reply_rules')
		.select('*')
		.eq('is_active', true)
		.order('priority', { ascending: true });

	if (error || !rules || rules.length === 0) return null;

	const hoursStatus = getBusinessHoursStatus();
	const bodyLower = messageBody.toLowerCase();

	for (const rule of rules) {
		// Check hours restriction
		if (rule.hours_restriction === 'after_hours' && hoursStatus === 'open') continue;
		if (rule.hours_restriction === 'business_hours' && hoursStatus === 'closed') continue;
		// 'always' passes through

		// Check trigger match
		if (rule.trigger_type === 'keyword') {
			const keywords = rule.trigger_keywords || [];
			const matched = keywords.some((kw) => bodyLower.includes(kw.toLowerCase()));
			if (!matched) continue;
		}
		// trigger_type='any' matches all messages — no keyword check needed

		return rule;
	}

	return null;
}

/**
 * Process auto-reply for an inbound message (fire-and-forget).
 * Sends the reply via Twilio, inserts it into messages, and updates the conversation.
 * @param {object} params
 * @param {string} params.messageBody - The inbound message text
 * @param {string} params.fromNumber - The sender's phone number (customer)
 * @param {string} params.toNumber - The Twilio number that received the message
 * @param {string} params.convId - The conversation ID
 */
async function processAutoReply({ messageBody, fromNumber, toNumber, convId }) {
	try {
		// Cooldown: skip if an auto-reply was sent in this conversation within the last 5 minutes
		const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
		const { data: recent } = await supabaseAdmin
			.from('messages')
			.select('id')
			.eq('conversation_id', convId)
			.eq('direction', 'outbound')
			.eq('metadata->>source', 'auto_reply')
			.gte('created_at', fiveMinAgo)
			.limit(1);
		if (recent?.length) return;

		const rule = await findMatchingAutoReplyRule(messageBody);
		if (!rule) return;

		// Resolve dynamic tags in the auto-reply template
		const resolvedReply = await resolveTags(rule.response_body, {
			phoneNumber: fromNumber,
			conversationId: convId
		});

		// Send auto-reply via Twilio
		const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

		const baseUrl = process.env.RENDER_EXTERNAL_URL || process.env.API_BASE_URL || '';
		const statusCallback = baseUrl ? `${baseUrl}/api/webhooks/sms/status` : undefined;

		const twilioMsg = await client.messages.create({
			to: fromNumber,
			from: toNumber,
			body: resolvedReply,
			...(statusCallback && { statusCallback })
		});

		// Insert auto-reply message record
		await supabaseAdmin.from('messages').insert({
			conversation_id: convId,
			direction: 'outbound',
			body: resolvedReply,
			from_number: toNumber,
			to_number: fromNumber,
			twilio_sid: twilioMsg.sid,
			status: twilioMsg.status || 'sent',
			metadata: { source: 'auto_reply', rule_id: rule.id }
		});

		// Update conversation with auto-reply as latest message
		await supabaseAdmin
			.from('conversations')
			.update({
				last_message: resolvedReply.substring(0, 200),
				last_at: new Date().toISOString()
			})
			.eq('id', convId);

		console.log(`Auto-reply sent: rule=${rule.id}, to=${fromNumber}, conv=${convId}`);
	} catch (e) {
		console.error('Auto-reply failed:', e.message);
	}
}

const router = Router();

// Twilio sends URL-encoded data; Studio make-http-request sends JSON
router.use(express.urlencoded({ extended: false }));
router.use(express.json());

/**
 * POST /api/webhooks/sms/incoming
 * Twilio SMS webhook — called when a text message arrives.
 *
 * Twilio sends: From, To, Body, MessageSid, NumMedia, MediaUrl0, etc.
 * We log the message, find/create conversation, and respond with empty TwiML.
 */
router.post('/incoming', validateTwilioSignature, async (req, res) => {
	const { MessageSid, From, To, Body, NumMedia } = req.body;

	if (!MessageSid) {
		return res.sendStatus(200);
	}

	const fromNumber = normalizePhone(From || 'unknown');
	const toNumber = To || '';
	const body = Body || '';

	// Collect media URLs if any
	const mediaUrls = [];
	const numMedia = parseInt(NumMedia || '0', 10);
	for (let i = 0; i < numMedia; i++) {
		if (req.body[`MediaUrl${i}`]) {
			mediaUrls.push(req.body[`MediaUrl${i}`]);
		}
	}

	let convId;
	let senderName = fromNumber; // fallback to phone number

	try {
		// Find or create conversation — one thread per customer phone number
		const existing = await findConversation(fromNumber);

		if (existing) {
			convId = existing.id;
			senderName = existing.display_name || fromNumber;
			// Update conversation with new message preview + fill twilio_number if missing
			const updatePayload = {
				last_message: body.substring(0, 200),
				last_at: new Date().toISOString(),
				unread_count: (existing.unread_count || 0) + 1,
				status: 'active'
			};
			if (!existing.twilio_number && toNumber) {
				updatePayload.twilio_number = toNumber;
			}
			await supabaseAdmin.from('conversations').update(updatePayload).eq('id', existing.id);
		} else {
			// Look up contact by phone (shared utility handles format variants)
			const { contactId, contactName } = await lookupContactByPhone(fromNumber);
			senderName = contactName || fromNumber;

			const { data: newConv } = await supabaseAdmin
				.from('conversations')
				.insert({
					phone_number: fromNumber,
					twilio_number: toNumber || null,
					display_name: contactName,
					contact_id: contactId,
					last_message: body.substring(0, 200),
					last_at: new Date().toISOString(),
					unread_count: 1
				})
				.select('id')
				.single();

			convId = newConv?.id;
		}

		// Insert the message
		if (convId) {
			await supabaseAdmin.from('messages').insert({
				conversation_id: convId,
				direction: 'inbound',
				body,
				from_number: fromNumber,
				to_number: toNumber,
				twilio_sid: MessageSid,
				status: 'received',
				media_urls: mediaUrls.length > 0 ? mediaUrls : null
			});
		}
	} catch (e) {
		console.error('Failed to process incoming SMS:', e.message);
	}

	// Forward to TextMagic for parallel operation (fire-and-forget)
	forwardToTextMagic(req.body);

	// Check for auto-reply rules (fire-and-forget — doesn't block webhook response)
	if (convId && body) {
		processAutoReply({ messageBody: body, fromNumber, toNumber, convId });
	}

	// Push notification to mobile devices (fire-and-forget)
	if (convId) {
		sendPushToAll({
			title: senderName,
			body: body || (mediaUrls.length > 0 ? '[Image]' : 'New message'),
			data: { type: 'new_message', conversation_id: convId }
		});
	}

	// Respond with empty TwiML
	res.type('text/xml');
	res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
});

/**
 * POST /api/webhooks/sms/status
 * Twilio SMS status callback — updates message delivery status.
 */
router.post('/status', validateTwilioSignature, async (req, res) => {
	const { MessageSid, MessageStatus } = req.body;

	if (!MessageSid || !MessageStatus) {
		return res.sendStatus(200);
	}

	try {
		await supabaseAdmin
			.from('messages')
			.update({ status: MessageStatus })
			.eq('twilio_sid', MessageSid);
	} catch (e) {
		console.error('Failed to update message status:', e.message);
	}

	res.sendStatus(200);
});

/**
 * POST /api/webhooks/sms/studio-send
 * Called by Twilio Studio's make-http-request widget when the IVR
 * initiates a 2-way SMS chat (e.g., caller presses 1 to text us).
 *
 * This sends the SMS through OUR pipeline so it creates a conversation
 * and message record that appears in the messages chat.
 *
 * Expected body (JSON from Studio):
 *   to           — caller's phone number ({{contact.channel.address}})
 *   body         — message text
 *   callSid      — the call SID (optional, for linking)
 *   twilioNumber — the Twilio number that received the call ({{trigger.call.To}})
 */
router.post('/studio-send', async (req, res) => {
	// Verify shared secret — Studio HTTP Request widget sends this as a custom header.
	// Falls back to open access if STUDIO_WEBHOOK_SECRET is not configured (dev/migration).
	const secret = process.env.STUDIO_WEBHOOK_SECRET;
	if (secret && req.headers['x-studio-secret'] !== secret) {
		return res.status(403).json({ error: 'Forbidden' });
	}

	const { to, body: msgBody, callSid, twilioNumber } = req.body;

	if (!to || !msgBody) {
		return res.status(400).json({ error: 'Both "to" and "body" are required' });
	}

	const toNumber = normalizePhone(to);

	// Use the Twilio number that received the call (passed from Studio flow).
	// Falls back to env vars if not provided (backwards compat).
	const fromNumber =
		(twilioNumber && normalizePhone(twilioNumber)) ||
		process.env.TWILIO_SMS_FROM_NUMBER ||
		process.env.TWILIO_PHONE_NUMBER ||
		process.env.TWILIO_MAIN_PHONE_NUMBER;

	if (!fromNumber) {
		console.error('Studio-send: No Twilio phone number configured');
		return res.status(500).json({ error: 'No Twilio phone number configured' });
	}

	try {
		// Send SMS via TextMagic (so it appears in TextMagic dashboard).
		// Falls back to Twilio if TextMagic creds are not configured.
		let messageSid = null;
		let sendStatus = 'sent';
		let sentVia = 'twilio';

		const tmResult = await sendSmsViaTextMagic({ to: toNumber, text: msgBody });

		if (tmResult) {
			messageSid = `tm_${tmResult.id}`;
			sentVia = 'textmagic';
		} else {
			// TextMagic not configured — fall back to Twilio
			const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

			const baseUrl = process.env.RENDER_EXTERNAL_URL || process.env.API_BASE_URL || '';
			const statusCallback = baseUrl ? `${baseUrl}/api/webhooks/sms/status` : undefined;

			const twilioMsg = await client.messages.create({
				to: toNumber,
				from: fromNumber,
				body: msgBody,
				...(statusCallback && { statusCallback })
			});

			messageSid = twilioMsg.sid;
			sendStatus = twilioMsg.status || 'sent';
		}

		// Find or create conversation — one thread per customer phone number
		const existingConv = await findConversation(toNumber);

		let convId;

		if (existingConv) {
			convId = existingConv.id;
		} else {
			const { contactId, contactName } = await lookupContactByPhone(toNumber);

			const { data: newConv } = await supabaseAdmin
				.from('conversations')
				.insert({
					phone_number: toNumber,
					twilio_number: fromNumber || null,
					display_name: contactName,
					contact_id: contactId,
					last_message: msgBody.substring(0, 200),
					last_at: new Date().toISOString(),
					unread_count: 0
				})
				.select('id')
				.single();

			convId = newConv?.id;
		}

		// Insert message record
		if (convId) {
			await supabaseAdmin.from('messages').insert({
				conversation_id: convId,
				direction: 'outbound',
				body: msgBody,
				from_number: fromNumber,
				to_number: toNumber,
				twilio_sid: messageSid,
				status: sendStatus,
				metadata: {
					source: 'ivr',
					sent_via: sentVia,
					...(callSid && { call_sid: callSid })
				}
			});

			// Update conversation last_message
			await supabaseAdmin
				.from('conversations')
				.update({
					last_message: msgBody.substring(0, 200),
					last_at: new Date().toISOString(),
					status: 'active'
				})
				.eq('id', convId);
		}

		console.log(
			`Studio-send: SMS sent via ${sentVia} to ${toNumber}, sid=${messageSid}, conv=${convId}`
		);
		return res.json({ success: true, message_sid: messageSid, conversation_id: convId });
	} catch (err) {
		console.error('Studio-send failed:', err.message);
		return res.status(500).json({ error: err.message });
	}
});

export default router;
