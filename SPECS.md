# SPECS.md — lm-app (LM Operations Platform)

> **Auto-maintained by Claude.** Updated after each feature, design change, or component implementation.
> Detailed enough to rebuild the entire platform from scratch.

---

## Architecture Overview

| Layer | Tech | Deployment |
|-------|------|-----------|
| Frontend | SvelteKit + shadcn-svelte + Tailwind v4 | Cloudflare Pages |
| API | Express.js | Render.com |
| Database | Supabase PostgreSQL | Supabase hosted |
| Voice/SMS | Twilio (Voice SDK + Messaging) | Webhook-based |
| Email | Resend | API calls |
| Payments | Stripe (future) | — |
| Booking | Cal.com (future) | — |

---

## Authentication

### Login Page (`/login`)

**Purpose:** Staff authentication for admin dashboard access.

**Components:**
- Split-panel layout: Brand visual (left) + login form (right)
- Email + password form (MVP)
- OTP entry field (scaffolded, not active)
- Error messages with styling

**Acceptance Criteria:**
- [ ] Email + password login returns JWT token
- [ ] Invalid credentials show error message
- [ ] Token stored for session persistence
- [ ] Redirects to /dashboard on success
- [ ] OTP field hidden until Phase 2

**Design Decisions:**
- MVP ships email+password only, 2FA enabled incrementally
- Trusted device tracking in database (for future adaptive MFA)

---

## Dashboard (`/dashboard`)

**Purpose:** Overview of spa operations — calls, messages, contacts at a glance.

**Components:**
- Stats cards with sparkline SVG charts (total calls, missed, contacts, messages)
- Call volume chart (daily)
- Quick access cards to core features

**Acceptance Criteria:**
- [ ] Stats load from `/api/calls/stats` endpoint
- [ ] Sparklines render correctly for 7-day trend
- [ ] Quick access cards link to correct routes
- [ ] Responsive: cards stack on mobile

---

## Calls (`/calls`)

**Purpose:** Call log from Twilio — view, search, filter all inbound/outbound calls.

**Components:**
- Paginated call list table
- Filter by direction (inbound/outbound) and disposition
- Search by phone number or contact name
- Sort by date, duration

**API:** `GET /api/calls` (pagination, filtering, sorting)

**Acceptance Criteria:**
- [ ] Calls display with direction icon, duration, timestamp
- [ ] Pagination works (page size, next/prev)
- [ ] Filters narrow results correctly
- [ ] Search matches phone numbers and contact names
- [ ] Empty state when no calls match

---

## Softphone (`/softphone`)

**Purpose:** Browser-based Twilio voice client for making/receiving calls.

**Status:** UI complete, needs Twilio Voice SDK wiring.

