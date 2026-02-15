# Phone Log (Calls)

**Route:** `/calls`
**Status:** Active
**Last Updated:** 2026-02-15

## Overview

Central call log showing all inbound/outbound calls, voicemails, and call activity. Replaces the call logging functionality of HighLevel. Includes inline voicemail playback, search, filters, and quick actions.

## User Stories

### US-001: View all calls with details
**As a** staff member, **I want to** see all incoming and outgoing calls in one place, **so that** I can track communication activity.
**Priority:** P0
**Status:** Implemented

#### Acceptance Criteria
- [x] AC-1: Calls displayed in reverse chronological order (newest first)
- [x] AC-2: Each call shows: direction icon, caller name or phone number, action summary, timestamp
- [x] AC-3: Inbound calls show blue incoming phone icon
- [x] AC-4: Outbound calls show green outgoing phone icon
- [x] AC-5: Missed/abandoned calls show red missed phone icon
- [x] AC-6: Known contacts show gold diamond indicator next to name
- [x] AC-7: Caller ID names show "CID" badge to distinguish from contact names
- [x] AC-8: Phone numbers formatted in human-readable format when no name available
- [x] AC-9: Timestamps show relative format (e.g., "2 min ago", "yesterday")

---

### US-002: Filter calls by type
**As a** staff member, **I want to** filter calls by direction or disposition, **so that** I can quickly find specific types of calls.
**Priority:** P1
**Status:** Implemented

#### Acceptance Criteria
- [x] AC-1: Filter buttons: All, Inbound, Outbound, Answered, Missed, Voicemail
- [x] AC-2: Active filter shows filled button, others show outline
- [x] AC-3: Filter persists across pagination
- [x] AC-4: URL param `?filter=voicemail` pre-selects filter on page load
- [x] AC-5: Voicemails page (`/voicemails`) redirects to `/calls?filter=voicemail`

---

### US-003: Search calls
**As a** staff member, **I want to** search calls by name or phone number, **so that** I can find specific callers.
**Priority:** P1
**Status:** Implemented

#### Acceptance Criteria
- [x] AC-1: Search input at top of call list
- [x] AC-2: Search triggers on form submit (Enter key)
- [x] AC-3: Searches by caller name and phone number
- [x] AC-4: Resets to page 1 when searching

---

### US-004: Inline voicemail playback
**As a** staff member, **I want to** play voicemail recordings directly in the call list, **so that** I don't have to navigate away.
**Priority:** P1
**Status:** Implemented

#### Acceptance Criteria
- [x] AC-1: Voicemail calls show voicemail icon + transcription preview (truncated to 90 chars)
- [x] AC-2: Play/Stop button appears for voicemails with audio
- [x] AC-3: Audio streams through API proxy (no direct Twilio URL exposure)
- [x] AC-4: Only one voicemail plays at a time (clicking new one stops previous)
- [x] AC-5: "Transcribing voicemail..." shown when transcription is pending

---

### US-005: Quick action icons next to contacts
**As a** staff member, **I want to** quickly call back or message someone from the call log, **so that** I can take action without navigating away.
**Priority:** P1
**Status:** Implemented

#### Acceptance Criteria
- [x] AC-1: Call back icon (green phone) and message icon (blue) appear on hover, right next to contact name
- [x] AC-2: Icons are positioned inline with the name, NOT on the far right
- [x] AC-3: Call back icon links to `/softphone?call=<phone>` (auto-dials)
- [x] AC-4: Message icon links to `/messages?phone=<phone>&name=<name>&new=true`
- [x] AC-5: Message link includes contact name when available for smart conversation routing

#### User's Original Words
> "have similar quick action call/msg icons next to contacts in phone log screen"
> "can we move the icons closer to the contact names, see pic"

---

### US-006: Pagination
**As a** staff member, **I want to** page through call history, **so that** I can access older calls.
**Priority:** P2
**Status:** Implemented

#### Acceptance Criteria
- [x] AC-1: Page size of 25 calls
- [x] AC-2: Shows "Showing X-Y of Z" count
- [x] AC-3: Previous/Next navigation buttons
- [x] AC-4: Current page / total pages indicator

---

## Design Specifications

### Layout
- Full-width card with border `rgba(197,165,90,0.12)`
- Search bar + filter buttons in header area
- Call list below with hover states per row

### Visual Style
- **Background:** Dark (inherited from layout)
- **Card border:** `rgba(197,165,90,0.12)`
- **Row hover:** `rgba(197,165,90,0.04)` bg + `rgba(197,165,90,0.1)` border
- **Direction icons:** Blue (inbound), Green (outbound), Red (missed)
- **Voicemail icon:** Gold `#C5A55A` at 70% opacity
- **Quick action icons:** Appear on hover, emerald (call) and blue (message) borders/text
- **Timestamps:** `rgba(255,255,255,0.3)`, right-aligned

### Interactions
- Hover on row: background highlight + border appears + quick action icons fade in
- Play voicemail: toggle Play/Stop inline
- Filter buttons: immediate filter change + page reset

### States
- **Loading:** 10 skeleton rows
- **Empty:** Centered phone icon + "No call records found" + contextual help text
- **Error:** Red border card at top

## API Dependencies
- `GET /api/calls?page=&pageSize=&search=&direction=&disposition=` — Paginated call list
- `GET /api/voicemails/:id/recording` — Proxy for voicemail audio playback

## Revision History
| Date | Change | Prompted By |
|------|--------|-------------|
| 2026-02-12 | Initial implementation with filters, search, pagination, voicemail playback | Phase 1A build |
| 2026-02-14 | Added quick action icons (call + message) next to contacts | User request: "have similar quick action call/msg icons" |
| 2026-02-14 | Repositioned icons inline with name (not far right) | User feedback with screenshot |
| 2026-02-15 | Message link now includes contact name param for smart routing | User request: fix message action to show contact name |
