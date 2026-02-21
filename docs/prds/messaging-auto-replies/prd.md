# PRD: Auto-Replies

## Overview
Automatic responses to common inbound SMS messages (hours, address, booking link) without staff intervention. Staff configures keyword-based rules with optional business hours restrictions. Only one auto-reply fires per inbound message (highest priority wins).

## Context for Agent
- **Branch name:** ralph/auto-replies
- **Tech stack:** SvelteKit + Svelte 5 runes, Express ES modules, Supabase, Tailwind v4
- **Key files touched:**
  - `api/db/migration-auto-replies.sql` — new table
  - `api/routes/auto-replies.js` — new CRUD route
  - `api/routes/webhooks/sms.js` — add auto-reply matching after message save
  - `api/server.js` — mount new route
  - `src/routes/(auth)/settings/+page.svelte` — or new settings sub-section
  - `src/lib/components/messaging/ChatsTab.svelte` — auto-reply badge on bubbles
- **Design system:** Dark bg #0a0a0c, gold accent #C5A55A, Playfair Display headings
- **API base:** http://localhost:3001 (dev) / https://api.lemedspa.app (prod)

## Technical Context
- **Inbound SMS webhook:** `api/routes/webhooks/sms.js` POST `/incoming` — this is where auto-reply matching hooks in, AFTER the message is saved to the database
- **Hours check:** The API already has a `/api/hours-check` endpoint that returns open/closed status. Use this for hours_restriction matching.
- **Twilio send pattern:** Same as everywhere else — `client.messages.create({ to, from, body })`
- **From number:** Use the `To` number from the inbound message (the Twilio number that received it) as the `from` for the auto-reply. This is stored as `toNumber` in the webhook handler.

## API Shape Reference

**auto_reply_rules table (new):**
```sql
CREATE TABLE auto_reply_rules (
  id                UUID PK DEFAULT gen_random_uuid(),
  trigger_type      TEXT CHECK (keyword|any) DEFAULT 'keyword',
  trigger_keywords  TEXT[] DEFAULT '{}',
  response_body     TEXT NOT NULL,
  is_active         BOOLEAN DEFAULT true,
  priority          INTEGER DEFAULT 10,
  hours_restriction TEXT CHECK (always|after_hours|business_hours) DEFAULT 'always',
  created_by        UUID FK → profiles,
  metadata          JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);
```

**CRUD endpoints:**
```
GET    /api/auto-replies           → list all rules (sorted by priority)
POST   /api/auto-replies           → create rule
PUT    /api/auto-replies/:id       → update rule
DELETE /api/auto-replies/:id       → soft delete (is_active=false)
```

## Non-Goals
- No AI/LLM-powered chatbot or intent detection
- No multi-turn conversation flows
- No auto-reply to outbound messages
- No per-contact opt-out from auto-replies
- No rate limiting per phone number (future consideration)
