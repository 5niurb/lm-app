# SPECS.md — lm-app (LM Operations Platform)

> **Auto-maintained by Claude.** Updated after each feature, design change, or component implementation.
> Detailed enough to rebuild the entire platform from scratch.
> Last updated: Session 25–26 (2026-02-15)

---

## Architecture Overview

| Layer | Tech | Deployment |
|-------|------|-----------|
| Frontend | SvelteKit 2.50 + Svelte 5 + shadcn-svelte + Tailwind v4 | Cloudflare Pages |
| API | Express.js (ES modules, Node 20+) | Render.com |
| Database | Supabase PostgreSQL (RLS enabled) | Supabase hosted |
| Voice/SMS | Twilio (Voice SDK 2.x + Messaging + Studio IVR) | Webhook-based |
| Email | Resend | API calls |
| Payments | Stripe (future) | — |
| Booking | Cal.com (future) | — |
| CI/CD | GitHub Actions | Lint → Build → Test on push/PR |
| Dev Tooling | ESLint 9 + Prettier + Vitest | 20 unit tests |

**Production URLs:**
- Frontend: https://lm-app.pages.dev
- API: https://lm-app-api.onrender.com
- Supabase: https://skvsjcckissnyxcafwyr.supabase.co

---

## Design System

| Token | Value | Usage |
|-------|-------|-------|
| Background | `#0a0a0c` | Page backgrounds, cards |
| Surface | `rgba(255,255,255,0.03)` | Card backgrounds, inputs |
| Border | `rgba(255,255,255,0.06)` | Dividers, card edges |
| Gold primary | `#c5a55a` | Accents, links, highlights |
| Gold hover | `#d4af37` | Hover states |
| Gold muted | `rgba(197,165,90,0.5)` | Secondary text, labels |
| Text primary | `white` | Headings |
| Text secondary | `rgba(255,255,255,0.6)` | Body text |
| Text muted | `rgba(255,255,255,0.3)` | Captions, timestamps |
| Heading font | Playfair Display (300–600) | h1–h3, branding |
| Body font | Inter (300–500) | Body, UI, labels |
| Success | `#4ade80` | Status badges, checkmarks |
| Error | `#ef4444` / `#f87171` | Error text, alerts |
| Warning | `#fbbf24` | Warning indicators |

**Global CSS classes** (`src/app.css`):
- `.card-elevated` — gradient surface + shadow + gold border
- `.noise-texture` — subtle noise overlay via SVG data URI
- `.page-enter` — fade-up animation (translateY 10px → 0, 0.3s)
- `.empty-state-icon` — gold glow container for empty state icons

**Typography hierarchy:**
- h1: `font-weight: 300` (light), h2: `400` (regular), h3: `500` (medium)

---

## Authentication

### Login Page (`/login`)

**Purpose:** Staff authentication for admin dashboard access.

**Components:**

| Component | Description |
|-----------|-------------|
| Split-panel layout | Brand visual (left) + login form (right) |
| Brand panel | LEMEDSPA wordmark, gold ornamental corners, noise texture, "Private. Intimate. Exclusive." tagline |
| Login form | Email + password fields, submit button, error display |
| Domain restriction | @lemedspa.com only (enforced at Supabase auth level) |

**Acceptance Criteria:**
- [x] Email + password login via `supabase.auth.signInWithPassword()`
- [x] Invalid credentials show styled error message
- [x] Session token stored via Supabase auth
- [x] Redirects to `/dashboard` on success
- [ ] OTP challenge for untrusted devices (Phase 2)

**Design Decisions:**
- MVP ships email+password only, 2FA enabled incrementally
- Trusted device tracking schema exists in database (for future adaptive MFA)
- Split-panel responsive: form-only on mobile, panel visible on desktop

---

## Dashboard (`/dashboard`)

**Purpose:** Overview of spa operations — calls, messages, contacts at a glance.

**Components:**

