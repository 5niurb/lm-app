# PRD: Auto-Replies

## Overview
Automatic responses to common inbound SMS messages (hours, address, booking link) without staff intervention. Staff configures keyword-based rules with optional business hours restrictions. Only one auto-reply fires per inbound message (highest priority wins).

## Files
- **prd.json:** `docs/prds/messaging-auto-replies/prd.json`
- **progress.txt:** `docs/prds/messaging-auto-replies/progress.txt`

## Context for Agent
- **Branch name:** ralph/auto-replies
- **Tech stack:** SvelteKit + Svelte 5 runes, Express ES modules, Supabase, Tailwind v4
- **Key files to modify:**
  - `api/db/migration-auto-replies.sql` — CREATE new table (new file)
  - `api/routes/auto-replies.js` — CRUD route (new file)
  - `api/routes/webhooks/sms.js` — add auto-reply matching after message save (existing file)
  - `api/server.js` — mount new route (existing file, add import + app.use)
  - `src/routes/(auth)/settings/+page.svelte` — or new settings sub-section (existing file or new component)
  - `src/lib/components/messaging/ChatsTab.svelte` — auto-reply badge on bubbles (existing file)
  - `api/db/seed-auto-replies.sql` — default rules (new file)
- **Design system:** Vivid Dark — near-black bg #09090b, gold accent #d4a843, Outfit headings, DM Sans body. Multi-color vivid accents (indigo, blue, violet, emerald, cyan, amber, orange, rose) for icons and badges. Use semantic CSS tokens (text-text-secondary, bg-surface-hover, border-border-subtle, etc.) — see src/app.css for full design system.
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
