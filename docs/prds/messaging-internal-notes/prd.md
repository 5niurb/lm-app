# PRD: Internal Notes

## Overview
Staff-only notes that appear inline within conversation threads but are never sent to the patient/contact. When the "Internal note" toggle is active, the compose area changes appearance (warm yellow tint), the placeholder changes to "Type your internal note", and the send button becomes "Add note". Notes display inline in the message thread with a distinct yellow/cream background, labeled with the staff member's name and "(internal note)".

## Reference
- **Design screenshots:** `docs/designref/messaging-composer/` — TextMagic reference UI showing toggle, compose mode, and inline display
- **Key behaviors from reference:**
  - Toggle switch in compose toolbar between emoji/tag/template icons and send button
  - When toggled ON: compose area background becomes warm cream/yellow (#FFF8E1 or similar)
  - Placeholder text changes to "Type your internal note"
  - Send button label changes from "Send" → "Add note" with warm gold background
  - Notes appear inline in thread with yellow-tinted bubble, labeled: "Staff Name (internal note)"
  - Notes are never sent via SMS/Twilio — they are local database records only

## Files
- **prd.json:** `docs/prds/messaging-internal-notes/prd.json`
- **progress.txt:** `docs/prds/messaging-internal-notes/progress.txt`

## Context for Agent
- **Branch name:** ralph/internal-notes
- **Tech stack:** SvelteKit + Svelte 5 runes, Express ES modules, Supabase, Tailwind v4
- **Key files to modify:**
  - `api/db/migration-internal-notes.sql` — ALTER messages table or CREATE new table (new file)
  - `api/routes/messages.js` — add note creation endpoint, filter notes from SMS-only queries (existing file)
  - `src/lib/components/messaging/ComposeBar.svelte` — add internal note toggle + mode switching (existing file)
  - `src/lib/components/messaging/ChatsTab.svelte` — render internal note bubbles with distinct style (existing file)
- **Design system:** Dark bg #0a0a0c, gold accent #C5A55A, Playfair Display headings
- **API base:** http://localhost:3001 (dev) / https://api.lemedspa.app (prod)

## Technical Context
- **Messages table:** `messages` with `direction` (inbound/outbound), `body`, `sent_by`, `metadata` JSONB
- **Approach A — metadata flag:** Add notes as regular messages with `metadata: { type: 'internal_note' }` and `direction: 'outbound'`. Simplest, but requires filtering on every message query.
- **Approach B — dedicated column:** Add `is_internal_note BOOLEAN DEFAULT false` column to messages table. Clean filtering via WHERE clause, minimal schema change.
- **Recommended: Approach B** — a dedicated column is faster to query, easier to filter, and clearer in intent. The column can be indexed for efficient exclusion from standard message feeds if needed.
- **Auth context:** `sent_by` UUID links to `profiles` table which has `full_name` — use this to display "Staff Name (internal note)" on the bubble.
- **Existing send flow:** `POST /api/messages/send` creates a Twilio message + database record. Internal notes must SKIP Twilio entirely — they only insert into the database.

## API Shape Reference

**Migration (add column to existing messages table):**
```sql
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_internal_note BOOLEAN DEFAULT false;

CREATE INDEX idx_messages_internal_note
  ON public.messages (is_internal_note)
  WHERE is_internal_note = true;
```

**New endpoint:**
```
POST /api/messages/note
Body: { conversationId: UUID, body: string }
Response: { data: { id, conversation_id, body, is_internal_note: true, sent_by, created_at } }
```

**Existing queries to modify:**
- `GET /api/messages/conversations` — `last_message` preview should NOT show internal notes
- `GET /api/messages/conversations/:id` — include internal notes in thread (they display inline)
- `GET /api/messages/log` — exclude internal notes from the direction-filtered log view

## Visual Specifications

### Compose Bar — Note Mode
- **Toggle:** Switch component positioned after the template/attachment icons, before send button
  - Label: "Internal note"
  - OFF state: standard compose (white/dark background)
  - ON state: compose area gets warm background `bg-amber-50/10` or `rgba(255,248,225,0.08)`
- **Placeholder:** "Type your internal note" (when toggle is ON)
- **Send button:** Changes to "Add note" with warm gold variant styling
- **Textarea background:** Subtle warm tint when note mode is active

### Thread — Note Bubble
- **Background:** `rgba(255,248,225,0.12)` (warm cream/yellow tint on dark theme)
- **Border:** `1px solid rgba(255,248,225,0.2)` — distinct from standard message bubbles
- **Alignment:** Right-aligned (same as outbound messages — it's from staff)
- **Header:** "Staff Name (internal note)" in amber/gold text, smaller font
- **Timestamp:** Same format as regular messages
- **No delivery status icons** — notes are not sent, so no clock/check/double-check

## Non-Goals
- No editing or deleting notes after creation (future consideration)
- No @mentions or tagging other staff in notes
- No file/image attachments in notes
- No notes visible to patients (ever — this is staff-only)
- No notes in broadcast messages
- No notes search (standard search does not match note content, future consideration)
