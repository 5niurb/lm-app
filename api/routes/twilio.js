import { Router } from 'express';
import twilio from 'twilio';
import { supabaseAdmin } from '../services/supabase.js';
import { verifyToken } from '../middleware/auth.js';

import {
	lookupContactByPhone,
	findConversation,
	normalizePhone
} from '../services/phone-lookup.js';

const router = Router();

const { AccessToken } = twilio.jwt;
const { VoiceGrant } = AccessToken;

/**
 * POST /api/twilio/token
 * Generates a Twilio Access Token with Voice grant for the browser softphone.
 *
 * Body: { identity: 'lea' }
 * Returns: { token, identity }
 */
router.post('/token', verifyToken, (req, res) => {
	const identity = req.body.identity || 'softphone-user';

	const accountSid = process.env.TWILIO_ACCOUNT_SID;
	const apiKeySid = process.env.TWILIO_API_KEY_SID;
	const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
	const twimlAppSid = process.env.TWILIO_TWIML_APP_SID;

	if (!accountSid || !apiKeySid || !apiKeySecret || !twimlAppSid) {
		console.error('Missing Twilio softphone env vars');
		return res.status(500).json({ error: 'Server configuration error' });
	}

	const token = new AccessToken(accountSid, apiKeySid, apiKeySecret, {
		identity,
		ttl: 3600 // 1 hour
	});

	const voiceGrant = new VoiceGrant({
		outgoingApplicationSid: twimlAppSid,
		incomingAllow: true // Allow incoming calls to this client
	});

	token.addGrant(voiceGrant);

	res.json({
		token: token.toJwt(),
		identity
	});
});

/**
 * Extract a phone number from a SIP URI or return as-is if already a number.
 * SIP devices send To as: sip:+18181234567@lemedflex.sip.twilio.com
 * Browser softphone sends: +18181234567
 */
function extractPhoneFromSipUri(to) {
	if (!to) return null;
	const sipMatch = to.match(/^sip:([^@]+)@/);
	return sipMatch ? sipMatch[1] : to;
}

/**
 * POST /api/twilio/voice
 * TwiML handler for outbound calls from the browser softphone OR SIP devices.
 * Twilio hits this URL when either source initiates a call.
 *
 * Browser softphone sends To as a phone number; SIP devices send a SIP URI.
 * Also logs the outbound call to call_logs.
 */
router.post('/voice', async (req, res) => {
	const twiml = new twilio.twiml.VoiceResponse();
	const rawTo = req.body.To;
	const callSid = req.body.CallSid;
	const from = req.body.From || req.body.Caller || process.env.TWILIO_PHONE_NUMBER;
	const isSip = rawTo?.startsWith('sip:') || !!req.body.SipDomainSid;
	const to = extractPhoneFromSipUri(rawTo);
	const baseUrl = process.env.API_BASE_URL || 'https://api.lemedspa.app';

	if (to) {
		// Log outbound call to DB with contact lookup
		if (callSid) {
			try {
				const { contactId, contactName } = await lookupContactByPhone(to);
				await supabaseAdmin.from('call_logs').insert({
					twilio_sid: callSid,
					direction: 'outbound',
					from_number: process.env.TWILIO_PHONE_NUMBER || from,
					to_number: to,
					status: 'initiated',
					caller_name: contactName,
					contact_id: contactId,
					metadata: {
						source: isSip ? 'sip' : 'softphone',
						caller_identity: req.body.From || 'unknown'
					}
				});
			} catch (e) {
				console.error('Failed to log outbound call:', e.message);
			}
		}

		// Dial the target number
		const dial = twiml.dial({
			callerId: process.env.TWILIO_PHONE_NUMBER || '+12134442242',
			timeout: 20,
			action: `${baseUrl}/api/twilio/outbound-status`,
			method: 'POST'
		});

		if (to.startsWith('client:')) {
			dial.client(to.replace('client:', ''));
		} else {
			dial.number(to);
		}
	} else {
		twiml.say('No destination specified. Goodbye.');
	}

	res.type('text/xml');
	res.send(twiml.toString());
});

/**
 * POST /api/twilio/outbound-status
 * Called when outbound dial completes. Updates the call log with final status/duration.
 */
router.post('/outbound-status', async (req, res) => {
	const twiml = new twilio.twiml.VoiceResponse();
	const callSid = req.body.CallSid;
	const dialStatus = req.body.DialCallStatus;
	const duration = parseInt(req.body.DialCallDuration || '0', 10);

	if (callSid) {
		try {
			const update = {
				status: dialStatus === 'completed' ? 'completed' : dialStatus || 'completed',
				ended_at: new Date().toISOString()
			};

			if (duration > 0) {
				update.duration = duration;
				update.disposition = 'answered';
			} else if (dialStatus === 'no-answer') {
				update.disposition = 'missed';
			} else if (dialStatus === 'busy') {
				update.disposition = 'missed';
			} else if (dialStatus === 'failed' || dialStatus === 'canceled') {
				update.disposition = 'abandoned';
			} else {
				update.disposition = 'answered';
			}

			await supabaseAdmin.from('call_logs').update(update).eq('twilio_sid', callSid);
		} catch (e) {
			console.error('Failed to update outbound call status:', e.message);
		}
	}

	// End call gracefully
	res.type('text/xml');
	res.send(twiml.toString());
});

