# Messages (SMS/RCS)

**Route:** `/messages`
**Status:** Active
**Last Updated:** 2026-02-22

## Overview

2-way SMS/RCS messaging interface with conversation threads. Staff can view incoming messages, reply, and start new conversations. Replaces TextMagic messaging.

## User Stories

### US-001: View conversations
**As a** staff member, **I want to** see all SMS conversations sorted by most recent, **so that** I can stay on top of patient/lead communications.
**Priority:** P0
**Status:** Implemented

#### Acceptance Criteria
- [x] AC-1: Left panel shows conversation list (name/number, last message preview, timestamp)
- [x] AC-2: Known contacts show gold diamond + name, CID names show plain, unknown show formatted phone
- [x] AC-3: Unread count badge (gold circle) on conversations with new messages
- [x] AC-4: Auto-refresh every 5 seconds for real-time feel
- [x] AC-5: Active conversation highlighted with left gold border

---

### US-002: View and reply to messages
**As a** staff member, **I want to** view a conversation thread and send replies, **so that** I can communicate with patients/leads.
**Priority:** P0
**Status:** Implemented

#### Acceptance Criteria
- [x] AC-1: Right panel shows message thread for selected conversation
- [x] AC-2: Outbound messages in gold bubbles (right-aligned), inbound in dark bubbles (left-aligned)
- [x] AC-3: Each message shows timestamp and delivery status
- [x] AC-4: Compose bar at bottom with text input and send button
- [x] AC-5: Auto-scroll to newest message on load and when new messages arrive
- [x] AC-6: Thread header shows contact name, phone number, and quick action icons

---

### US-003: Start new conversation
**As a** staff member, **I want to** start a new SMS conversation with a phone number, **so that** I can reach out to patients/leads.
**Priority:** P1
**Status:** Implemented

#### Acceptance Criteria
- [x] AC-1: "New" button opens compose view
- [x] AC-2: Phone number input field + message input
- [x] AC-3: After sending, conversation appears in list and is auto-selected

---

### US-004: Navigate from quick action icons
**As a** staff member, **I want to** click a message icon from calls/contacts and land on the right conversation, **so that** I don't have to search.
**Priority:** P1
**Status:** Implemented

#### Acceptance Criteria
- [x] AC-1: URL params `?phone=xxx&name=xxx&new=true` trigger smart routing
- [x] AC-2: If existing conversation exists for that phone → auto-select it (open thread)
- [x] AC-3: If no conversation but contact exists → open new compose with contact name displayed
- [x] AC-4: If neither → open new compose with just phone number
- [x] AC-5: Phone number field hidden when contact name is displayed (no need to re-enter)
- [x] AC-6: URL params cleaned after processing (no stale params on refresh)

#### User's Original Words
> "when msg action icon is pressed, it currently goes to new message page with contact number, but no contact name is listed. if it's a known contact with prior chat history, it should direct user to the current chat window. if no prior chat, a new windows with contact name. phone number will be displayed if no callerID / name only."

---

### US-005: Quick call from conversations
**As a** staff member, **I want to** call someone directly from a message thread, **so that** I can escalate from text to voice.
**Priority:** P2
**Status:** Implemented

#### Acceptance Criteria
- [x] AC-1: Call icon in conversation list (hover, next to name)
- [x] AC-2: Call + call history icons in thread header
- [x] AC-3: Call icon links to `/softphone?call=<phone>` (auto-dials)
- [x] AC-4: Call history icon links to `/calls?search=<phone>`

#### User's Original Words
> "have similar quick action call/msg icons next to contacts... also, when clicking call action icon, it just goes to softphone page, doesn't actually initiate a call."

---

### US-006: Search conversations
**As a** staff member, **I want to** search conversations by name, phone, or message content, **so that** I can find specific threads.
**Priority:** P2
**Status:** Implemented

#### Acceptance Criteria
- [x] AC-1: Search input in conversation list header
- [x] AC-2: Searches by phone number, display name, and last message content

---

### US-007: Internal notes
**As a** staff member, **I want to** add internal notes inline in a conversation thread, **so that** I can track context, handoff info, and patient notes without texting the patient.
**Priority:** P1
**Status:** PRD Written — `docs/prds/messaging-internal-notes/`

#### Acceptance Criteria
- [ ] AC-1: Toggle switch in compose bar to switch between "message" and "internal note" mode
- [ ] AC-2: Note mode changes compose area appearance (warm yellow tint, "Type your internal note" placeholder)
- [ ] AC-3: Send button changes to "Add note" with warm styling when note mode is active
- [ ] AC-4: Notes saved to database with `is_internal_note=true` — NOT sent via SMS/Twilio
- [ ] AC-5: Notes render inline in thread with distinct warm yellow/cream bubble styling
- [ ] AC-6: Note bubble shows "Staff Name (internal note)" header
- [ ] AC-7: No delivery status icons on note bubbles
- [ ] AC-8: Notes excluded from conversation list preview (last_message) and log view
- [ ] AC-9: Attachment and schedule options hidden in note mode

#### User's Original Words
> "ability to add an internal note that will be saved in line of the chat in a different color"

