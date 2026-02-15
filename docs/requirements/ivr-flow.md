# IVR / Twilio Studio Flow

**Route:** N/A (Twilio-hosted)
**Status:** Active
**Last Updated:** 2026-02-15

## Overview

Twilio Studio flow handling all incoming calls to the Le Med Spa main number (818-4MEDSPA). Provides automated greeting, menu navigation, voicemail recording, SMS opt-in, and operator transfer with business hours awareness.

## User Stories

### US-001: Main greeting menu
**As a** caller, **I want to** hear a professional greeting with menu options, **so that** I can navigate to the right department.
**Priority:** P0
**Status:** Implemented

#### Acceptance Criteria
- [x] AC-1: Main greeting plays audio file (0a-Main-Elise.wav)
- [x] AC-2: Menu options: 0=Operator, 1=Text us, 2=Hours/Location, 3=Directory
- [x] AC-3: Single digit DTMF input, 5-second timeout
- [x] AC-4: Timeout → forwards to operator (HighLevel number)

---

### US-002: Press 0 — Operator with hours check
**As a** caller pressing 0, **I want to** reach an operator during business hours or get the closed message after hours, **so that** I get appropriate service.
**Priority:** P0
**Status:** Implemented

#### Acceptance Criteria
- [x] AC-1: Pressing 0 triggers business hours check via API
- [x] AC-2: During business hours → connects to operator (HighLevel +18184632211)
- [x] AC-3: After hours → plays "Closed, text us" audio greeting
- [x] AC-4: Closed menu: press 1 → sends SMS, timeout/no input → voicemail
- [x] AC-5: If hours check API fails → falls back to operator (fail-safe)
- [x] AC-6: All menu selections logged to lm-app API

#### Business Hours
- Mon-Fri: 10:00 AM - 6:00 PM PT
- Sat: 10:00 AM - 4:00 PM PT
- Sun: Closed

#### User's Original Words
> "added new audio recording to be played during non-business hours when caller presses 0 after business hours. similar to other flow options, the caller can press 1 to get an text sent to them which should show up in the messages queue, or they do nothing to leave a voicemail."

---

### US-003: Press 1 — Text us
**As a** caller pressing 1, **I want to** receive a text message, **so that** I can communicate via SMS instead of phone.
**Priority:** P1
**Status:** Implemented

#### Acceptance Criteria
- [x] AC-1: Sends SMS: "(LeMedSpa) Thank you for reaching out. How can we help you?"
- [x] AC-2: Plays confirmation audio after send
- [x] AC-3: Triggers email notification function
- [x] AC-4: SMS appears in lm-app messages queue

---

### US-004: Press 2 — Hours & Location
**As a** caller pressing 2, **I want to** hear the business hours and address, **so that** I know when and where to visit.
**Priority:** P2
**Status:** Implemented

#### Acceptance Criteria
- [x] AC-1: Plays Hours-Location audio
- [x] AC-2: Press 9 to replay, 0 for operator
- [x] AC-3: No match → returns to main menu

---

### US-005: Press 3 — Company Directory
**As a** caller pressing 3, **I want to** reach specific staff members, **so that** I can leave targeted voicemails.
**Priority:** P2
**Status:** Implemented

#### Acceptance Criteria
- [x] AC-1: Plays directory audio
- [x] AC-2: Press 1 → Lea voicemail, Press 2 → Clinical MD voicemail
- [x] AC-3: Press 3 → Accounts/Ops menu (text/voicemail/connect options)

---

### US-006: Call logging via webhooks
**As the** system, **I want to** log all calls and IVR interactions, **so that** they appear in the lm-app dashboard.
**Priority:** P0
**Status:** Implemented

#### Acceptance Criteria
- [x] AC-1: Incoming call logged via POST to `/api/webhooks/voice/incoming`
- [x] AC-2: Each menu selection logged via POST to `/api/webhooks/voice/event`
- [x] AC-3: Call status updates via POST to `/api/webhooks/voice/status`
- [x] AC-4: Recordings saved via POST to `/api/webhooks/voice/recording`
- [x] AC-5: Transcriptions updated via POST to `/api/webhooks/voice/transcription`
- [x] AC-6: Auto-creates contact record for unknown callers

---

## Technical Architecture

### Studio Flow Widgets
```
Trigger → log_call_incoming → MainGreetingMenu
  ├─ Digit 0 → check_business_hours → split_hours_result
  │    ├─ Open → log_event → connect_call_HighLevel (operator)
  │    └─ Closed → log_event → ClosedGreetingMenu
  │         ├─ Digit 1 → send_message_accounts (SMS)
  │         └─ Timeout → record_voicemail_closed
  ├─ Digit 1 → send_message_accounts → play_MsgSentGoodbye → email notify
  ├─ Digit 2 → Hours_Location menu
  ├─ Digit 3 → Company_Directory
  │    ├─ 1 → Lea voicemail
  │    ├─ 2 → Clinical MD voicemail
  │    └─ 3 → Accounts/Ops menu
  └─ Timeout → log_event_timeout → connect_call_HighLevel
```

### Audio Assets (hosted on lm-ivr-assets-2112.twil.io)
- `0a-Main-Elise.wav` — Main greeting
- `Closed-text-us-wav.wav` — After-hours closed greeting
- `Hours-Location-Elise-wav.wav` — Hours & location info
- `Ops-vmail-Barry-wav.wav` — Operations voicemail greeting

### API Endpoints
- `GET /api/webhooks/voice/hours-check` — Returns `{ status: "open"|"closed" }`
- `POST /api/webhooks/voice/incoming` — Log new inbound call
- `POST /api/webhooks/voice/event` — Log IVR menu interaction
- `POST /api/webhooks/voice/status` — Update call status/disposition
- `POST /api/webhooks/voice/recording` — Save voicemail recording
- `POST /api/webhooks/voice/transcription` — Update voicemail transcription

### Key Files
- `twilio/flows/main-ivr-webhooks.json` — Studio flow definition
- `twilio/deploy.js` — CLI deploy script
- `twilio/upload-assets.js` — Audio asset upload script
- `api/routes/webhooks/voice.js` — All voice webhook handlers

## Revision History
| Date | Change | Prompted By |
|------|--------|-------------|
| 2026-02-12 | Initial Studio flow with webhook logging | Phase 1A: replace HighLevel |
| 2026-02-15 | Added business hours check + after-hours closed greeting | User request: "audio recording to be played during non-business hours when caller presses 0" |
| 2026-02-15 | Uploaded Closed-text-us audio to Twilio Serverless | New audio asset from user |
