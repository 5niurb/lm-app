import { Router } from 'express';
import express from 'express';
import { supabaseAdmin } from '../../services/supabase.js';

const router = Router();

// Twilio sends URL-encoded data, NOT JSON
router.use(express.urlencoded({ extended: false }));

/**
 * POST /api/webhooks/voice/incoming
 * Twilio incoming call webhook.
 * Creates a call_log entry and returns TwiML for call handling.
 */
router.post('/incoming', async (req, res) => {
  const { CallSid, From, To, CallStatus } = req.body;

  // Create the call log entry immediately
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

  // For now: straight to voicemail greeting + record
  // Future: check call_routing_rules, ring extensions, IVR menu
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna" language="en-US">Thank you for calling Le Med Spa. We are currently unable to take your call. Please leave a message after the beep, and we will return your call as soon as possible.</Say>
  <Record
    maxLength="120"
    action="/api/webhooks/voice/recording"
    transcribe="true"
    transcribeCallback="/api/webhooks/voice/transcription"
    playBeep="true"
  />
  <Say voice="Polly.Joanna">We did not receive a recording. Goodbye.</Say>
</Response>`;

  res.type('text/xml');
  res.send(twiml);
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
 * Twilio recording callback.
 * Creates a voicemail entry linked to the call log.
 */
router.post('/recording', async (req, res) => {
  const { CallSid, RecordingSid, RecordingUrl, RecordingDuration, From } = req.body;

  // Look up the call log to link the voicemail
  const { data: callLog } = await supabaseAdmin
    .from('call_logs')
    .select('id')
    .eq('twilio_sid', CallSid)
    .single();

  // Create the voicemail entry
  const { error } = await supabaseAdmin
    .from('voicemails')
    .insert({
      call_log_id: callLog?.id || null,
      from_number: From || 'unknown',
      recording_url: RecordingUrl || '',
      recording_sid: RecordingSid || null,
      duration: parseInt(RecordingDuration, 10) || 0,
      transcription_status: 'pending'
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

  // Respond with TwiML to end the call
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
