# Design: Twilio SIP Call Routing + SMS Forwarding

**Date:** 2026-02-19
**Status:** Approved
**Approach:** Update Studio flow (Approach A) — minimal changes, keep IVR in Studio

---

## Problem

The Twilio Studio IVR flow still routes operator calls (press 0 / timeout) to HighLevel (`+18184632211`). Need to route to our SIP endpoint (`lemedflex.sip.twilio.com`) + browser softphone instead. Also need to wire up webhook logging and add "press 1 to text" to voicemail greetings.

## Architecture

```
Incoming call → Twilio Studio IVR
  │
  ├─ Flow start → POST /webhooks/voice/incoming (log call + match contact)
  │
  ├─ Press 0 / Timeout → TwiML Redirect to /api/twilio/connect-operator
  │                         ├─ SIP: grandstreamDECT@lemedflex.sip.twilio.com
  │                         ├─ Browser: client:lea
  │                         └─ No answer → voicemail (with "press 1 to text")
  │
  ├─ Press 1 → SMS "How can we help you?" (via /webhooks/sms/studio-send)
  │
  ├─ Press 2 → Hours & Location audio
  │
  └─ Press 3 → Company Directory
       ├─ 1 → Lea voicemail (with "press 1 to text")
       ├─ 2 → Clinical MD voicemail (with "press 1 to text")
       └─ 3 → Accounts menu
            ├─ 1 → SMS
            ├─ 2 → Accounts voicemail (with "press 1 to text")
            └─ 3 → connect_call_accounts (+12134442242, unchanged)
```

## Changes

### 1. Studio Flow JSON (`twilio/flows/main-ivr.json`)

**Replace `connect_call_HighLevel`** with `connect_operator_redirect`:
- Type: `add-twiml-redirect`
- URL: `https://api.lemedspa.app/api/twilio/connect-operator`
- All references (press 0, timeout) point here instead

**Add `log_incoming_call`** between Trigger and MainGreetingMenu:
- Type: `make-http-request`
- POST to `https://api.lemedspa.app/api/webhooks/voice/incoming`
- Body: CallSid, From, To, CallerName, CallerCity, CallerState, CallerCountry

**Add event logging widgets** at menu decision points:
- POST to `https://api.lemedspa.app/api/webhooks/voice/event`
- Body: CallSid, event_type, digit, menu name

**Convert voicemail widgets to gather-then-record:**
- Replace each `record-voicemail` with a `gather-input-on-call` that plays:
  "Leave a message after the beep, or press 1 to start a two-way text conversation"
- Press 1 → HTTP Request to `/webhooks/sms/studio-send` with `to={{contact.channel.address}}`, `body=(LeMedSpa) Thank you for reaching out...`
- Timeout → proceed to `record-voicemail` as before
- Applies to: Lea, Clinical MD, Accounts, operator fallback (4 widgets)

**SMS from number:** Uses `{{flow.channel.address}}` — automatically sends from the correct Twilio number (test or prod).

### 2. API: `connect-operator-status` (`api/routes/twilio.js`)

Update the no-answer fallback to add "press 1 to text" before voicemail:
- Current: Say → Record
- New: Gather (say greeting + press 1 option, timeout 5s)
  - Press 1 → Send SMS via Twilio client, then Say "Message sent. Goodbye." → Hangup
  - Timeout → Record voicemail (existing behavior)

SMS sent from: `req.body.Called` or `req.body.To` (the Twilio number that received the call).

### 3. API: TextMagic Forwarding (`api/routes/webhooks/sms.js`)

Add fire-and-forget POST to TextMagic after processing incoming SMS:
- URL: `process.env.TEXTMAGIC_WEBHOOK_URL` (env var)
- Body: original Twilio POST params (same URL-encoded format)
- If env var is empty → skip (clean cutover path)
- Failures logged but don't block our processing
- If TextMagic rejects (signature validation) → fall back to TextMagic outbound-only

**TextMagic URL:** `https://my.textmagic.com/webhook/twilio/sms/incoming`

### 4. Environment Variables

| Var | Value | Where |
|-----|-------|-------|
| `TEXTMAGIC_WEBHOOK_URL` | `https://my.textmagic.com/webhook/twilio/sms/incoming` | Render + local .env |
| `TWILIO_SIP1_USERNAME` | (already set) | Render |
| `TWILIO_SIP1_PASSWORD` | (already set) | Render |

### 5. No Changes

- `connect_call_accounts` stays as `+12134442242`
- `studio-send` endpoint (already built)
- `connect-operator` SIP routing (already built)
- Parallel TextMagic outbound (works naturally — API-driven)

## Deployment

1. Update `main-ivr.json` locally
2. Deploy to test flow: `node twilio/deploy.js $TWILIO_TEST_FLOW_SID twilio/flows/main-ivr.json`
3. Test call: dial test number, press 0, verify SIP rings
4. Test "press 1 to text" on voicemail paths
5. Deploy to prod: `node twilio/deploy.js $TWILIO_PROD_FLOW_SID twilio/flows/main-ivr.json --publish`
6. Update Twilio number SMS webhook to our API endpoint
7. Test TextMagic forwarding with a real SMS

## Execution: Design & Build Workflow

1. Write code
2. Code review (subagent)
3. QA (subagent)
4. Fix issues
5. Ship (deploy)