**Components:**
- Dial pad (0-9, *, #)
- Phone number input
- Call controls (call, hang up, mute, hold)
- Incoming call alert
- Call timer

**API:** `POST /api/twilio/token` (generates ephemeral voice access token)

**Acceptance Criteria:**
- [ ] Dial pad inputs digits into phone field
- [ ] Outbound call connects via Twilio Voice SDK
- [ ] Incoming call shows alert with accept/reject
- [ ] Mute/hold toggles work during active call
- [ ] Call timer displays elapsed time
- [ ] Call events logged to `call_logs` table

---

## Voicemails (`/voicemails`)

**Purpose:** Listen to voicemails organized by mailbox.

**Status:** UI scaffolded, needs recording proxy auth.

**Components:**
- Mailbox tabs: Lea, Clinical MD, Accounts, Care Team
- Voicemail list with timestamp, caller, duration
- Audio player with playback controls

**API:** `GET /api/voicemails`, `GET /api/voicemails/:id/recording-proxy`

**Acceptance Criteria:**
- [ ] Voicemails load by selected mailbox
- [ ] Audio player plays recordings (proxied through API for auth)
- [ ] Transcription displayed when available
- [ ] Delete voicemail (with confirmation)

---

## Messages (`/messages`)

**Purpose:** 2-way SMS/RCS conversations with patients.

**Components:**
- Conversation list (grouped by phone number)
- Thread view with message bubbles (inbound/outbound styling)
- Send message input + button

**API:** `GET /api/messages`, `POST /api/messages/:conversationId/send`

**Acceptance Criteria:**
- [ ] Conversations list shows latest message preview
- [ ] Thread view displays full message history
- [ ] Outbound messages sent via Twilio
- [ ] Inbound messages received via webhook and displayed
- [ ] Delivery status shown (sent/delivered/failed)

---

## Contacts (`/contacts`)

**Purpose:** Unified CRM — all patient/client contacts from multiple sources.

**Components:**
- Contact list with search
- Contact detail: phone, email, tags, source
- Quick actions (call, text, edit)
- Form submissions from website contact form

**API:** `GET /api/contacts`, `POST /api/contacts`, `PUT /api/contacts/:id`

**Acceptance Criteria:**
- [ ] Contacts list with search by name/phone/email
- [ ] Contact detail shows all fields + tags
- [ ] Add/edit contacts with validation
- [ ] Website form submissions appear as contacts
- [ ] Source tracking (AR, HighLevel, TextMagic, manual, inbound call)

---

## Services (`/services`)

**Purpose:** Treatment catalog by category with colored borders.

**Status:** Scaffolded, needs content + filtering.

**Components:**
- Category tabs: Medical, Aesthetics, Wellness, Homecare
- Service cards with treatment details

**API:** `GET /api/services`

**Acceptance Criteria:**
- [ ] Services grouped by category
- [ ] Category colors match brand (medical=blue, aesthetics=pink, etc.)
- [ ] Service detail: name, description, duration, price range

---

## Consent Forms (`/consent/[slug]`)

**Purpose:** Patient-facing digital consent with signature capture.

**Status:** Functional.

**Components:**
- Public page (no auth required)
- Form title + content sections
- Questionnaire fields
- Canvas-based digital signature pad
- Submit button

**API:** `GET /api/public/consent/:slug`, `POST /api/public/consent/:slug/submit`

**Acceptance Criteria:**
- [ ] Form loads by slug without authentication
- [ ] Patient fills questionnaire fields
- [ ] Signature canvas captures drawing
- [ ] Submit saves signature + questionnaire to database
- [ ] Confirmation shown after submission
- [ ] Mobile-optimized (signature works on touch)

---

## Settings (`/settings`)

**Purpose:** App configuration — business hours, call routing, security, notifications.

**Status:** UI scaffolded, needs persistence logic.

**Components:**
- Tab navigation: Business Hours, Call Routing, Security, Notifications
- Form fields for each setting category

**API:** `GET /api/settings`, `PUT /api/settings`

**Acceptance Criteria:**
- [ ] Settings load from database
- [ ] Changes persist on save
- [ ] Business hours: set open/close per day
- [ ] Call routing: configure rules per extension

---

## Automation (`/automation`)

**Purpose:** Message sequences and execution log for patient communications.

**Status:** Phase 1C, scaffolded.

**Components:**
- Sequence list (active/paused)
- Sequence builder (trigger, steps, delays)
- Execution log with status

**Acceptance Criteria:**
- [ ] Create/edit automation sequences
- [ ] Trigger types: appointment booked, form submitted, manual
- [ ] Step types: SMS, email, wait
- [ ] Execution log shows status per contact

---

## Webhooks (Public, No Auth)

### Contact Form (`POST /api/webhooks/contact-form`)
- Receives website form submissions
- Creates/updates contact in database
- Returns success/error JSON

### Voice Events (`POST /api/webhooks/voice`)
- Receives Twilio call events (incoming, recording, status)
- Logs to `call_logs` and `call_events` tables

### SMS Events (`POST /api/webhooks/sms`)
- Receives inbound SMS and delivery status updates
- Creates/updates conversations and messages

---

## Database Schema

### Core Tables

| Table | Purpose | Key fields |
|-------|---------|-----------|
| `profiles` | User accounts | id, email, role (admin/staff) |
| `trusted_devices` | MFA device tracking | user_id, device_fingerprint, trusted_at |
| `phone_extensions` | Staff extensions | user_id, extension, voicemail_greeting |
| `call_routing_rules` | Time-based routing | extension, day, start_time, end_time |
| `call_logs` | Call records | direction, from, to, duration, recording_url, disposition |
| `voicemails` | Recordings | mailbox, caller, transcription, status |
| `call_events` | IVR navigation | call_id, event_type, data |
| `contacts` | Unified CRM | name, phone, email, tags, source |
| `conversations` | SMS threads | contact_id, phone, last_message |
| `messages` | Individual messages | conversation_id, direction, body, status |
| `audit_log` | Security trail | user_id, action, details, ip |
| `settings` | App config | key, value |

### Phase 1C Tables

| Table | Purpose |
|-------|---------|
| `services` | Treatment catalog |
| `automation_sequences` | Message sequence definitions |
| `consent_forms` | Form templates |
| `consent_submissions` | Signed forms + signatures |

---

## Design Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-12 | SvelteKit + Express (separate) | Frontend CDN (Cloudflare), API on Render for Twilio webhooks |
| 2025-12 | Supabase over raw Postgres | Auth, RLS, realtime subscriptions, hosted |
| 2025-12 | No TypeScript (JSDoc types) | Faster iteration, `jsconfig.json` provides type checking |
| 2025-12 | 2FA architecture from day 1 | Security-first, enabled incrementally |
| 2026-01 | Day 1 priority: call logging | Replace HighLevel first (most painful vendor) |
| 2026-02 | Dark + gold theme matching website | Unified brand across all LM properties |
| 2026-02 | Svelte 5 runes ($state, $derived) | Modern reactivity, no legacy `let` patterns |
