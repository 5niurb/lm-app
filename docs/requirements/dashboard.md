# Dashboard

**Route:** `/dashboard`
**Status:** Active
**Last Updated:** 2026-02-15

## Overview

Main landing page after login. Shows key metrics (call volume, missed calls, voicemails, active hours), recent call activity, and quick access cards to major features.

## User Stories

### US-001: View key metrics
**As a** staff member, **I want to** see today's call stats at a glance, **so that** I can assess business activity.
**Priority:** P0
**Status:** Implemented

#### Acceptance Criteria
- [x] AC-1: Four stat cards: Total Calls, Missed Calls, Voicemails, Active Hours
- [x] AC-2: Each card shows today's count/value
- [x] AC-3: Cards styled with subtle gold accent borders
- [x] AC-4: Loading shows skeleton placeholders

---

### US-002: View recent calls
**As a** staff member, **I want to** see the most recent calls, **so that** I can quickly respond to activity.
**Priority:** P0
**Status:** Implemented

#### Acceptance Criteria
- [x] AC-1: Shows last 8 calls with caller name/number, direction, disposition, timestamp
- [x] AC-2: Quick action icons (call back + message) appear on hover, inline with name
- [x] AC-3: "View all" link to full phone log
- [x] AC-4: Same icon positioning pattern as calls page (next to name, not far right)

#### User's Original Words
> "have similar quick action call/msg icons next to contacts in phone log screen and any other screens where contacts are listed"

---

### US-003: Call volume chart
**As a** staff member, **I want to** see a call volume trend, **so that** I can understand busy periods.
**Priority:** P2
**Status:** Implemented

#### Acceptance Criteria
- [x] AC-1: Bar chart showing daily call volume for past 7 days
- [x] AC-2: Bars colored by disposition (answered=green, missed=red, voicemail=gold)
- [x] AC-3: Day labels on x-axis

---

### US-004: Quick access cards
**As a** staff member, **I want to** quickly access major features, **so that** I can navigate efficiently.
**Priority:** P2
**Status:** Implemented

#### Acceptance Criteria
- [x] AC-1: Cards for: Phone Log, Messages, Contacts, Softphone
- [x] AC-2: Each card shows unread/pending count where applicable
- [x] AC-3: Hover effect with gold accent

---

## Design Specifications

### Layout
- Grid layout: stat cards (4 cols), recent calls (left), chart (right), quick access (bottom)
- Responsive: stacks on mobile

### Visual Style
- **Stat cards:** Dark bg, gold top border accent, icon + number + label
- **Recent calls:** Same row style as calls page with hover states
- **Chart:** Subtle bar chart with muted colors
- **Quick access:** Cards with icon, title, description, arrow

### States
- **Loading:** Skeleton grid for all sections
- **Error:** Red alert banner at top
- **Empty recent calls:** "No recent calls" message

## API Dependencies
- `GET /api/calls/stats` — Today's call stats
- `GET /api/calls?page=1&pageSize=8` — Recent calls
- `GET /api/calls/daily-stats` — 7-day call volume chart data
- `GET /api/messages/stats` — Unread message count
- `GET /api/settings/business-hours` — Business hours status

## Revision History
| Date | Change | Prompted By |
|------|--------|-------------|
| 2026-02-12 | Initial dashboard with stats, recent calls, chart | Phase 1A build |
| 2026-02-14 | Added quick action icons to recent calls | User request: quick action icons on all screens |
| 2026-02-14 | Repositioned icons inline with name | User feedback with screenshot |
| 2026-02-15 | Message link now includes contact name param | Follow-up to message action fix |