| Component | Description |
|-----------|-------------|
| Stats cards (4) | Total calls, missed calls, total contacts, unread messages |
| SVG sparklines | 7-day trend line on Total Calls and Missed Calls cards |
| Call volume chart | Daily call volume bar chart (h-48) |
| Recent calls list | Last 10 calls with inline action summaries |
| Quick access panel | Cards linking to Softphone, Phone Log (voicemail filter), Messages, Contacts |

**Acceptance Criteria:**
- [x] Stats load from `/api/calls/stats`
- [x] Sparklines render 7-day trend with gradient fill
- [x] Recent calls show inline summaries (duration for answered, "Voicemail" for VM, "Missed" for missed)
- [x] Contact name source indicators: gold ◆ (DB contact), dim "CID" (Twilio CNAM), none (phone only)
- [x] Quick access voicemail link uses `?filter=voicemail`
- [x] `card-elevated` class on stat cards
- [x] Responsive: cards stack on mobile

---

## Phone Log (`/calls`)

**Purpose:** Combined call log + voicemails in a single page.

**Components:**

| Component | Description |
|-----------|-------------|
| Segmented toggle | Calls / Voicemails tabs with gold active state |
| Voicemail badge | Unheard count badge on Voicemails tab |
| Call list | Paginated with direction icons, duration, timestamps |
| Filters | All, Inbound, Outbound, Answered, Missed, Voicemail |
| Search | By phone number or contact name |
| Voicemail list | Grouped by mailbox (Main/Care, Lea, Operations, Clinical) |
| Audio player | Play/pause with transcription display |
| Quick actions | Phone (green border) + Message (blue border) icons per row |

**API:** `GET /api/calls`, `GET /api/voicemails`, `GET /api/voicemails/stats`

**Acceptance Criteria:**
- [x] Calls display with direction icon, duration, timestamp
- [x] Pagination (page size, next/prev)
- [x] Filter by direction + disposition
- [x] Search matches phone numbers and contact names
- [x] Voicemails load by selected mailbox
- [x] Audio player plays recordings (proxied through API)
- [x] Transcription displayed when available
- [x] Inline action summaries (`getActionSummary()` function)
- [x] Contact name source indicators (gold ◆ / CID / phone-only)
- [x] Quick action icons: click phone → `/softphone?call=PHONE`, click message → `/messages?phone=PHONE&name=NAME`
- [x] URL param `?view=voicemails` deep links to voicemail tab
- [x] Old `/voicemails` route redirects to `/calls?view=voicemails`

---

## Softphone (`/softphone`)

**Purpose:** Browser-based Twilio voice client for making/receiving calls.

**Components:**

