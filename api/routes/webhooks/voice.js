import { Router } from 'express';
import express from 'express';
import { supabaseAdmin } from '../../services/supabase.js';

const router = Router();

// Twilio sends URL-encoded data, NOT JSON
router.use(express.urlencoded({ extended: false }));

/**
 * POST /api/webhooks/voice/incoming
 * Twilio Studio sends this at flow start via HTTP Request widget.
 * Just log the call — Studio handles the IVR.
 */
router.post('/incoming', async (req, res) => {
  const { CallSid, From, To, CallStatus } = req.body;

  if (!CallSid) {
    return res.sendStatus(200);
  }

  const { error } = await supabaseAdmin
    .from('call_logs')
    .insert({
      twilio_sid: CallSid,
      direction: 'inbound',
      from_number: From || 'unknown',
      to_number: To || '',
      status: CallStatus || 'initiated',
      metadata: {
        caller_city: req.body.CallerCity || null,
        caller_state: req.body.CallerState || null,
        caller_country: req.body.CallerCountry || null
      }
    });

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

  const { error } = await supabaseAdmin
    .from('call_events')
    .insert({
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
router.post('/status', async (req, res) => {
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

  const { error } = await supabaseAdmin
    .from('call_logs')
    .update(update)
    .eq('twilio_sid', CallSid);

  if (error) {
    // Call log might not exist yet if incoming webhook hasn't fired
    // Try to create it instead
    if (error.message.includes('0 rows')) {
      const { error: insertError } = await supabaseAdmin
        .from('call_logs')
        .insert({
          twilio_sid: CallSid,
          direction: 'inbound',
          from_number: From || 'unknown',
          to_number: To || '',
          ...update
        });

      if (insertError) {
        console.error('Failed to create call log from status:', insertError.message);
      }
    } else {
      console.error('Failed to update call status:', error.message);
    }
  }

  res.sendStatus(200);
});

/**
 * POST /api/webhooks/voice/recording
 * Twilio recording callback (from Studio Record widget action URL).
 * Creates a voicemail entry linked to the call log.
 * Studio sends `mailbox` param to identify which voicemail box.
 */
router.post('/recording', async (req, res) => {
  const { CallSid, RecordingSid, RecordingUrl, RecordingDuration, From } = req.body;
  const mailbox = req.body.mailbox || req.body.Mailbox || null;

  // Look up the call log to link the voicemail
  const { data: callLog } = await supabaseAdmin
    .from('call_logs')
    .select('id')
    .eq('twilio_sid', CallSid)
    .maybeSingle();

  // Create the voicemail entry
  const { error } = await supabaseAdmin
    .from('voicemails')
    .insert({
      call_log_id: callLog?.id || null,
      from_number: From || 'unknown',
      recording_url: RecordingUrl || '',
      recording_sid: RecordingSid || null,
      duration: parseInt(RecordingDuration, 10) || 0,
      transcription_status: 'pending',
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

  // Respond with TwiML to end the call gracefully
  // (Studio Record widget expects TwiML back from the action URL)
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Thank you. Goodbye.</Say>
  <Hangup />
</Response>`;

  res.type('text/xml');
  res.send(twiml);
});

/**
 * POST /api/webhooks/voice/transcription
 * Twilio transcription callback.
 * Updates the voicemail with transcription text.
 */
router.post('/transcription', async (req, res) => {
  const { RecordingSid, TranscriptionText, TranscriptionStatus } = req.body;

  if (!RecordingSid) {
    return res.sendStatus(200);
  }

  const status = TranscriptionStatus === 'completed' ? 'completed' : 'failed';

  const { error } = await supabaseAdmin
    .from('voicemails')
    .update({
      transcription: TranscriptionText || null,
      transcription_status: status
    })
    .eq('recording_sid', RecordingSid);

  if (error) {
    console.error('Failed to update transcription:', error.message);
  }

  res.sendStatus(200);
});

export default router;