#### Design Reference
See `docs/designref/messaging-composer/` for TextMagic reference screenshots showing:
- Note toggle in compose toolbar
- Yellow/cream compose area when note mode is ON
- Inline note display in thread with yellow bubble and "(internal note)" label

---

### US-008: AI response suggestions (Generate with AI)
**As a** staff member, **I want to** generate AI-powered draft responses based on conversation context, **so that** I can reply faster and more consistently to common inquiries.
**Priority:** P2
**Status:** PRD Written — `docs/prds/messaging-ai-suggest/`

#### Acceptance Criteria
- [ ] AC-1: Three-dot more menu in compose toolbar with "Generate with AI" option
- [ ] AC-2: AI panel appears above compose bar with thread summary and 2-3 draft responses
- [ ] AC-3: Clicking a suggestion inserts the draft text into the compose textarea (not auto-sent)
- [ ] AC-4: Thread summary provides brief context of the conversation
- [ ] AC-5: Each suggestion card shows an action label (e.g., Recommend, Suggest, Encourage) and full text
- [ ] AC-6: Loading state with skeleton animation while AI generates
- [ ] AC-7: Error handling with retry option
- [ ] AC-8: Feature gracefully hidden when ANTHROPIC_API_KEY is not configured
- [ ] AC-9: Rate limited to prevent abuse (10 requests/conversation/hour)

#### User's Original Words
> "an 'AI' icon that will suggest a few responses based on message context"

#### Design Reference
See `docs/designref/messaging-composer/` for TextMagic reference screenshots showing:
- "Generate with AI" in more menu dropdown
- AI panel with thread summary and clickable draft response cards
- Each card has icon + bold verb label + suggestion text

---

### US-009: Schedule message from more menu
**As a** staff member, **I want to** access message scheduling from a more menu, **so that** the compose toolbar stays clean and organized.
**Priority:** P2
**Status:** PRD Written (part of AI suggest PRD, story AI-003)

#### Acceptance Criteria
- [ ] AC-1: Schedule option moved from standalone toolbar icon into three-dot more menu
- [ ] AC-2: Clicking "Schedule" in the menu opens the existing SchedulePopover
- [ ] AC-3: All existing scheduling functionality preserved

#### Design Reference
See `docs/designref/messaging-composer/` — TextMagic more menu shows Schedule as a menu item alongside other options.

---

## Design Specifications

### Layout
- Two-panel layout: conversation list (left, 320-384px) + message thread (right, flex)
- Mobile: shows one panel at a time with back navigation
- Full viewport height (`100vh - 4rem` header)

### Visual Style
- **Conversation list border:** `rgba(197,165,90,0.12)`
- **Active conversation:** `rgba(197,165,90,0.1)` bg + 2px left gold border
- **Outbound bubbles:** `#C5A55A` bg, `#1A1A1A` text, rounded-br-md
- **Inbound bubbles:** `rgba(255,255,255,0.08)` bg + gold border, rounded-bl-md
- **Send button:** Gold `#C5A55A` bg
- **Internal note bubbles:** `rgba(255,248,225,0.12)` bg + `rgba(255,248,225,0.2)` border, right-aligned
- **Note mode compose:** Warm yellow tint on textarea, "Add note" button replaces send icon
- **AI suggest panel:** `bg-surface-raised` above compose bar, clickable suggestion cards
- **Unread badge:** Gold circle with dark text, min-width 20px
- **New compose contact name:** Playfair Display heading, gold-tinted

### Interactions
- Click conversation → loads thread, marks as read
- Hover conversation → background highlight + call icon appears
- Send message → input clears, thread refreshes, auto-scroll
- 5-second polling for new messages
- Mobile back button returns to conversation list

### States
- **Loading conversations:** 6 skeleton rows
- **Empty conversations:** Centered icon + "No conversations" + Playfair Display heading
- **Loading messages:** 5 skeleton rows
- **Empty thread:** "No messages in this conversation yet"
- **Error:** Fixed bottom-right toast with dismiss

## API Dependencies
- `GET /api/messages/conversations?search=&status=` — Conversation list
- `GET /api/messages/conversations/:id` — Messages for a thread (also marks as read)
- `GET /api/messages/lookup?phone=` — Find existing conversation/contact by phone
- `GET /api/messages/stats` — Unread count for sidebar badge
- `POST /api/messages/send` — Send outbound SMS
- `POST /api/messages/note` — Create internal note (no SMS sent)
- `POST /api/messages/ai-suggest` — Generate AI response suggestions
- `GET /api/features` — Feature flags (checks if AI suggest is available)

## Revision History
| Date | Change | Prompted By |
|------|--------|-------------|
| 2026-02-12 | Initial implementation with conversations, threads, compose | Phase 1B build |
| 2026-02-14 | Added quick call icon to conversation list and thread header | User request: quick action icons |
| 2026-02-14 | Repositioned call icon inline next to name (not far right) | User feedback with screenshot |
| 2026-02-15 | Smart routing: lookup API, auto-select existing conversation, show contact name | User request: fix message action navigation |
| 2026-02-22 | PRDs written for internal notes (US-007), AI suggest (US-008), more menu schedule (US-009) | User request: TextMagic reference features |
