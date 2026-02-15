# Softphone

**Route:** `/softphone`
**Status:** Active
**Last Updated:** 2026-02-15

## Overview

Browser-based softphone using Twilio Voice SDK. Allows staff to make and receive calls directly from the web app without a desk phone. Auto-connects on page load and supports URL-based auto-dialing from quick action links.

## User Stories

### US-001: Make outbound calls
**As a** staff member, **I want to** dial a number from my browser, **so that** I can make calls without a desk phone.
**Priority:** P0
**Status:** Implemented

#### Acceptance Criteria
- [x] AC-1: Number pad with digits 0-9, *, #
- [x] AC-2: Dial input field shows number being dialed
- [x] AC-3: Call button initiates call via Twilio
- [x] AC-4: Active call shows duration timer, mute, and hangup controls
- [x] AC-5: Call history log shows events (connected, ended, errors)

---

### US-002: Receive inbound calls
**As a** staff member, **I want to** receive calls in my browser, **so that** I can answer without a physical phone.
**Priority:** P0
**Status:** Implemented

#### Acceptance Criteria
- [x] AC-1: Twilio device auto-registers on page load
- [x] AC-2: Incoming call shows caller number/name with accept/reject buttons
- [x] AC-3: Ringing state with visual indicator
- [x] AC-4: Accept starts the call, reject sends to voicemail

---

### US-003: Auto-dial from URL parameter
**As a** staff member, **I want to** click "Call" from contacts/calls pages and have the softphone auto-dial, **so that** I don't have to re-enter the number.
**Priority:** P1
**Status:** Implemented

#### Acceptance Criteria
- [x] AC-1: URL param `?call=<phone>` populates dial field
- [x] AC-2: Auto-dials once Twilio device is registered (300ms delay)
- [x] AC-3: URL param cleaned after processing (no re-dial on refresh)
- [x] AC-4: If device not ready, number stays in field for manual dial

#### User's Original Words
> "when clicking call action icon, it just goes to softphone page, doesn't actually initiate a call."

---

## Design Specifications

### Layout
- Centered phone interface card
- Number display + dial pad + controls
- Event history log below

### Visual Style
- Dark card with gold accents
- Active call: green indicators
- Incoming call: blue pulse effect
- Error states: red text

### States
- **Connecting:** Spinner + "Connecting to Twilio..."
- **Ready:** "Ready — listening for calls"
- **Dialing:** Number shown, call in progress
- **Active call:** Timer counting up, mute/hangup controls
- **Incoming:** Caller info + accept/reject
- **Error:** Red status message

## API Dependencies
- `POST /api/softphone/token` — Twilio access token for Voice SDK
- Twilio Voice SDK (client-side)

## Revision History
| Date | Change | Prompted By |
|------|--------|-------------|
| 2026-02-12 | Initial softphone implementation | Phase 1A build |
| 2026-02-14 | Added ?call= URL param parsing and auto-dial | User request: "call action icon doesn't actually initiate a call" |
