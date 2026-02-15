import { Router } from 'express';
import express from 'express';
import twilio from 'twilio';
import { supabaseAdmin } from '../../services/supabase.js';

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
router.post('/incoming', async (req, res) => {
	const { MessageSid, From, To, Body, NumMedia } = req.body;

	if (!MessageSid) {
		return res.sendStatus(200);
	}

	const fromNumber = From || 'unknown';
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

	try {
		// Find or create conversation
		const { data: existing } = await supabaseAdmin
			.from('conversations')
			.select('id, unread_count')
			.eq('phone_number', fromNumber)
			.maybeSingle();

		let convId;

		if (existing) {
			convId = existing.id;
			// Update conversation with new message preview
			await supabaseAdmin
				.from('conversations')
				.update({
					last_message: body.substring(0, 200),
					last_at: new Date().toISOString(),
					unread_count: (existing.unread_count || 0) + 1,
					status: 'active'
				})
				.eq('id', existing.id);
		} else {
			// Look up contact by phone
			const phoneDigits = fromNumber.replace(/\D/g, '');
			const { data: contact } = await supabaseAdmin
				.from('contacts')
				.select('id, full_name')
				.or(`phone_normalized.eq.${phoneDigits},phone.eq.${fromNumber}`)
				.limit(1)
				.maybeSingle();

			const { data: newConv } = await supabaseAdmin
				.from('conversations')
				.insert({
					phone_number: fromNumber,
					display_name: contact?.full_name || null,
					contact_id: contact?.id || null,
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

	// Respond with empty TwiML (no auto-reply — replies managed from the app)
	res.type('text/xml');
	res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
});

/**
 * POST /api/webhooks/sms/status
 * Twilio SMS status callback — updates message delivery status.
 */
router.post('/status', async (req, res) => {
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
 *   to       — caller's phone number ({{contact.channel.address}})
 *   body     — message text
 *   callSid  — the call SID (optional, for linking)
 */
router.post('/studio-send', async (req, res) => {
	const { to, body: msgBody, callSid } = req.body;

	if (!to || !msgBody) {
		return res.status(400).json({ error: 'Both "to" and "body" are required' });
	}

	// Normalize phone number
	let toNumber = to.replace(/[^\d+]/g, '');
	if (toNumber.length === 10) toNumber = '+1' + toNumber;
	if (!toNumber.startsWith('+')) toNumber = '+' + toNumber;

	// Use the same from-number logic as the messages API
	const fromNumber =
		process.env.TWILIO_SMS_FROM_NUMBER ||
		process.env.TWILIO_TEST1_PHONE_NUMBER ||
		process.env.TWILIO_PHONE_NUMBER ||
		process.env.TWILIO_MAIN_PHONE_NUMBER;

	if (!fromNumber) {
		console.error('Studio-send: No Twilio phone number configured');
		return res.status(500).json({ error: 'No Twilio phone number configured' });
	}

	try {
		// Send SMS via Twilio
		const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

		const baseUrl = process.env.RENDER_EXTERNAL_URL || process.env.API_BASE_URL || '';
		const statusCallback = baseUrl ? `${baseUrl}/api/webhooks/sms/status` : undefined;

		const twilioMsg = await client.messages.create({
			to: toNumber,
			from: fromNumber,
			body: msgBody,
			...(statusCallback && { statusCallback })
		});

		// Find or create conversation (keyed on the caller's number)
		const { data: existing } = await supabaseAdmin
			.from('conversations')
			.select('id')
			.eq('phone_number', toNumber)
			.maybeSingle();

		let convId;

		if (existing) {
			convId = existing.id;
		} else {
			// Look up contact by phone
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
					display_name: contact?.full_name || null,
					contact_id: contact?.id || null,
					last_message: msgBody.substring(0, 200),
					last_at: new Date().toISOString(),
					unread_count: 0 // Outbound — no unread
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
				twilio_sid: twilioMsg.sid,
				status: twilioMsg.status || 'sent',
				metadata: callSid ? { source: 'ivr', call_sid: callSid } : { source: 'ivr' }
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
			`Studio-send: SMS sent to ${toNumber}, twilio_sid=${twilioMsg.sid}, conv=${convId}`
		);
		return res.json({ success: true, twilio_sid: twilioMsg.sid, conversation_id: convId });
	} catch (err) {
		console.error('Studio-send failed:', err.message);
		return res.status(500).json({ error: err.message });
	}
});

export default router;
