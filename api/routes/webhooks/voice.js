import { Router } from 'express';
import express from 'express';

const router = Router();

// Twilio sends URL-encoded data, NOT JSON
router.use(express.urlencoded({ extended: false }));

/**
 * POST /api/webhooks/voice/incoming
 * Twilio incoming call webhook.
 * Returns TwiML instructing Twilio how to handle the call.
 */
router.post('/incoming', (req, res) => {
  // TODO: Implement full call routing logic (IVR, forwarding, voicemail)
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
  <Say>We did not receive a recording. Goodbye.</Say>
</Response>`;

  res.type('text/xml');
  res.send(twiml);
});

/**
 * POST /api/webhooks/voice/status
 * Twilio call status callback.
 * Called when a call's status changes (initiated, ringing, answered, completed, etc.)
 */
router.post('/status', (req, res) => {
  const { CallSid, CallStatus, CallDuration, From, To } = req.body;

  // TODO: Update call_logs table with status info
  console.log(`Call status update: ${CallSid} — ${CallStatus} (duration: ${CallDuration || 'n/a'})`);
  console.log(`  From: ${From}, To: ${To}`);

  res.sendStatus(200);
});

/**
 * POST /api/webhooks/voice/recording
 * Twilio recording callback.
 * Called when a recording is completed and available.
 */
router.post('/recording', (req, res) => {
  const { CallSid, RecordingSid, RecordingUrl, RecordingDuration } = req.body;

  // TODO: Store recording metadata in voicemails table, download/archive the recording
  console.log(`Recording ready: ${RecordingSid} for call ${CallSid}`);
  console.log(`  URL: ${RecordingUrl}, Duration: ${RecordingDuration}s`);

  // Respond with TwiML to end the call after recording
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
 * Called when a recording transcription is completed.
 */
router.post('/transcription', (req, res) => {
  const { CallSid, RecordingSid, TranscriptionSid, TranscriptionText, TranscriptionStatus } = req.body;

  // TODO: Update voicemails table with transcription text
  console.log(`Transcription ready: ${TranscriptionSid} for recording ${RecordingSid} (call ${CallSid})`);
  console.log(`  Status: ${TranscriptionStatus}`);
  console.log(`  Text: ${TranscriptionText}`);

  res.sendStatus(200);
});

export default router;