| Component | Description |
|-----------|-------------|
| Dial pad | Round buttons (0-9, *, #), gold call button |
| Phone input | Number field, supports paste and `?call=` URL param |
| Call controls | Answer (green), Decline (red), Hangup, Mute, Hold |
| Incoming call UI | Large 80px buttons, blue gradient background, bounce animation |
| Ringtone | Web Audio API dual-tone (440Hz + 480Hz), ring pattern |
| Browser notifications | OS-level alerts for incoming calls |
| Mic permission | Requested on "Connect" click (not during call) |
| Call timer | Elapsed time display during active call |
| Session log | Activity log of connect/disconnect/call events |

**API:** `POST /api/twilio/token`, `POST /api/twilio/voice`, `POST /api/twilio/connect-operator`

**Acceptance Criteria:**
- [x] Dial pad inputs digits into phone field
- [x] Outbound call connects via Twilio Voice SDK 2.x
- [x] Incoming call shows alert with accept/reject (80px buttons)
- [x] Audible ringtone during incoming call
- [x] Browser notification even when tab is in background
- [x] Mute/hold toggles work during active call
- [x] Call timer displays elapsed time
- [x] Call events logged to `call_logs` table
- [x] "Connecting" yellow transition state between answer and audio
- [x] Auto-dial from URL param: `/softphone?call=+18185551234`

**Design Decisions:**
- Round dial pad buttons (not square) to match luxury brand
- Gold call button instead of green for brand consistency
- Active press animation (`scale(0.95)`)

---

## Messages (`/messages`)

**Purpose:** 2-way SMS/RCS conversations with patients.

**Components:**

| Component | Description |
|-----------|-------------|
| Conversation list | Sorted by last message, contact name + phone |
| Thread view | Chat bubbles (gold outbound, dark inbound) |
| Compose input | Text field + send button |
| New conversation | Phone number input or auto-populated from quick actions |
| Auto-refresh | 10-second polling for new messages |
| Smart routing | Auto-selects existing conversation from `?phone=` param |
| Empty pane | Radial glow, Playfair heading, gold "New conversation" button |

**API:** `GET /api/messages`, `GET /api/messages/:id`, `POST /api/messages/:id/send`, `GET /api/messages/stats`, `GET /api/messages/lookup?phone=`

**Acceptance Criteria:**
- [x] Conversations list shows latest message preview + timestamp
- [x] Thread view displays full message history with timestamps
- [x] Outbound messages sent via Twilio
- [x] Inbound messages received via webhook and displayed
- [x] Delivery status shown (sent/delivered/failed)
- [x] Unread badge in sidebar (gold, polls every 15s)
- [x] Smart routing: `?phone=` param auto-selects existing conversation or prefills compose
- [x] `?name=` param shows contact name in new compose view
- [x] URL params cleaned after processing

---

## Contacts (`/contacts`)

**Purpose:** Unified CRM — all patient/client contacts from multiple sources.

**Components:**

| Component | Description |
|-----------|-------------|
| Contact list | Cards with avatar, name, phone, email, tags |
| Tag filter tabs | Color-coded: patient, lead, vip, partner, employee, friendfam, vendor, unknown |
| Search | By name, phone, or email |
| Inline tags | Add/remove tags on contact cards |
| Quick actions | Phone (green border) + Message (blue border) icons next to contact name |
| Expandable detail | Metadata, source info, call history |
| Phone-only display | Formatted phone as display name (not "Unknown"), avatar shows "#" |

**API:** `GET /api/contacts`, `GET /api/contacts/stats`, `GET /api/contacts/search`, `GET /api/contacts/:id`, `POST /api/contacts`, `PATCH /api/contacts/:id`, `POST /api/contacts/:id/tags`, `DELETE /api/contacts/:id/tags`

**Acceptance Criteria:**
- [x] Contacts list with search by name/phone/email
- [x] Contact detail shows all fields + tags + source
- [x] Tag-based filter tabs with counts
- [x] Inline tag add/remove
- [x] Quick action icons: phone → `/softphone?call=PHONE`, message → `/messages?phone=PHONE&name=NAME`
- [x] Website form submissions appear as contacts (via webhook)
- [x] Source tracking (AR, HighLevel, TextMagic, manual, inbound_call)
- [x] Phone-only contacts show formatted phone as display name
- [x] Contact name font: `text-2xl tracking-wide` Playfair Display
- [x] Avatar: `h-10 w-10`

---

## Services (`/services`)

**Purpose:** Treatment catalog and content management — pre/post instructions, consent forms, FAQs.

**Status:** Fully functional (Phase 1C complete).

**Components:**

| Component | Description |
|-----------|-------------|
| Service cards | Name, category, description, colored left border by category |
| Category colors | Gold (advanced_aesthetics), emerald (regenerative_wellness), purple (bespoke_treatments) |
| Content checklist | Buttons showing which content types exist per service (pre/post/consent/FAQ) |
| Content editor overlay | Full modal for creating/editing content blocks |
| Section builder | Accordion-style add/remove/reorder sections within a content block |
| Auto slug generation | From service slug + content type (e.g., `neuromodulators-pre`) |

**API:** `GET /api/services`, `GET /api/services/:id`, `POST /api/services`, `PATCH /api/services/:id`, `GET /api/services/:id/content`, `POST /api/services/:id/content`, `PATCH /api/services/content/:id`, `DELETE /api/services/content/:id`

**Acceptance Criteria:**
- [x] Services grouped by category with colored left borders
- [x] Service CRUD (create, read, update, delete)
- [x] Content blocks per service (pre_instructions, post_instructions, consent_form, faq, questionnaire, what_to_expect)
- [x] Content editor overlay with section builder
- [x] Auto page_slug generation
- [x] Version tracking on content updates
- [x] Content type checklist buttons per service
- [x] Hover transition effects on cards

**Seeded data:** 10 services across 3 categories, 18 content blocks (13 care + 5 consent)

---

## Automation (`/automation`)

**Purpose:** Automated patient communication sequences (SMS + email) with execution engine.

**Status:** Fully functional (Phase 1C complete).

**Components:**

| Component | Description |
|-----------|-------------|
| Tabs | Sequences / Execution Log |
| Sequence list | Name, trigger event, timing, channel, linked content badge |
| Sequence form | Name, trigger, timing offset, channel (sms/email/both), template type, service, content link, subject, custom body |
| Content linking | `content_ref` dropdown filtered by selected service |
| Test Send modal | Sequence selector + contact search autocomplete + send button |
| Test send per row | Play (▶) button on each sequence for quick testing |
| Process Queue button | On execution log tab, triggers batch processing |
| Execution log table | Paginated (25/page), status badges, timestamps |
| 30-day stats | Sent/delivered/failed counts |

**API:**
- `GET /api/automation/sequences` — List sequences with content JOIN
- `POST /api/automation/sequences` — Create sequence
- `PATCH /api/automation/sequences/:id` — Update sequence
- `DELETE /api/automation/sequences/:id` — Delete sequence
- `POST /api/automation/trigger` — Trigger execution (supports `dry_run`)
- `POST /api/automation/process` — Batch-process scheduled entries
- `GET /api/automation/log` — Execution log with pagination
- `GET /api/automation/stats` — 30-day delivery stats
- `GET /api/automation/consents` — Consent submissions (stub)
- `GET /api/automation/consents/:id` — Single submission (stub)

**Execution Engine** (`api/services/automation.js`):

| Function | Description |
|----------|-------------|
| `sendSms({ to, body, clientId, clientName, metadata })` | Twilio SMS + conversation/message recording |
| `sendEmail({ to, subject, html, text })` | Resend with branded HTML template |
| `executeSequence({ sequence, client, content, triggeredBy, manual })` | Orchestrates send by channel (sms/email/both) |
| `processScheduledAutomation()` | Batch processor for `status='scheduled'` log entries |
| `buildSmsBody(sequence, content, client)` | Priority: custom message_body → content summary → generic fallback |
| `buildEmailHtml(sequence, content, client)` | Branded dark+gold HTML with numbered sections from content_json |
| `buildEmailSubject(sequence, content)` | From sequence.subject_line or content.title |
| `recordOutboundMessage()` | Creates conversation + message records (appears in Messages page) |

**Template variables:** `{name}`, `{first_name}` — replaced with contact data

**Acceptance Criteria:**
- [x] Create/edit/delete automation sequences
- [x] Trigger events: booking_confirmed, pre_appointment, post_treatment, lead_nurture, no_show, rebooking, consent_reminder, check_in
- [x] Template types: confirmation, pre_instructions, reminder, post_care, check_in, rebooking, consent_request, custom
- [x] Channels: sms, email, both
- [x] Timing offsets: negative (before) or positive (after) intervals
- [x] Content linking from service_content blocks
- [x] Test Send modal with contact search + real-time result display
- [x] Process Queue batch processing
- [x] Execution log with pagination + status badges
- [x] SMS appears in Messages page after sending
- [x] Branded email template matching lemedspa.com aesthetic

**Seeded data:** 14 automation sequences (booking confirmation, pre-treatment, post-care, check-in, rebooking, etc.)

---

## Care Instruction Pages (`/care/[slug]`)

**Purpose:** Patient-facing treatment care instructions — pre/post treatment, FAQs.

**Status:** Fully functional, public (no auth).

**Components:**

| Component | Description |
|-----------|-------------|
| Header | LEMEDSPA brand + "PRIVATE · INTIMATE · EXCLUSIVE" tagline |
| Type badge | Content type icon + label (📋 Pre-Treatment, 📋 Post-Treatment, etc.) |
| Numbered sections | From `content_json` array: `{heading, body}` objects |
| Contact card | Clickable `tel:+18184633772` phone link |
| Footer | Address, legal links (Terms, Privacy), trademark |
| Loading state | Gold spinner |
| Error states | 404 not found, network error with retry |

**API:** `GET /api/public/content/:slug` (no auth), `GET /api/public/content` (list all slugs)

**Acceptance Criteria:**
- [x] Loads by slug without authentication
- [x] Renders content_json sections with numbered indicators
- [x] Staggered fade-in animation per section
- [x] Mobile responsive
- [x] Contact card with clickable phone link
- [x] 404 page for invalid slugs
- [x] Network error page with retry button

**Available pages (13):** neuromodulators-pre/post/faq, dermal-fillers-pre/post/faq, microneedling-pre/post/faq, chemical-peels-pre/post, laser-resurfacing-pre/post

---

## Consent Forms (`/consent/[slug]`)

**Purpose:** Patient-facing digital consent forms with questionnaire and signature capture.

**Status:** Fully functional, public (no auth).

**Components:**

| Component | Description |
|-----------|-------------|
| Header | LEMEDSPA brand + tagline (same as care pages) |
| Type badge | 📝 Informed Consent |
| Info sections | Numbered, from `content_json` — Nature of Procedure, Benefits, Risks, Contraindications, etc. |
| Checkbox questions | `{type: "checkbox", heading, body, label}` — custom acknowledgment labels |
| Radio questions | `{type: "radio", heading, body, options: [...]}` — multiple choice |
| Text questions | `{type: "text", heading, body, placeholder}` — free text input |
| Patient info form | Name (required), email, phone — only shown without `?cid=` URL param |
| Agreement checkbox | Full consent acknowledgment text |
| Signature pad | Canvas-based, touch + mouse, retina-aware (devicePixelRatio), gold ink (#c5a55a) |
| Clear signature button | Resets canvas |
| Submit button | Gold gradient, full-width, loading spinner |
| Success page | Green checkmark, confirmation message, contact card |
| Error states | Validation errors (no signature, no name, no agreement), server errors |

**API:**
- `GET /api/public/consent/:slug` — Fetch consent form (filters `content_type='consent_form'`)
- `POST /api/public/consent/:slug/submit` — Submit signed consent

**Submission payload:**
```
{
  client_id: "uuid" (from ?cid= URL param, for known patients)
  OR
  client_name: "string" (required for walk-ins)
  client_email: "string" (optional)
  client_phone: "string" (optional)

  responses: { "q_0": "yes", "q_4": "some text" }
  signature_data: "data:image/png;base64,..."
  form_id: "uuid" (auto-resolved from slug)
  service_id: "uuid" (auto-resolved from slug)
}
```

**Server-side logic:**
- Resolves form_id + service_id from slug if not provided
- Looks up existing contact by email or phone (normalized)
- Auto-creates contact for walk-in patients (source: 'manual', tags: ['consent-form'])
- Records IP address (`x-forwarded-for` header) and user agent
- Inserts into `consent_submissions` with `status: 'completed'`

**Acceptance Criteria:**
- [x] Form loads by slug without authentication
- [x] Info sections render as numbered blocks with Playfair Display headings
- [x] Checkbox/radio/text questionnaire fields functional
- [x] Signature pad captures drawing (touch + mouse)
- [x] Retina display support (devicePixelRatio scaling)
- [x] Validation: signature required, agreement required, name required (walk-ins)
- [x] Submit saves to `consent_submissions` table
- [x] Auto-creates contact for unknown walk-in patients
- [x] Success confirmation page after submission
- [x] Mobile-optimized (touch signature area, stacked layout)
- [x] `?cid=` URL param for automation-linked patients (skips patient info form)

**Available forms (5):** consent-neuromodulators, consent-dermal-fillers, consent-microneedling, consent-chemical-peels, consent-laser-resurfacing

---

## Settings (`/settings`)

**Purpose:** App configuration — business hours, call routing, extensions, security.

**Components:**

| Component | Description |
|-----------|-------------|
| Tab navigation | Clock (Business Hours), Phone (Extensions), GitBranch (Call Routing), Shield (Security) |
| Tab icons | Lucide components (not emoji) |
| Business hours | Per-day open/close times |
| Extensions | Staff phone extensions |
| Call routing | Rules per extension |
| Security | 2FA settings, trusted devices |

**API:** `GET /api/settings`, `PUT /api/settings`

**Acceptance Criteria:**
- [x] Settings load from database
- [x] Tab icons are Lucide components (Clock, Phone, GitBranch, Shield)
- [x] Empty states with proper styling
- [ ] Changes persist on save (partial)
- [ ] Business hours: set open/close per day
- [ ] Call routing: configure rules per extension

---

## Global UI Components

### App Sidebar

| Feature | Description |
|---------|-------------|
| Navigation items | Dashboard, Softphone, Phone Log, Messages, Contacts, Services, Automation, Settings |
| Voicemail badge | Red badge on Phone Log with unheard count (`/api/voicemails/stats`) |
| Message badge | Gold badge on Messages with unread count (`/api/messages/stats`) |
| Badge refresh | Every 15 seconds |
| Badge system | Generalized — any nav item can have `badgeKey` referencing badge state |

### App Header

| Feature | Description |
|---------|-------------|
| Clinic status | Live open/closed indicator (green dot + glow when open, dim when closed) |
| Next state change | "Closes 17:00" or "Opens Monday 09:00" |
| Business hours source | `/api/settings` (loaded on mount + every 60s) |
| Quick-dial button | Links to softphone |
| Border | Gold theme accent |

### Quick Action Icons

Consistent across all pages showing contacts (Phone Log, Dashboard, Contacts, Messages):
- **Phone icon** — Green outline/border, links to `/softphone?call=PHONE`
- **Message icon** — Blue outline/border, links to `/messages?phone=PHONE&name=NAME`
- Always visible (not hover-gated), hover brightens to full opacity
- Icons positioned next to contact name

### Contact Name Source Indicators

Shown on all pages displaying caller/contact names:
- **Gold ◆** — Known contact from database
- **Dim "CID" badge** — Name from Twilio Caller ID (CNAM lookup)
- **No indicator** — Phone number only

---

## Webhooks (Public, No Auth)

### Contact Form (`POST /api/webhooks/contact-form`)
- Receives website form submissions
- Creates/updates contact in database (source: 'website')
- Returns success/error JSON

### Voice Webhooks (`/api/webhooks/voice/*`)
- `POST /incoming` — Logs call, captures CNAM CallerName + geo data, matches contacts
- `POST /event` — IVR menu navigation tracking
- `POST /recording` — Creates voicemail with mailbox param
- `POST /status` — Call lifecycle status updates
- `POST /transcription` — Voicemail transcription results

### SMS Webhooks (`/api/webhooks/sms/*`)
- `POST /incoming` — Inbound SMS → creates/updates conversation + message
- `POST /status` — Delivery status callbacks (sent/delivered/failed)
- `POST /studio-send` — IVR-initiated SMS (from Studio flow via HTTP request)

### Hours Check (`GET /api/webhooks/voice/hours-check`)
- Returns current open/closed status for IVR routing
- Business hours: Mon–Fri 10–6, Sat 10–4 PT, Sun closed

---

## Public API Endpoints (No Auth)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/public/content` | GET | List all active content slugs (sitemap) |
| `/api/public/content/:slug` | GET | Fetch care page content by slug |
| `/api/public/consent/:slug` | GET | Fetch consent form by slug |
| `/api/public/consent/:slug/submit` | POST | Submit signed consent form |
| `/api/health` | GET | API health check |

---

## Database Schema

### Core Tables (Phase 1A/1B)

| Table | Purpose | Key fields |
|-------|---------|-----------|
| `profiles` | User accounts | id, email, role (admin/staff), full_name |
| `trusted_devices` | MFA device tracking | user_id, device_fingerprint, trusted_at |
| `phone_extensions` | Staff extensions | user_id, extension, voicemail_greeting |
| `call_routing_rules` | Time-based routing | extension, day, start_time, end_time |
| `call_logs` | Call records | direction, from_number, to_number, duration, recording_url, disposition, caller_name, contact_id |
| `voicemails` | Recordings | mailbox, call_id, transcription, status (new/read), duration |
| `call_events` | IVR navigation | call_id, event_type, data (JSONB) |
| `contacts` | Unified CRM | full_name, phone, phone_normalized, email, tags (TEXT[]), lists (TEXT[]), source, patient_status, metadata (JSONB) |
| `conversations` | SMS threads | contact_id, phone_number, last_message_at, unread_count |
| `messages` | Individual messages | conversation_id, direction, body, status, twilio_sid, metadata (JSONB) |
| `audit_log` | Security trail | user_id, action, resource_type, resource_id, details (JSONB), ip_address |
| `settings` | App config | key (unique), value (JSONB), updated_by |

### Phase 1C Tables

| Table | Purpose | Key fields |
|-------|---------|-----------|
| `services` | Treatment catalog | name, slug (unique), category, description, duration_min, price_from, is_active, sort_order, metadata (JSONB) |
| `service_content` | Content blocks per service | service_id (FK), content_type, title, summary, page_slug, content_json (JSONB array), version, is_active, created_by |
| `automation_sequences` | Message sequence definitions | service_id, name, trigger_event, timing_offset (INTERVAL), channel, template_type, content_ref (FK→service_content), subject_line, message_body, rcs_actions (JSONB), is_active |
| `automation_log` | Execution tracking | client_id (FK), sequence_id (FK), channel, status (scheduled/sent/delivered/opened/clicked/failed/cancelled), scheduled_at, sent_at, error_message, metadata (JSONB) |
| `consent_submissions` | Signed forms + signatures | client_id (FK), form_id (FK→service_content), service_id (FK), responses (JSONB), signature_data (TEXT, base64 PNG), signed_at, ip_address (INET), user_agent, status (pending/completed/expired/voided) |

**Content types in `service_content`:** pre_instructions, post_instructions, consent_form, questionnaire, faq, what_to_expect

**Unique constraint:** One active content block per service per content type

**Seeded data:** 10 services, 18 content blocks (13 care + 5 consent), 14 automation sequences, 540 contacts

---

## IVR Flow (Twilio Studio)

| Menu | Options |
|------|---------|
| Main greeting | 0 = operator (hours-checked), 1 = text us (SMS), 2 = hours & location, 3 = company directory, timeout = operator |
| After-hours (press 0 when closed) | Plays "closed" greeting: 1 = send SMS, timeout = voicemail |
| Company directory | Sub-menus for departments: Lea, Clinical, Accounts/Ops |
| Each department | 1 = two-way text, 0 = operator, timeout = voicemail |
| Global | Pressing 0 from ANY menu routes to operator |

**Business Hours (for IVR routing):**
- Mon–Fri: 10:00 AM – 6:00 PM PT
- Sat: 10:00 AM – 4:00 PM PT
- Sun: Closed

**Operator routing:** Checks business hours via `GET /api/webhooks/voice/hours-check` → open: connects to HighLevel operator → closed: plays after-hours greeting with SMS/voicemail options

**Fail-safe:** If hours-check API fails, falls through to operator (always reachable)

**IVR-initiated SMS:** Routes through `/api/webhooks/sms/studio-send` so messages appear in Messages page

---

## Claude Code Automation

### Skills (`.claude/skills/`)

| Skill | Command | Description |
|-------|---------|-------------|
| Deploy | `/deploy` | Build + deploy to CF Pages with retry (up to 3), correct PUBLIC_API_URL, post-deploy verification |
| Verify | `/verify` | Production health check: API, CORS, frontend, Supabase, public endpoints, webhooks |
| Commit | `/commit` | Standardized `[area] Description` commit + Co-Authored-By + auto-push |
| Migrate | `/migrate` | Supabase SQL migration with review, `apply_migration`, verification, advisory checks |

### Hooks (`.claude/hooks/`)

| Hook | Trigger | Description |
|------|---------|-------------|
| `session-start.js` | SessionStart | Loads latest 2 SESSION_NOTES entries + git status as context |
| `build-guard.js` | PreToolUse (Bash) | Blocks `vite build` without `PUBLIC_API_URL` set to production URL |
| `check-build.js` | PostToolUse (Write/Edit) | Async build check after editing frontend files |
| `stop-check.js` | Stop | Checks for uncommitted changes, stale SESSION_NOTES, unpushed commits |

### Requirements Capture (`docs/requirements/`)

Structured documentation of all user stories, acceptance criteria, and design specs per page/component. Each page gets its own `.md` file following a standard template:

| File | Page |
|------|------|
| `calls.md` | Phone Log / Calls |
| `messages.md` | Messages / SMS |
| `contacts.md` | Contacts / CRM |
| `dashboard.md` | Dashboard |
| `softphone.md` | Softphone |
| `ivr-flow.md` | Twilio IVR / Studio Flow |

**Format:** User Stories → Acceptance Criteria → Design Specs → User's Original Words → Revision History

**Rule:** When implementing features or design changes from user instructions, always update the relevant requirement file. Capture the user's exact words in "User's Original Words" sections.

### Rules (`.claude/rules/`)

| Rule | Scope | Key conventions |
|------|-------|----------------|
| `api.md` | `api/**` | Use `supabaseAdmin` server-side, webhooks before `express.json()`, audit logging |
| `frontend.md` | `src/**` | Svelte 5 runes only, don't edit `ui/` components, dark+gold theme, `api()` wrapper |
| `database.md` | `*.sql`, `**/db/**` | RLS required, snake_case, E.164 phones, JSONB for flexible data |

### CI/CD (`.github/workflows/ci.yml`)

Steps: install deps → lint → format check → type check → build → unit tests (Vitest, 20 tests) → API integration tests

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
| 2026-02 | Combined Phone Log (calls + voicemails) | One page instead of two, segmented toggle, cleaner sidebar |
| 2026-02 | Public consent forms (no auth) | Patients access via URL in automation SMS, walk-ins self-identify |
| 2026-02 | Canvas signature pad (no library) | Zero dependencies, touch+mouse, retina-ready, gold ink on dark canvas |
| 2026-02 | Content-aware automation | Sequences link to content blocks, SMS uses summary, email uses content_json sections |
| 2026-02 | SMS body priority chain | Custom message_body → content summary → generic fallback |
| 2026-02 | Auto-create contacts from consent | Walk-in patients auto-onboarded via phone/email lookup, tagged 'consent-form' |
| 2026-02 | IVR SMS through our API | Studio `make-http-request` → `/api/webhooks/sms/studio-send` so messages appear in Messages page |
| 2026-02 | Contact name source indicators | Gold ◆ (DB), CID badge (Twilio CNAM), none (phone-only) — across all pages |
| 2026-02 | Quick action icons always visible | Not hover-gated, phone=green border, message=blue border, next to contact name |
| 2026-02 | ESLint + Vitest + GitHub Actions CI | Automated quality gates, 20 unit tests, lint on every push |
| 2026-02 | Claude Code skills for deploy/verify/commit | Standardized workflows, prevents localhost-in-build errors |
| 2026-02 | Business hours via API endpoint (not Studio widget) | Studio time widget lacks timezone support; API handles LA timezone correctly, extensible to DB-configurable hours |
| 2026-02 | Smart message routing with lookup API | 3-tier: existing conversation → known contact → unknown number; graceful fallback on API errors |
| 2026-02 | Requirements capture in `docs/requirements/` | Structured user stories with acceptance criteria + user's exact words; enables rebuild-from-scratch and regression testing |
| 2026-02 | Phone normalization with format variants | Lookup endpoints try +1XXXXXXXXXX, 1XXXXXXXXXX, XXXXXXXXXX variants to handle inconsistent storage formats |