/**
 * POST /api/twilio/connect-operator
 * TwiML endpoint used by Studio flow when caller presses 0 (operator).
 * Rings multiple targets simultaneously — first to answer wins.
 *
 * Dial order (all ring at once):
 *   1. Operator desk phone (TWILIO_OPERATOR_PHONE)
 *   2. SIP endpoint (TWILIO_OPERATOR_SIP) — lea@lemed.sip.twilio.com
 *   3. SIP endpoint 2 (TWILIO_OPERATOR_SIP2) — +18184633772@lemedflex.sip.twilio.com
 *   4. Fallback number (TWILIO_OPERATOR_FALLBACK) — optional extra ring
 *
 * Studio calls this as a TwiML Redirect widget.
 * IMPORTANT: All callback URLs must be ABSOLUTE because Twilio executes this
 * TwiML in a redirect context and relative URLs won't resolve back to us.
 */
router.post('/connect-operator', (req, res) => {
	const twiml = new twilio.twiml.VoiceResponse();
	const callerNumber = req.body.From || req.body.Caller || 'Unknown';
	const baseUrl = process.env.API_BASE_URL || 'https://api.lemedspa.app';

	const dial = twiml.dial({
		callerId: callerNumber,
		timeout: 25,
		action: `${baseUrl}/api/twilio/connect-operator-status`,
		method: 'POST'
	});

	// 1. Ring the browser softphone (Twilio Voice SDK client)
	dial.client('lea');

	// 2. Ring the operator desk phone with call screening
	// The "url" attribute is a whisper URL — fetched when the phone answers.
	// It plays "press 1 to accept" so voicemail can't steal the call.
	const operatorPhone = process.env.TWILIO_OPERATOR_PHONE;
	if (operatorPhone) {
		dial.number({ url: `${baseUrl}/api/twilio/screen-call`, method: 'POST' }, operatorPhone);
	}

	// 3. Ring the fallback number (if set and different from operator phone)
	const fallback = process.env.TWILIO_OPERATOR_FALLBACK;
	if (fallback && fallback !== operatorPhone) {
		dial.number({ url: `${baseUrl}/api/twilio/screen-call`, method: 'POST' }, fallback);
	}

	res.type('text/xml');
	res.send(twiml.toString());
});

/**
 * POST /api/twilio/screen-call
 * Whisper URL for phone number legs in connect-operator simultaneous ring.
 * Plays "press 1 to accept" — prevents voicemail from answering and
 * cancelling the Client (softphone) leg.
 *
 * If the human presses 1 → return empty TwiML (Twilio bridges the call).
 * If timeout (voicemail) → return <Hangup/> (kills this leg, others keep ringing).
 */
router.post('/screen-call', (req, res) => {
	const twiml = new twilio.twiml.VoiceResponse();

	const gather = twiml.gather({
		numDigits: 1,
		timeout: 5,
		action: `${process.env.API_BASE_URL || 'https://api.lemedspa.app'}/api/twilio/screen-call-result`,
		method: 'POST'
	});
	gather.say({ voice: 'Polly.Joanna', language: 'en-US' }, 'Incoming call. Press 1 to accept.');

	// No digit pressed (voicemail answered) — hang up this leg
	twiml.hangup();

	res.type('text/xml');
	res.send(twiml.toString());
});

/**
 * POST /api/twilio/screen-call-result
 * Called when the human presses a digit during call screening.
 * If 1 → empty TwiML (bridges the call). Otherwise → hangup.
 */
router.post('/screen-call-result', (req, res) => {
	const twiml = new twilio.twiml.VoiceResponse();
	const digit = req.body.Digits;

	if (digit !== '1') {
		twiml.hangup();
	}
	// digit === '1' → empty response bridges the call

	res.type('text/xml');
	res.send(twiml.toString());
});

/**
 * POST /api/twilio/connect-operator-status
 * Called after the operator dial completes.
 * If nobody answered, offers "press 1 to text" then falls back to voicemail.
 * All URLs MUST be absolute (see connect-operator comment).
 */
router.post('/connect-operator-status', (req, res) => {
	const twiml = new twilio.twiml.VoiceResponse();
	const dialStatus = req.body.DialCallStatus;
	const baseUrl = process.env.API_BASE_URL || 'https://api.lemedspa.app';

	if (dialStatus === 'no-answer' || dialStatus === 'busy' || dialStatus === 'failed') {
		const gather = twiml.gather({
			numDigits: 1,
			timeout: 2,
			action: `${baseUrl}/api/twilio/connect-operator-text`,
			method: 'POST'
		});
		gather.play('https://lm-ivr-assets-2112.twil.io/assets/apologize-open-victoria-new-wav.wav');

		// Timeout fallback — record voicemail
		twiml.record({
			maxLength: 120,
			transcribe: true,
			transcribeCallback: `${baseUrl}/api/webhooks/voice/transcription`,
			trim: 'trim-silence',
			recordingStatusCallback: `${baseUrl}/api/webhooks/voice/recording?mailbox=operator`,
			recordingStatusCallbackMethod: 'POST',
			recordingStatusCallbackEvent: 'completed',
			action: `${baseUrl}/api/webhooks/voice/recording?mailbox=operator`,
			method: 'POST'
		});
	}
	// If answered (completed), call is already done — just end gracefully

	res.type('text/xml');
	res.send(twiml.toString());
});

