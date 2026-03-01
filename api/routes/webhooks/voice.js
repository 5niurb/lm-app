import { Router } from 'express';
import express from 'express';
import { supabaseAdmin } from '../../services/supabase.js';
import { validateTwilioSignature } from '../../middleware/twilioSignature.js';
import { sendEmail } from '../../services/resend.js';
import { twilioClient } from '../../services/twilio.js';
import { lookupContactByPhone } from '../../services/phone-lookup.js';

const router = Router();

// Twilio sends URL-encoded data; Studio save widgets send JSON
router.use(express.urlencoded({ extended: false }));
router.use(express.json());

/**
 * GET /api/webhooks/voice/hours-check
 * Returns whether the business is currently open or closed.
 * Called by Twilio Studio to route press-0 to operator (open) or
 * closed greeting (after hours).
 *
 * Le Med Spa hours (America/Los_Angeles):
 *   Mon–Fri: 10:00 AM – 6:00 PM
 *   Sat:     10:00 AM – 4:00 PM
 *   Sun:     Closed
 */
router.get('/hours-check', (req, res) => {
	// Query param override — ?force=open or ?force=closed (for Studio test flows)
	const force = req.query.force;
	if (force === 'open' || force === 'closed') {
		const now = new Date();
		const laTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
		const hour = req.query.hour != null ? parseInt(req.query.hour, 10) : laTime.getHours();
		return res.json({
			status: force,
			forced: true,
			day: laTime.getDay(),
			hour,
			timezone: 'America/Los_Angeles'
		});
	}

	// Env var override — set FORCE_HOURS_OPEN=true on Render to bypass hours check
	if (process.env.FORCE_HOURS_OPEN === 'true') {
		return res.json({ status: 'open', forced: true, timezone: 'America/Los_Angeles' });
	}

	// Get current time in LA timezone
	const now = new Date();
	const laTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
	const day = laTime.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
	const hour = laTime.getHours();
	const minute = laTime.getMinutes();
	const timeDecimal = hour + minute / 60;

	let status = 'closed';

	if (day >= 1 && day <= 5) {
		// Mon–Fri: 10:00 AM – 6:00 PM
		if (timeDecimal >= 10 && timeDecimal < 18) {
			status = 'open';
		}
	} else if (day === 6) {
		// Sat: 10:00 AM – 4:00 PM
		if (timeDecimal >= 10 && timeDecimal < 16) {
			status = 'open';
		}
	}
	// Sun: always closed

	return res.json({ status, day, hour: Math.floor(timeDecimal), timezone: 'America/Los_Angeles' });
});

/**
 * POST /api/webhooks/voice/incoming
 * Twilio Studio sends this at flow start via HTTP Request widget.
 * Just log the call — Studio handles the IVR.
 *
 * Captures CallerName from Twilio CNAM lookup and matches against
 * the contacts table by phone number.
 */
router.post('/incoming', async (req, res) => {
	const { CallSid, From, To, CallStatus } = req.body;

	if (!CallSid) {
		return res.sendStatus(200);
	}

	// Twilio CNAM lookup — CallerName comes automatically on inbound calls
	const callerName = req.body.CallerName || null;

	// Try to match caller against known contacts by phone number
	// Use multiple format variants for robust matching
	let contactId = null;
	let contactName = null;
	if (From) {
		const phoneDigits = From.replace(/\D/g, '');

		// Build variants: +13106218356 → ['13106218356', '3106218356', '+13106218356']
		const variants = [phoneDigits];
		if (phoneDigits.length === 11 && phoneDigits.startsWith('1')) {
			variants.push(phoneDigits.slice(1));
		}
		if (phoneDigits.length === 10) {
			variants.push('1' + phoneDigits);
		}
		variants.push(From);

		const orFilter = variants.map((v) => `phone_normalized.eq.${v},phone.eq.${v}`).join(',');
		const { data: contact } = await supabaseAdmin
			.from('contacts')
			.select('id, full_name, tags')
			.or(orFilter)
			.limit(1)
			.maybeSingle();

		if (contact) {
			contactId = contact.id;
			contactName = contact.full_name;
		} else if (phoneDigits) {
			// Unknown caller — auto-create contact record tagged as 'unknown'
			// Will be promoted to lead/patient when a triggering action occurs
			// (added to AR, appointment booked, or meaningful communication)
			const newContact = {
				phone: From,
				phone_normalized: phoneDigits,
				full_name: callerName || null,
				first_name: callerName || null,
				source: 'inbound_call',
				tags: ['unknown'],
				metadata: {
					first_seen: new Date().toISOString(),
					caller_city: req.body.CallerCity || null,
					caller_state: req.body.CallerState || null
				}
			};

			const { data: created, error: createErr } = await supabaseAdmin
				.from('contacts')
				.insert(newContact)
				.select('id, full_name')
				.single();

			if (created) {
				contactId = created.id;
				contactName = created.full_name;
			} else if (createErr) {
				console.error('Failed to auto-create contact:', createErr.message);
			}
		}
	}

	// Use contact name if found, otherwise fall back to Twilio CNAM
	const displayName = contactName || callerName;

	const { error } = await supabaseAdmin.from('call_logs').upsert(
		{
			twilio_sid: CallSid,
			direction: 'inbound',
			from_number: From || 'unknown',
			to_number: To || '',
			twilio_number: To || null,
			status: CallStatus || 'initiated',
			caller_name: displayName,
			contact_id: contactId,
			metadata: {
				caller_name_cnam: callerName,
				caller_city: req.body.CallerCity || null,
				caller_state: req.body.CallerState || null,
				caller_country: req.body.CallerCountry || null,
				caller_zip: req.body.CallerZip || null
			}
		},
		{ onConflict: 'twilio_sid' }
	);

	if (error) {
		console.error('Failed to create call log:', error.message);
	}

	// No TwiML — Studio handles the IVR
	res.sendStatus(200);
});

