import { Router } from 'express';
import twilio from 'twilio';

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
router.post('/token', (req, res) => {
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
    // Log outbound call to DB
    if (callSid) {
      try {
        const { supabaseAdmin } = await import('../services/supabase.js');
        await supabaseAdmin
          .from('call_logs')
          .insert({
            twilio_sid: callSid,
            direction: 'outbound',
            from_number: process.env.TWILIO_PHONE_NUMBER || from,
            to_number: to,
            status: 'initiated',
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
      const { supabaseAdmin } = await import('../services/supabase.js');
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

      await supabaseAdmin
        .from('call_logs')
        .update(update)
        .eq('twilio_sid', callSid);
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
 */
router.post('/connect-operator', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const callerNumber = req.body.From || req.body.Caller || 'Unknown';
  const sipUser = process.env.TWILIO_SIP1_USERNAME;
  const sipPass = process.env.TWILIO_SIP1_PASSWORD;

  const dial = twiml.dial({
    callerId: callerNumber,
    timeout: 20,
    action: '/api/twilio/connect-operator-status',
    method: 'POST'
  });

  // 1. Ring SIP endpoint (LeMed Flex SIP domain)
  if (sipUser && sipPass) {
    dial.sip({
      username: sipUser,
      password: sipPass
    }, `sip:${sipUser}@lemedflex.sip.twilio.com`);
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
 * If nobody answered, you could route to voicemail here.
 */
router.post('/connect-operator-status', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const dialStatus = req.body.DialCallStatus;

  if (dialStatus === 'no-answer' || dialStatus === 'busy' || dialStatus === 'failed') {
    twiml.say({ voice: 'Polly.Joanna' },
      'Sorry, no one is available right now. Please leave a message after the beep.'
    );
    twiml.record({
      maxLength: 120,
      transcribe: false,
      transcribeCallback: '/api/webhooks/voice/transcription',
      recordingStatusCallback: '/api/webhooks/voice/recording',
      recordingStatusCallbackMethod: 'POST',
      recordingStatusCallbackEvent: 'completed',
      action: '/api/webhooks/voice/recording',
      method: 'POST'
    });
  }
  // If answered (completed), call is already done — just end gracefully

  res.type('text/xml');
  res.send(twiml.toString());
});

export default router;