/**
 * POST /api/twilio/connect-operator-text
 * Called when caller presses 1 during the voicemail greeting.
 * Sends an SMS to initiate a 2-way text conversation, then hangs up.
 */
router.post('/connect-operator-text', async (req, res) => {
	const twiml = new twilio.twiml.VoiceResponse();
	const callerNumber = req.body.From || req.body.Caller;
	const twilioNumber = req.body.Called || req.body.To || process.env.TWILIO_PHONE_NUMBER;
	const digit = req.body.Digits;

	if (digit !== '1') {
		// Any digit other than 1 — fall through to voicemail
		const baseUrl = process.env.API_BASE_URL || 'https://api.lemedspa.app';
		twiml.record({
			maxLength: 120,
			transcribe: true,
			transcribeCallback: `${baseUrl}/api/webhooks/voice/transcription`,
			trim: 'trim-silence',
			recordingStatusCallback: `${baseUrl}/api/webhooks/voice/recording?mailbox=operator`,
			recordingStatusCallbackMethod: 'POST',
			recordingStatusCallbackEvent: 'completed',
			action: `${baseUrl}/api/webhooks/voice/recording?mailbox=operator`,
			method: 'POST'
		});
		res.type('text/xml');
		return res.send(twiml.toString());
	}

	if (digit === '1' && callerNumber) {
		try {
			const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
			const baseUrl = process.env.API_BASE_URL || 'https://api.lemedspa.app';

			const msgBody = '(LeMedSpa) Thank you for reaching out. How can we help you?';

			const twilioMsg = await client.messages.create({
				to: callerNumber,
				from: twilioNumber,
				body: msgBody,
				statusCallback: `${baseUrl}/api/webhooks/sms/status`
			});

			// Create conversation + message record — one thread per customer
			const normalizedCaller = normalizePhone(callerNumber);
			const { contactId, contactName } = await lookupContactByPhone(normalizedCaller);
			const existingConv = await findConversation(normalizedCaller);

			let convId = existingConv?.id;

			if (!convId) {
				const { data: newConv } = await supabaseAdmin
					.from('conversations')
					.insert({
						phone_number: normalizedCaller,
						twilio_number: twilioNumber,
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

			if (convId) {
				await supabaseAdmin.from('messages').insert({
					conversation_id: convId,
					direction: 'outbound',
					body: msgBody,
					from_number: twilioNumber,
					to_number: callerNumber,
					twilio_sid: twilioMsg.sid,
					status: twilioMsg.status || 'sent',
					metadata: { source: 'ivr_press1' }
				});

				await supabaseAdmin
					.from('conversations')
					.update({
						last_message: msgBody.substring(0, 200),
						last_at: new Date().toISOString(),
						status: 'active'
					})
					.eq('id', convId);
			}

			twiml.play('https://lm-ivr-assets-2112.twil.io/assets/message-sent-Victoria-wav.wav');
		} catch (err) {
			console.error('[connect-operator-text] Failed to send SMS:', err.message);
			twiml.say(
				{ voice: 'Polly.Joanna' },
				'Sorry, we were unable to send the text message. Please try calling again. Goodbye.'
			);
		}
	}

	twiml.hangup();
	res.type('text/xml');
	res.send(twiml.toString());
});

/**
 * POST /api/twilio/register-device
 * Register a mobile device push token for incoming call notifications.
 * Body: { token: string, platform: 'ios' | 'android' }
 */
router.post('/register-device', verifyToken, async (req, res) => {
	try {
		const { token, platform } = req.body;
		const userId = req.user.id;

		if (!token || !platform) {
			return res.status(400).json({ error: 'token and platform are required' });
		}
		if (!['ios', 'android'].includes(platform)) {
			return res.status(400).json({ error: 'platform must be ios or android' });
		}

		// Upsert — one token per user+platform+type
		const { error } = await supabaseAdmin.from('device_push_tokens').upsert(
			{
				user_id: userId,
				token,
				platform,
				type: 'twilio_voice',
				updated_at: new Date().toISOString()
			},
			{ onConflict: 'user_id,platform,type' }
		);

		if (error) {
			console.error('[twilio] register-device failed:', error.message);
			return res.status(500).json({ error: 'Failed to register device' });
		}

		res.json({ registered: true });
	} catch (err) {
		console.error('[twilio] register-device error:', err.message);
		res.status(500).json({ error: 'Internal server error' });
	}
});

export default router;
