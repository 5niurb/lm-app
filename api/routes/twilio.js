import { Router } from 'express';
import twilio from 'twilio';
import { supabaseAdmin } from '../services/supabase.js';
import { verifyToken } from '../middleware/auth.js';
import { validateTwilioSignature } from '../middleware/twilioSignature.js';
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
 * POST /api/twilio/voice
 * TwiML handler for outbound calls initiated from the browser softphone.
 * Twilio hits this URL when the softphone makes a call.
 *
 * The softphone sends the target number as a `To` parameter.
 * Also logs the outbound call to call_logs.
 */
router.post('/voice', async (req, res) => {
	const twiml = new twilio.twiml.VoiceResponse();
	const to = req.body.To;
	const callSid = req.body.CallSid;
	const from = req.body.From || req.body.Caller || process.env.TWILIO_PHONE_NUMBER;

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
						source: 'softphone',
						caller_identity: req.body.From || 'unknown'
					}
				});
			} catch (e) {
				console.error('Failed to log outbound call:', e.message);
			}
		}

		// Outbound call from browser — dial the number
		const dial = twiml.dial({
			callerId: process.env.TWILIO_PHONE_NUMBER || '+12134442242',
			timeout: 20,
			action: '/api/twilio/outbound-status',
			method: 'POST'
		});

		if (to.startsWith('client:')) {
			// Calling another browser client
			dial.client(to.replace('client:', ''));
		} else {
			// Calling a phone number
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
 * Rings: SIP endpoint + browser softphone + fallback phone simultaneously.
 * First one to answer wins.
 *
 * Studio calls this as a TwiML Redirect widget.
 * IMPORTANT: All callback URLs must be ABSOLUTE because Twilio executes this
 * TwiML in a redirect context and relative URLs won't resolve back to us.
 */
router.post('/connect-operator', (req, res) => {
	const twiml = new twilio.twiml.VoiceResponse();
	const callerNumber = req.body.From || req.body.Caller || 'Unknown';
	const sipUser = process.env.TWILIO_SIP1_USERNAME;
	const sipPass = process.env.TWILIO_SIP1_PASSWORD;
	const baseUrl =
		process.env.RENDER_EXTERNAL_URL ||
		process.env.FRONTEND_URL_PUBLIC ||
		'https://api.lemedspa.app';

	const dial = twiml.dial({
		callerId: callerNumber,
		timeout: 25,
		action: `${baseUrl}/api/twilio/connect-operator-status`,
		method: 'POST'
	});

	// 1. Ring SIP endpoint (LeMed Flex SIP domain)
	if (sipUser && sipPass) {
		dial.sip(
			{
				username: sipUser,
				password: sipPass
			},
			`sip:${sipUser}@lemedflex.sip.twilio.com`
		);
	}

	// 2. Ring the browser softphone client
	dial.client('lea');

	// No fallback phone number — SIP + softphone only

	res.type('text/xml');
	res.send(twiml.toString());
});

/**
 * POST /api/twilio/connect-operator-status
 * Called after the operator dial completes.
 * If nobody answered, offers "press 1 to text" then falls back to voicemail.
 * All URLs MUST be absolute (see connect-operator comment).
 */
router.post('/connect-operator-status', validateTwilioSignature, (req, res) => {
	const twiml = new twilio.twiml.VoiceResponse();
	const dialStatus = req.body.DialCallStatus;
	const baseUrl =
		process.env.RENDER_EXTERNAL_URL ||
		process.env.FRONTEND_URL_PUBLIC ||
		'https://api.lemedspa.app';

	if (dialStatus === 'no-answer' || dialStatus === 'busy' || dialStatus === 'failed') {
		const gather = twiml.gather({
			numDigits: 1,
			timeout: 5,
			action: `${baseUrl}/api/twilio/connect-operator-text`,
			method: 'POST'
		});
		gather.play('https://lm-ivr-assets-2112.twil.io/assets/apologize-victoria-fixed-m4a.m4a');

		// Timeout fallback — record voicemail
		twiml.record({
			maxLength: 120,
			transcribe: false,
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
router.post('/connect-operator-text', validateTwilioSignature, async (req, res) => {
	const twiml = new twilio.twiml.VoiceResponse();
	const callerNumber = req.body.From || req.body.Caller;
	const twilioNumber = req.body.Called || req.body.To || process.env.TWILIO_PHONE_NUMBER;
	const digit = req.body.Digits;

	if (digit !== '1') {
		// Any digit other than 1 — fall through to voicemail
		const baseUrl =
			process.env.RENDER_EXTERNAL_URL ||
			process.env.FRONTEND_URL_PUBLIC ||
			'https://api.lemedspa.app';
		twiml.record({
			maxLength: 120,
			transcribe: false,
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
			const baseUrl =
				process.env.RENDER_EXTERNAL_URL ||
				process.env.FRONTEND_URL_PUBLIC ||
				'https://api.lemedspa.app';

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

export default router;
