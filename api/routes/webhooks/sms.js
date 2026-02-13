import { Router } from 'express';
import express from 'express';
import { supabaseAdmin } from '../../services/supabase.js';

const router = Router();

// Twilio sends URL-encoded data
router.use(express.urlencoded({ extended: false }));

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
      await supabaseAdmin
        .from('messages')
        .insert({
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

export default router;
