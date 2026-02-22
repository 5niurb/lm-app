# PRD: Broadcast / Bulk Messaging

## Overview
Send one message to multiple contacts at once using templates with merge tags. Used for promotions ("20% off Botox this week"), appointment reminders, and re-engagement campaigns. Messages are sent individually (not group text) and each creates/updates the contact's conversation thread.

## Context for Agent
- **Branch name:** ralph/broadcast
- **Tech stack:** SvelteKit + Svelte 5 runes, Express ES modules, Supabase, Tailwind v4
- **Key files touched:**
  - `api/db/migration-broadcast.sql` — new table
  - `api/routes/broadcasts.js` — new CRUD + send routes
  - `api/server.js` — mount new route
  - `src/routes/(auth)/messages/+page.svelte` — add Broadcasts tab (4th tab)
  - New: `src/lib/components/messaging/BroadcastsTab.svelte`
  - New: `src/lib/components/messaging/BroadcastCompose.svelte`
- **Design system:** Dark bg #0a0a0c, gold accent #C5A55A, Playfair Display headings
- **API base:** http://localhost:3001 (dev) / https://api.lemedspa.app (prod)

## Technical Context
- **Contacts table:** Has `tags TEXT[]`, `source TEXT`, `phone TEXT`, `phone_normalized TEXT`. Filter recipients by tags and source.
- **Templates:** `sms_templates` table with merge tags like `{{first_name}}`, `{{service}}`. Template resolution happens server-side at send time.
- **Conversations:** `findConversation()` and conversation create pattern from `api/services/phone-lookup.js`
- **Twilio rate limit:** ~1 message/second for standard numbers. Add 100ms delay between sends.
- **Merge tag resolution:** Replace `{{first_name}}` with `contacts.first_name`, `{{full_name}}` with `contacts.full_name`, etc.

## API Shape Reference

**broadcasts table (new):**
```sql
CREATE TABLE broadcasts (
  id               UUID PK DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  body             TEXT NOT NULL,
  template_id      UUID FK → sms_templates,
  status           TEXT CHECK (draft|sending|sent|failed) DEFAULT 'draft',
  recipient_filter JSONB DEFAULT '{}',
  recipient_count  INTEGER DEFAULT 0,
  sent_count       INTEGER DEFAULT 0,
  failed_count     INTEGER DEFAULT 0,
  from_number      TEXT,
  created_by       UUID FK → profiles,
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  metadata         JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);
```

**recipient_filter shape:**
```json
{
  "tags": ["patient", "botox"],
  "tags_match": "any",
  "source": "website_form",
  "exclude_tags": ["do_not_contact"]
}
```

**CRUD + action endpoints:**
```
GET    /api/broadcasts                → list broadcasts
POST   /api/broadcasts                → create broadcast (draft)
PUT    /api/broadcasts/:id            → update draft
DELETE /api/broadcasts/:id            → delete draft
POST   /api/broadcasts/:id/preview    → resolve filter → return count + sample contacts
POST   /api/broadcasts/:id/send       → start sending (background)
GET    /api/broadcasts/:id/status     → get send progress
```

## Design Reference
- Broadcasts tab: same style as Chats/Templates/Scheduled tabs
- Compose form: template selector + custom body editor, tag filter checkboxes, recipient count preview
- Progress view: progress bar during send, final stats card (sent/failed/total)
- Match the visual style of TemplatesTab and ScheduledTab

## Non-Goals
- No A/B testing
- No unsubscribe/opt-out management (future TCPA compliance work)
- No recurring/scheduled broadcasts
- No per-message delivery tracking in broadcast view (tracked in individual conversations)
- No segment-based targeting beyond tags and source