/**
 * POST /api/webhooks/voice/event
 * Twilio Studio sends this at key IVR decision points.
 * Logs menu selections, transfers, voicemail starts, etc.
 *
 * Expected body params (sent by Studio HTTP Request widget):
 *   CallSid       — always present
 *   event_type    — e.g. 'menu_selection', 'transfer', 'voicemail_start'
 *   digit/Digits  — key pressed
 *   menu          — which menu (e.g. 'main', 'directory', 'accounts')
 *   mailbox       — for voicemail_start events
 *   action        — descriptive label (e.g. 'forward_to_sip', 'play_hours')
 */
router.post('/event', async (req, res) => {
	const { CallSid } = req.body;

	if (!CallSid) {
		return res.sendStatus(200);
	}

	// Look up the call log to link the event
	const { data: callLog } = await supabaseAdmin
		.from('call_logs')
		.select('id')
		.eq('twilio_sid', CallSid)
		.maybeSingle();

	const eventType = req.body.event_type || req.body.EventType || 'unknown';
	const eventData = {};

	// Capture whatever Studio sends
	if (req.body.digit || req.body.Digits) {
		eventData.digit = req.body.digit || req.body.Digits;
	}
	if (req.body.menu) {
		eventData.menu = req.body.menu;
	}
	if (req.body.mailbox) {
		eventData.mailbox = req.body.mailbox;
	}
	if (req.body.action) {
		eventData.action = req.body.action;
	}

	const { error } = await supabaseAdmin.from('call_events').insert({
		call_log_id: callLog?.id || null,
		twilio_sid: CallSid,
		event_type: eventType,
		event_data: eventData
	});

	if (error) {
		console.error('Failed to log call event:', error.message);
	}

	res.sendStatus(200);
});

/**
 * POST /api/webhooks/voice/status
 * Twilio call status callback.
 * Updates the call_log as the call progresses through states.
 */
