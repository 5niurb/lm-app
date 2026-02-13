# Twilio Phone Flow Design — Phase 1A

**Date:** 2025-02-12
**Status:** Approved
**Approach:** A — Keep IVR on Twilio Studio, our app is passive logger/dashboard

---

## Decision

Keep the existing Twilio Studio IVR flow as the call controller. Our lm-app API serves as a passive listener that logs calls, voicemails, and menu navigation events. The dashboard reads from Supabase.

### Why Approach A

- **Zero disruption** — The IVR already works. Patients won't notice any change.
- **Studio is purpose-built** — Visual editor, versioning, easy for non-devs to update greetings.
- **Faster to ship** — We wire up HTTP Request widgets in Studio instead of rebuilding IVR logic in code.
- **Migration safety** — The only change to the live phone flow is *adding* webhook calls, not replacing behavior.

---

## Architecture

```
Caller dials +1 (818) 463-3772
        │
        ▼
┌─────────────────────┐
│   Twilio Studio     │  ← IVR controller (stays as-is)
│   Flow              │
│                     │
│  Main Greeting      │
│   ├─ 0 → Operator   │──→ SIP endpoint → clinic landlines
│   ├─ 1 → SMS reply  │      │ no answer → Care Team voicemail
│   ├─ 2 → Hours info │
│   ├─ 3 → Directory  │
│   │    ├─ 1 → Lea VM │
│   │    ├─ 2 → MD VM  │
│   │    └─ 3 → Accts  │
│   │         ├─ 1 VM  │
│   │         └─ 2 fwd │──→ +1 (213) 444-2242
│   └─ timeout → SIP   │
└─────────┬───────────┘
          │ HTTP Request widgets at key points
          ▼
┌─────────────────────┐
│   lm-app API        │  ← passive listener
│   /api/webhooks/    │
│   voice/            │
│    ├─ /incoming     │  log call start
│    ├─ /event        │  log menu selections
│    ├─ /status       │  log call lifecycle
│    ├─ /recording    │  log voicemail
│    └─ /transcription│  attach transcript
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│   Supabase          │
│   call_logs         │
│   voicemails        │
│   call_events (new) │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│   lm-app Dashboard  │  ← SvelteKit frontend
│   /calls            │
│   /voicemails       │
└─────────────────────┘
```

---

## What Changes

### 1. Webhook Handlers (voice.js)

**Simplify `/incoming`** — Remove TwiML generation. Just log the call to `call_logs` and return `200 OK`. Studio handles the greeting and IVR.

**Add `/event`** — New endpoint for tracking menu navigation. Studio sends an HTTP Request whenever the caller presses a key. Logs to a new `call_events` table.

**Keep `/status`** — No changes. Twilio status callbacks continue updating call lifecycle.

**Keep `/recording`** — Minor change: accept a `mailbox` parameter from Studio so we know which voicemail box received the message.

**Keep `/transcription`** — No changes. Twilio transcription callbacks update the voicemail text.

### 2. Database Changes

**Add `mailbox` column to `voicemails`:**
- Type: `text`, nullable
- Values: `lea`, `clinical_md`, `accounts`, `care_team`
- Used to filter voicemails by mailbox in the dashboard

**Add `call_events` table:**
```sql
CREATE TABLE call_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_log_id uuid REFERENCES call_logs(id),
  twilio_sid text NOT NULL,
  event_type text NOT NULL,        -- 'menu_selection', 'transfer', 'voicemail_start'
  event_data jsonb DEFAULT '{}',   -- { digit: '3', menu: 'main' }
  created_at timestamptz DEFAULT now()
);
```

### 3. Twilio Studio Flow Changes

Add **HTTP Request widgets** at these points in the existing flow:

| Point | Webhook | Payload |
|-------|---------|---------|
| Flow start (trigger) | `POST /api/webhooks/voice/incoming` | CallSid, From, To, CallStatus |
| After each gather (key press) | `POST /api/webhooks/voice/event` | CallSid, digit, menu_name |
| Before each Record widget | `POST /api/webhooks/voice/event` | CallSid, event: voicemail_start, mailbox |
| Record action URL | `POST /api/webhooks/voice/recording` | CallSid, RecordingSid, RecordingUrl, mailbox |
| Record transcribe callback | `POST /api/webhooks/voice/transcription` | RecordingSid, TranscriptionText |

**Replace HighLevel forwarding:**
- Current: `+1 (818) 463-2211` (HighLevel number)
- New: SIP endpoint connecting to clinic ASA/landlines
- Fallback on no-answer: Care Team voicemail greeting + record, then SMS auto-response to caller

**Enable transcription on all Record widgets** (currently only some have it).

### 4. Voicemail Mailboxes

| Mailbox | Key Path | Greeting |
|---------|----------|----------|
| Lea | 3 → 1 | "You've reached Lea..." |
| Clinical MD | 3 → 2 | "You've reached the clinical director..." |
| Accounts | 3 → 3 → 1 | "You've reached accounts..." |
| Care Team | 0 → SIP no-answer | "Thank you for calling Le Med Spa..." |

All voicemails get transcribed. Dashboard filters by mailbox.

### 5. SIP Endpoint (Operator / Press 0)

- Caller presses 0 → Studio dials SIP endpoint
- SIP connects to clinic ASA → rings all landlines simultaneously
- If no answer after ~25 seconds → Care Team voicemail greeting + record
- After recording → SMS auto-response to caller: "Thank you for calling Le Med Spa. We missed your call but would love to help — feel free to text us here."

### 6. SMS Auto-Response

- Triggered after Care Team voicemail (SIP no-answer fallback)
- Sent via Twilio Studio (Send Message widget) or Twilio Function
- Message: "Thank you for calling Le Med Spa. We missed your call but would love to help — feel free to text us here."
- Future: SMS conversations will live in our database

---

## What Stays the Same

- IVR menu structure (greetings, key mappings, routing)
- Hours/location announcement (press 2)
- SMS auto-reply for press 1
- Accounts forwarding to +1 (213) 444-2242 (press 3 → 3 → 2)
- Twilio Studio as the IVR controller

---

## Testing Strategy

- Use test Twilio number for all changes before going live
- Test each webhook endpoint independently with curl
- Test full call flow end-to-end on test number
- Verify dashboard shows correct data after test calls
- Only swap production Studio flow after test flow is validated

---

## Out of Scope (Phase 1A)

- Moving IVR logic into our code (stay on Studio)
- Real-time call monitoring / live dashboards
- Call recording playback in browser (just links to Twilio URLs for now)
- SMS conversation threading (future phase)
- HIPAA BAA with Twilio (Phase 5)
