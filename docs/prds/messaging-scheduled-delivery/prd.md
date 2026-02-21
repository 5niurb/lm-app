# PRD: Scheduled Message Delivery

## Overview
The scheduled_messages table, API (CRUD), and UI (ScheduledTab + SchedulePopover in ComposeBar) all exist. What's missing is the **background job that actually sends messages** when `scheduled_at` arrives. Messages currently sit as 'pending' forever.

## Context for Agent
- **Branch name:** ralph/scheduled-delivery
- **Tech stack:** SvelteKit + Svelte 5 runes, Express ES modules, Supabase, Tailwind v4
- **Key files touched:**
  - `api/server.js` — background job interval
  - `api/routes/scheduled-messages.js` — existing CRUD (don't rewrite, extend)
  - `api/db/migration-scheduled-delivery.sql` — new column(s)
  - `src/lib/components/messaging/ScheduledTab.svelte` — display enhancements
- **Design system:** Dark bg #0a0a0c, gold accent #C5A55A, Playfair Display headings
- **API base:** http://localhost:3001 (dev) / https://api.lemedspa.app (prod)

## Technical Context
- **Supabase tables:** `scheduled_messages` (exists), `messages` (exists), `conversations` (exists)
- **Twilio:** Use existing `twilio` client pattern from `api/routes/messages.js` — `client.messages.create()`
- **Existing send pattern:** See `POST /api/messages/send` in `api/routes/messages.js` for conversation find-or-create logic
- **Phone lookup:** Use `findConversation()` and `lookupContactByPhone()` from `api/services/phone-lookup.js`
- **From number fallback chain:** `from_number || TWILIO_SMS_FROM_NUMBER || TWILIO_TEST1_PHONE_NUMBER || TWILIO_PHONE_NUMBER || TWILIO_MAIN_PHONE_NUMBER`

## API Shape Reference

**scheduled_messages table (existing):**
```sql
id              UUID PK
conversation_id UUID FK → conversations
to_number       TEXT NOT NULL
from_number     TEXT
body            TEXT NOT NULL
template_id     UUID FK → sms_templates
scheduled_at    TIMESTAMPTZ NOT NULL
status          TEXT CHECK (pending|sent|failed|cancelled)
sent_at         TIMESTAMPTZ
error_message   TEXT
created_by      UUID FK → profiles
metadata        JSONB
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
```

**messages table insert shape (for linking sent messages):**
```json
{
  "conversation_id": "uuid",
  "direction": "outbound",
  "body": "message text",
  "from_number": "+18184633772",
  "to_number": "+13105551234",
  "twilio_sid": "SM...",
  "status": "sent",
  "metadata": { "source": "scheduled", "scheduled_message_id": "uuid" }
}
```

## Non-Goals
- No recurring/repeat messages
- No timezone-aware scheduling UI (times stored UTC, displayed in browser local time)
- No batch scheduling (one message at a time)
- Don't rewrite existing scheduled-messages API — only extend