router.post('/status', validateTwilioSignature, async (req, res) => {
	const { CallSid, CallStatus, CallDuration, From, To } = req.body;

	if (!CallSid) {
		return res.sendStatus(200);
	}

	// Build the update payload
	const update = {
		status: CallStatus || 'initiated'
	};

	if (CallDuration) {
		update.duration = parseInt(CallDuration, 10);
	}

	// Determine disposition from final status
	if (CallStatus === 'completed') {
		update.ended_at = new Date().toISOString();
		// If duration > 0, call was answered; otherwise it was missed/voicemail
		if (parseInt(CallDuration, 10) > 0) {
			update.disposition = 'answered';
		}
	} else if (CallStatus === 'no-answer') {
		update.disposition = 'missed';
		update.ended_at = new Date().toISOString();
	} else if (CallStatus === 'busy') {
		update.disposition = 'missed';
		update.ended_at = new Date().toISOString();
	} else if (CallStatus === 'failed' || CallStatus === 'canceled') {
		update.disposition = 'abandoned';
		update.ended_at = new Date().toISOString();
	}

	const { error } = await supabaseAdmin.from('call_logs').update(update).eq('twilio_sid', CallSid);

	if (error) {
		// Call log might not exist yet if incoming webhook hasn't fired
		// Try to create it instead, with contact lookup
		if (error.message.includes('0 rows')) {
			// Try to match against contacts for caller name
			let contactId = null;
			let contactName = null;
			const lookupPhone = From || To;
			if (lookupPhone) {
				const digits = lookupPhone.replace(/\D/g, '');
				const variants = [digits];
				if (digits.length === 11 && digits.startsWith('1')) variants.push(digits.slice(1));
				if (digits.length === 10) variants.push('1' + digits);
				variants.push(lookupPhone);
				const orFilter = variants.map((v) => `phone_normalized.eq.${v},phone.eq.${v}`).join(',');
				const { data: contact } = await supabaseAdmin
					.from('contacts')
					.select('id, full_name')
					.or(orFilter)
					.limit(1)
					.maybeSingle();
				if (contact) {
					contactId = contact.id;
					contactName = contact.full_name;
				}
			}

			const { error: insertError } = await supabaseAdmin.from('call_logs').upsert(
				{
					twilio_sid: CallSid,
					direction: 'inbound',
					from_number: From || 'unknown',
					to_number: To || '',
					caller_name: contactName,
					contact_id: contactId,
					...update
				},
				{ onConflict: 'twilio_sid' }
			);

			if (insertError) {
				console.error('Failed to create call log from status:', insertError.message);
			}
		} else {
			console.error('Failed to update call status:', error.message);
		}
	}

	// Send call notification (SMS + email) for every inbound call at terminal state
	const isTerminal = ['completed', 'no-answer', 'busy', 'failed', 'canceled'].includes(CallStatus);
	if (isTerminal && From) {
		// Look up caller name
		let callerName = null;
		const { data: callLog } = await supabaseAdmin
			.from('call_logs')
			.select('caller_name, disposition')
			.eq('twilio_sid', CallSid)
			.maybeSingle();
		callerName = callLog?.caller_name;
		const disposition = callLog?.disposition || update.disposition || CallStatus;

		// Fire-and-forget — don't block the response
		sendCallNotification({
			from: From,
			callerName,
			disposition,
			duration: parseInt(CallDuration, 10) || 0
		}).catch((err) => console.error('[status] Notification error:', err.message));
	}

	res.sendStatus(200);
});

/**
 * POST /api/webhooks/voice/recording
 * Twilio recording callback — called from BOTH:
 *   1. <Record action="..."> — fires when caller hangs up (has From number)
 *   2. recordingStatusCallback — fires when recording is processed (may lack From)
 *
 * Both hit the same endpoint, so we use upsert on recording_sid to avoid
 * creating duplicate voicemail entries. The first hit (with From) wins;
 * the second hit updates only if it has better data.
 */
router.post('/recording', validateTwilioSignature, async (req, res) => {
	const { CallSid, RecordingSid, RecordingUrl, RecordingDuration, From } = req.body;
	const mailbox = req.query.mailbox || req.body.mailbox || req.body.Mailbox || null;

	if (!RecordingSid) {
		// Nothing to record without a RecordingSid
		res.type('text/xml');
		res.send('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup /></Response>');
		return;
	}

	// Check if this recording already exists (from the other callback)
	const { data: existing } = await supabaseAdmin
		.from('voicemails')
		.select('id, from_number, call_log_id')
		.eq('recording_sid', RecordingSid)
		.maybeSingle();

	if (existing) {
		// Already have this recording — update only if we have better data
		const updates = {};
		if (From && From !== 'unknown' && existing.from_number === 'unknown') {
			updates.from_number = From;
		}
		if (!existing.call_log_id && CallSid) {
			const { data: callLog } = await supabaseAdmin
				.from('call_logs')
				.select('id')
				.eq('twilio_sid', CallSid)
				.maybeSingle();
			if (callLog?.id) updates.call_log_id = callLog.id;
		}
		if (Object.keys(updates).length > 0) {
			await supabaseAdmin.from('voicemails').update(updates).eq('id', existing.id);
		}
	} else {
		// First time seeing this recording — create the voicemail
		let callLog = null;
		if (CallSid) {
			const { data } = await supabaseAdmin
				.from('call_logs')
				.select('id')
				.eq('twilio_sid', CallSid)
				.maybeSingle();
			callLog = data;

			// Fallback: match by phone number + recent timing (within 5 min)
			// TwiML redirects from Studio can cause CallSid mismatches
			if (!callLog && From) {
				const { data: phoneMatch } = await supabaseAdmin
					.from('call_logs')
					.select('id')
					.eq('from_number', From)
					.eq('direction', 'inbound')
					.gte('started_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
					.order('started_at', { ascending: false })
					.limit(1)
					.maybeSingle();
				callLog = phoneMatch;
			}

			// Last resort: create a call_log so voicemail has a parent record
			if (!callLog && From) {
				const { contactId, contactName } = await lookupContactByPhone(From);
				const { data: created } = await supabaseAdmin
					.from('call_logs')
					.upsert(
						{
							twilio_sid: CallSid,
							direction: 'inbound',
							from_number: From,
							to_number: req.body.To || req.body.Called || process.env.TWILIO_PHONE_NUMBER || '',
							status: 'completed',
							disposition: 'voicemail',
							caller_name: contactName,
							contact_id: contactId,
							metadata: { source: 'recording_fallback' }
						},
						{ onConflict: 'twilio_sid' }
					)
					.select('id')
					.single();
				callLog = created;
			}
		} else if (From) {
			// No CallSid at all — try phone match
			const { data: phoneMatch } = await supabaseAdmin
				.from('call_logs')
				.select('id')
				.eq('from_number', From)
				.eq('direction', 'inbound')
				.gte('started_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
				.order('started_at', { ascending: false })
				.limit(1)
				.maybeSingle();
			callLog = phoneMatch;
		}

		const { error } = await supabaseAdmin.from('voicemails').insert({
			call_log_id: callLog?.id || null,
			from_number: From || 'unknown',
			recording_url: RecordingUrl || '',
			recording_sid: RecordingSid,
			duration: parseInt(RecordingDuration, 10) || 0,
			transcription_status: null,
			mailbox: mailbox
		});

		if (error) {
			console.error('Failed to create voicemail:', error.message);
		}

		// Update the call log disposition to voicemail
		if (callLog?.id) {
			await supabaseAdmin
				.from('call_logs')
				.update({
					disposition: 'voicemail',
					recording_url: RecordingUrl,
					recording_duration: parseInt(RecordingDuration, 10) || 0
				})
				.eq('id', callLog.id);
		}

		// Send email notification only if voicemail was actually created (prevents duplicates across machines)
		if (!error) {
			try {
				let callerName = null;
				if (callLog?.id) {
					const { data: cl } = await supabaseAdmin
						.from('call_logs')
						.select('caller_name')
						.eq('id', callLog.id)
						.maybeSingle();
					callerName = cl?.caller_name;
				}
				await sendVoicemailEmail({
					mailbox: mailbox || 'operator',
					from: From || 'Unknown',
					callerName,
					duration: parseInt(RecordingDuration, 10) || 0,
					recordingSid: RecordingSid,
					transcription: null
				});
			} catch (err) {
				console.error('[recording] Email error:', err.message);
			}
		}
	}

	// Respond with TwiML to end the call gracefully
	// (The <Record> action URL expects TwiML back; recordingStatusCallback ignores it)
	const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Thank you. Goodbye.</Say>
  <Hangup />
</Response>`;

	res.type('text/xml');
	res.send(twiml);
});

/**
 * POST /api/webhooks/voice/save-voicemail
 * Called by Twilio Studio's make-http-request widget after record-voicemail.
 * No Twilio signature validation — Studio HTTP Request widgets don't sign.
 *
 * Expected body params (URL-encoded from Studio):
 *   RecordingSid, RecordingUrl, RecordingDuration — from widgets.{name}.*
 *   CallSid, From, To — from trigger.call.*
 *   mailbox — hardcoded per widget (operator, lea, clinical_md, accounts)
 */
router.post('/save-voicemail', async (req, res) => {
	const { CallSid, RecordingSid, RecordingUrl, RecordingDuration, From, To } = req.body;
	const mailbox = req.body.mailbox || 'operator';

	if (!RecordingSid) {
		return res.json({ success: false, error: 'No RecordingSid' });
	}

	// Check if this recording already exists (avoid duplicates)
	const { data: existing } = await supabaseAdmin
		.from('voicemails')
		.select('id')
		.eq('recording_sid', RecordingSid)
		.maybeSingle();

	if (existing) {
		return res.json({ success: true, duplicate: true });
	}

	// Look up the call log by CallSid
	let callLog = null;
	if (CallSid) {
		const { data } = await supabaseAdmin
			.from('call_logs')
			.select('id')
			.eq('twilio_sid', CallSid)
			.maybeSingle();
		callLog = data;

		// Fallback: match by phone + recent timing
		if (!callLog && From) {
			const { data: phoneMatch } = await supabaseAdmin
				.from('call_logs')
				.select('id')
				.eq('from_number', From)
				.eq('direction', 'inbound')
				.gte('started_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
				.order('started_at', { ascending: false })
				.limit(1)
				.maybeSingle();
			callLog = phoneMatch;
		}

		// Last resort: create a call_log
		if (!callLog && From) {
			const { contactId, contactName } = await lookupContactByPhone(From);
			const { data: created } = await supabaseAdmin
				.from('call_logs')
				.insert({
					twilio_sid: CallSid,
					direction: 'inbound',
					from_number: From,
					to_number: To || process.env.TWILIO_PHONE_NUMBER || '',
					status: 'completed',
					disposition: 'voicemail',
					caller_name: contactName,
					contact_id: contactId,
					metadata: { source: 'studio_save_voicemail' }
				})
				.select('id')
				.single();
			callLog = created;
		}
	}

	const { error } = await supabaseAdmin.from('voicemails').insert({
		call_log_id: callLog?.id || null,
		from_number: From || 'unknown',
		recording_url: RecordingUrl || '',
		recording_sid: RecordingSid,
		duration: parseInt(RecordingDuration, 10) || 0,
		mailbox
	});

	if (error) {
		console.error('[save-voicemail] Failed:', error.message);
		return res.json({ success: false, error: error.message });
	}

	// Update call log disposition
	if (callLog?.id) {
		await supabaseAdmin
			.from('call_logs')
			.update({
				disposition: 'voicemail',
				recording_url: RecordingUrl,
				recording_duration: parseInt(RecordingDuration, 10) || 0
			})
			.eq('id', callLog.id);
	}

	console.log(`[save-voicemail] Saved ${mailbox} voicemail from ${From} (${RecordingSid})`);
	res.json({ success: true });
});

/**
 * POST /api/webhooks/voice/transcription
 * Twilio transcription callback.
 * Updates the voicemail with transcription text, then sends the combined
 * voicemail notification email (recording link + transcript in one email).
 */
router.post('/transcription', validateTwilioSignature, async (req, res) => {
	const { RecordingSid, TranscriptionText, TranscriptionStatus } = req.body;

	if (!RecordingSid) {
		return res.sendStatus(200);
	}

	const status = TranscriptionStatus === 'completed' ? 'completed' : 'failed';

	const { data: voicemail, error } = await supabaseAdmin
		.from('voicemails')
		.update({
			transcription: TranscriptionText || null,
			transcription_status: status
		})
		.eq('recording_sid', RecordingSid)
		.select('id, from_number, mailbox, duration, call_log_id, created_at')
		.maybeSingle();

	if (error) {
		console.error('Failed to update transcription:', error.message);
	}

	console.log(`[transcription] Updated ${RecordingSid} — status: ${status}`);

	// Send single consolidated SMS/MMS notification (recording + transcript)
	if (voicemail && twilioClient) {
		try {
			const apiBase = process.env.API_BASE_URL || 'https://api.lemedspa.app';
			const playUrl = `${apiBase}/api/webhooks/voice/play-recording/${RecordingSid}`;
			const fromPhone = voicemail.from_number || 'Unknown';

			// Look up caller name from call log → contact
			let callerName = null;
			if (voicemail.call_log_id) {
				const { data: cl } = await supabaseAdmin
					.from('call_logs')
					.select('caller_name, contact_id')
					.eq('id', voicemail.call_log_id)
					.maybeSingle();
				callerName = cl?.caller_name;
				// If no caller_name on call log, try the linked contact
				if (!callerName && cl?.contact_id) {
					const { data: contact } = await supabaseAdmin
						.from('contacts')
						.select('full_name')
						.eq('id', cl.contact_id)
						.maybeSingle();
					callerName = contact?.full_name;
				}
			}
			// Last resort: search contacts by phone number
			if (!callerName && fromPhone !== 'Unknown') {
				const { data: contact } = await supabaseAdmin
					.from('contacts')
					.select('full_name')
					.eq('phone', fromPhone)
					.maybeSingle();
				callerName = contact?.full_name;
			}

			const displayName = callerName || formatPhone(fromPhone);
			const body = TranscriptionText
				? `New voicemail from ${displayName}:\n\n"${TranscriptionText}"`
				: `New voicemail from ${displayName}`;

			const msg = await twilioClient.messages.create({
				to: '+13106218356',
				from: process.env.TWILIO_PHONE_NUMBER,
				body,
				mediaUrl: [playUrl]
			});
			console.log(`[transcription] SMS sent — SID: ${msg.sid}`);
		} catch (smsErr) {
			console.error('[transcription] SMS error:', smsErr.message);
		}
	}

	res.sendStatus(200);
});

/**
 * GET /api/webhooks/voice/record-voicemail?mailbox=X
 * Returns TwiML that records with transcription enabled.
 * Called via twiml-redirect from Studio after the greeting plays.
 */
router.all('/record-voicemail', (req, res) => {
	const mailbox = req.query.mailbox || 'operator';
	const apiBase = process.env.API_BASE_URL || 'https://api.lemedspa.app';

	const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Record
    maxLength="120"
    playBeep="true"
    trim="trim-silence"
    timeout="5"
    transcribe="true"
    transcribeCallback="${apiBase}/api/webhooks/voice/transcription"
    action="${apiBase}/api/webhooks/voice/voicemail-recorded?mailbox=${encodeURIComponent(mailbox)}"
  />
  <Say voice="Polly.Joanna">We didn't receive a message. Goodbye.</Say>
  <Hangup />
</Response>`;

	res.type('text/xml');
	res.send(twiml);
});

/**
 * POST /api/webhooks/voice/voicemail-recorded?mailbox=X
 * <Record action> callback — saves voicemail to DB and sends email notification.
 * Twilio sends URL-encoded body with recording data.
 */
router.all('/voicemail-recorded', async (req, res) => {
	const { CallSid, RecordingSid, RecordingUrl, RecordingDuration, From, To } = req.body;
	const mailbox = req.query.mailbox || req.body.mailbox || 'operator';

	if (!RecordingSid) {
		res.type('text/xml');
		return res.send('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup /></Response>');
	}

	// Duplicate check
	const { data: existing } = await supabaseAdmin
		.from('voicemails')
		.select('id')
		.eq('recording_sid', RecordingSid)
		.maybeSingle();

	if (existing) {
		res.type('text/xml');
		return res.send(
			'<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">Thank you. Goodbye.</Say><Hangup /></Response>'
		);
	}

	// Look up the call log
	let callLog = null;
	let callerName = null;
	if (CallSid) {
		const { data } = await supabaseAdmin
			.from('call_logs')
			.select('id, caller_name')
			.eq('twilio_sid', CallSid)
			.maybeSingle();
		callLog = data;
		callerName = data?.caller_name;

		if (!callLog && From) {
			const { data: phoneMatch } = await supabaseAdmin
				.from('call_logs')
				.select('id, caller_name')
				.eq('from_number', From)
				.eq('direction', 'inbound')
				.gte('started_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
				.order('started_at', { ascending: false })
				.limit(1)
				.maybeSingle();
			callLog = phoneMatch;
			callerName = phoneMatch?.caller_name;
		}

		if (!callLog && From) {
			const { contactId: cId, contactName: cName } = await lookupContactByPhone(From);
			const { data: created } = await supabaseAdmin
				.from('call_logs')
				.insert({
					twilio_sid: CallSid,
					direction: 'inbound',
					from_number: From,
					to_number: To || process.env.TWILIO_PHONE_NUMBER || '',
					status: 'completed',
					disposition: 'voicemail',
					caller_name: cName,
					contact_id: cId,
					metadata: { source: 'twiml_record_voicemail' }
				})
				.select('id')
				.single();
			callLog = created;
			if (!callerName) callerName = cName;
		}
	}

	const duration = parseInt(RecordingDuration, 10) || 0;

	const { data: voicemail, error } = await supabaseAdmin
		.from('voicemails')
		.insert({
			call_log_id: callLog?.id || null,
			from_number: From || 'unknown',
			recording_url: RecordingUrl || '',
			recording_sid: RecordingSid,
			duration,
			transcription_status: 'pending',
			mailbox
		})
		.select('id')
		.maybeSingle();

	if (error) {
		console.error('[voicemail-recorded] Failed:', error.message);
	}

	// Update call log disposition
	if (callLog?.id) {
		await supabaseAdmin
			.from('call_logs')
			.update({
				disposition: 'voicemail',
				recording_url: RecordingUrl,
				recording_duration: duration
			})
			.eq('id', callLog.id);
	}

	// Send email notification immediately (fire-and-forget)
	// Transcription updates the DB separately for the web app
	try {
		const emailResult = await sendVoicemailEmail({
			mailbox,
			from: From || 'Unknown',
			callerName,
			duration,
			recordingSid: RecordingSid,
			transcription: null
		});
		console.log(`[voicemail-recorded] Email result:`, emailResult ? 'sent' : 'no result');
	} catch (err) {
		console.error('[voicemail-recorded] Email error:', err.message);
	}

	console.log(`[voicemail-recorded] Saved ${mailbox} voicemail from ${From} (${RecordingSid})`);

	res.type('text/xml');
	res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Thank you for your message. Goodbye.</Say>
  <Hangup />
</Response>`);
});

/**
 * GET /api/webhooks/voice/play-recording/:recordingSid
 * Public recording proxy — streams Twilio recording audio.
 * No user auth needed; the recording SID is unguessable.
 * Used in voicemail notification emails.
 */
router.get('/play-recording/:recordingSid', async (req, res) => {
	const { recordingSid } = req.params;
	const accountSid = process.env.TWILIO_ACCOUNT_SID;
	const authToken = process.env.TWILIO_AUTH_TOKEN;

	if (!accountSid || !authToken) {
		return res.status(503).send('Audio playback not configured');
	}

	try {
		const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${recordingSid}.mp3`;
		const twilioRes = await fetch(url, {
			headers: {
				Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64')
			}
		});

		if (!twilioRes.ok) {
			return res.status(404).send('Recording not found');
		}

		res.set('Content-Type', 'audio/mpeg');
		const contentLength = twilioRes.headers.get('content-length');
		if (contentLength) res.set('Content-Length', contentLength);

		const reader = twilioRes.body.getReader();
		const pump = async () => {
			const { done, value } = await reader.read();
			if (done) return res.end();
			res.write(Buffer.from(value));
			return pump();
		};
		await pump();
	} catch (e) {
		console.error('[play-recording] Proxy error:', e.message);
		if (!res.headersSent) res.status(500).send('Failed to stream recording');
	}
});

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Format a phone number for display: +13105551234 → (310) 555-1234 */
function formatPhone(phone) {
	if (!phone) return 'Unknown';
	const digits = phone.replace(/\D/g, '');
	if (digits.length === 11 && digits.startsWith('1')) {
		return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
	}
	if (digits.length === 10) {
		return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
	}
	return phone;
}

/** Format mailbox slug for display: clinical_md → Clinical Md */
function formatMailbox(mailbox) {
	return (mailbox || 'operator').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Send voicemail notification email to inbox@lemedspa.com (recording + optional transcript) */
async function sendVoicemailEmail({
	mailbox,
	from,
	callerName,
	duration,
	recordingSid,
	transcription
}) {
	const apiBase = process.env.API_BASE_URL || 'https://api.lemedspa.app';
	const playUrl = `${apiBase}/api/webhooks/voice/play-recording/${recordingSid}`;

	const displayName = callerName || formatPhone(from);
	const mailboxLabel = formatMailbox(mailbox);

	const now = new Date();
	const laTime = now.toLocaleString('en-US', {
		timeZone: 'America/Los_Angeles',
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		hour12: true
	});

	const mins = Math.floor(duration / 60);
	const secs = duration % 60;
	const durationStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

	const transcriptText = transcription
		? `\nTranscript:\n"${transcription}"`
		: '\n(Transcription not available)';

	const transcriptHtml = transcription
		? `<div style="background: #252540; border-radius: 8px; padding: 16px; margin-top: 16px; border-left: 3px solid #d4a843;">
						<p style="margin: 0 0 6px; color: #999; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Transcript</p>
						<p style="margin: 0; color: #f0f0f0; font-size: 15px; line-height: 1.6;">&ldquo;${transcription}&rdquo;</p>
					</div>`
		: `<p style="margin-top: 12px; color: #666; font-size: 12px; font-style: italic;">Transcription not available</p>`;

	const toEmail = ['care@lemedspa.com', 'lea@lemedspa.com', 'ops@lemedspa.com'];
	console.log(
		`[voicemail-email] Sending to ${toEmail.join(', ')} — ${displayName} → ${mailboxLabel}`
	);
	const result = await sendEmail({
		to: toEmail,
		fromName: 'Le Med Spa Voicemail',
		subject: `New Voicemail — ${displayName} → ${mailboxLabel}`,
		text: [
			`New voicemail from ${displayName} (${from})`,
			`Mailbox: ${mailboxLabel}`,
			`Duration: ${durationStr}`,
			`Time: ${laTime}`,
			'',
			`Listen: ${playUrl}`,
			transcriptText
		].join('\n'),
		html: `
			<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
				<div style="background: #1a1a2e; border-radius: 12px; padding: 24px; color: #f0f0f0;">
					<h2 style="margin: 0 0 16px; color: #d4a843; font-size: 18px;">New Voicemail</h2>
					<table style="width: 100%; border-collapse: collapse; font-size: 14px;">
						<tr><td style="padding: 6px 0; color: #999; width: 80px;">From</td><td style="padding: 6px 0; color: #f0f0f0; font-weight: 600;">${displayName}</td></tr>
						<tr><td style="padding: 6px 0; color: #999;">Phone</td><td style="padding: 6px 0; color: #f0f0f0;">${from}</td></tr>
						<tr><td style="padding: 6px 0; color: #999;">Mailbox</td><td style="padding: 6px 0; color: #f0f0f0;">${mailboxLabel}</td></tr>
						<tr><td style="padding: 6px 0; color: #999;">Duration</td><td style="padding: 6px 0; color: #f0f0f0;">${durationStr}</td></tr>
						<tr><td style="padding: 6px 0; color: #999;">Time</td><td style="padding: 6px 0; color: #f0f0f0;">${laTime}</td></tr>
					</table>
					<div style="margin-top: 20px;">
						<a href="${playUrl}" style="display: inline-block; background: #d4a843; color: #1a1a2e; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">
							Listen to Voicemail
						</a>
					</div>
					${transcriptHtml}
				</div>
			</div>`
	});
	if (result.success) {
		console.log(`[voicemail-email] Sent — Resend ID:`, result.data?.id);
	} else {
		console.error(`[voicemail-email] Failed:`, result.error);
	}
}

/** Send SMS + email notification for an inbound call */
async function sendCallNotification({ from, callerName, disposition, duration }) {
	const displayName = callerName || formatPhone(from);
	const phoneFormatted = formatPhone(from);

	const now = new Date();
	const laTime = now.toLocaleString('en-US', {
		timeZone: 'America/Los_Angeles',
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		hour12: true
	});

	const mins = Math.floor(duration / 60);
	const secs = duration % 60;
	const durationStr = duration > 0 ? (mins > 0 ? `${mins}m ${secs}s` : `${secs}s`) : '';

	// Disposition label
	const labels = {
		answered: 'Answered',
		missed: 'Missed',
		voicemail: 'Voicemail',
		abandoned: 'Abandoned',
		completed: 'Completed',
		'no-answer': 'Missed',
		busy: 'Busy',
		failed: 'Failed',
		canceled: 'Canceled'
	};
	const label = labels[disposition] || disposition;

	// SMS — skip for voicemails (consolidated into transcription notification)
	if (twilioClient && disposition !== 'voicemail') {
		try {
			const smsBody =
				`Inbound call — ${label}` +
				`\nFrom: ${displayName}` +
				(displayName !== phoneFormatted ? `\nPhone: ${phoneFormatted}` : '') +
				(durationStr ? `\nDuration: ${durationStr}` : '') +
				`\nTime: ${laTime}`;

			const msg = await twilioClient.messages.create({
				to: '+13106218356',
				from: process.env.TWILIO_PHONE_NUMBER,
				body: smsBody
			});
			console.log(`[call-notify] SMS sent — SID: ${msg.sid}`);
		} catch (smsErr) {
			console.error('[call-notify] SMS error:', smsErr.message);
		}
	}

	// Email
	try {
		const toEmail = ['care@lemedspa.com', 'lea@lemedspa.com', 'ops@lemedspa.com'];
		await sendEmail({
			to: toEmail,
			fromName: 'Le Med Spa Calls',
			subject: `${label} Call — ${displayName}`,
			text: [
				`${label} call from ${displayName} (${from})`,
				durationStr ? `Duration: ${durationStr}` : null,
				`Time: ${laTime}`
			]
				.filter(Boolean)
				.join('\n'),
			html: `
				<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
					<div style="background: #1a1a2e; border-radius: 12px; padding: 24px; color: #f0f0f0;">
						<h2 style="margin: 0 0 16px; color: #d4a843; font-size: 18px;">${label} Call</h2>
						<table style="width: 100%; border-collapse: collapse; font-size: 14px;">
							<tr><td style="padding: 6px 0; color: #999; width: 80px;">From</td><td style="padding: 6px 0; color: #f0f0f0; font-weight: 600;">${displayName}</td></tr>
							<tr><td style="padding: 6px 0; color: #999;">Phone</td><td style="padding: 6px 0; color: #f0f0f0;">${phoneFormatted}</td></tr>
							${durationStr ? `<tr><td style="padding: 6px 0; color: #999;">Duration</td><td style="padding: 6px 0; color: #f0f0f0;">${durationStr}</td></tr>` : ''}
							<tr><td style="padding: 6px 0; color: #999;">Status</td><td style="padding: 6px 0; color: #f0f0f0;">${label}</td></tr>
							<tr><td style="padding: 6px 0; color: #999;">Time</td><td style="padding: 6px 0; color: #f0f0f0;">${laTime}</td></tr>
						</table>
					</div>
				</div>`
		});
		console.log(`[call-notify] Email sent to ${toEmail}`);
	} catch (emailErr) {
		console.error('[call-notify] Email error:', emailErr.message);
	}
}

export default router;
