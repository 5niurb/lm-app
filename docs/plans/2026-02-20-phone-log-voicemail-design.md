# Phone Log + Voicemail Enhancements

**Date:** 2026-02-20
**Status:** Approved

## Problem Statement

1. Contact names don't show for known numbers — lookup only happens at call insert time
2. Voicemail play button exists but is nearly invisible (10px text, 60% opacity)
3. No way to delete voicemails or mark them as permanently saved
4. Font sizes need another +1pt bump (17px → 18px)

## Design

### 1. Contact Name Resolution (API Enrichment)

The calls API (`GET /api/calls`) currently returns raw `caller_name`/`contact_id` from `call_logs`. If a contact was added after the call, the name stays null.

**Fix:** After fetching call_logs, batch-lookup contacts by phone number for any rows with null `contact_id`. Use the shared `lookupContactByPhone()` utility. Attach matched `contact_name` and `contact_id` to the response.

**Files:** `api/routes/calls.js`

### 2. Voicemail Play Button (Redesign)

Replace the tiny text button with a properly sized pill button matching the call-back/message action icons. Gold border, play icon, visible without hover.

**Files:** `src/routes/(auth)/calls/+page.svelte`

### 3. Voicemail Transcription Preview

Show first ~80 chars of transcription between action icons and timestamp:

```
[Dir Icon] Contact Name  [Callback] [Message] [▶ Play]  "First 80 chars..."   2:34 PM
```

**Files:** `src/routes/(auth)/calls/+page.svelte`

### 4. Voicemail Save/Delete

**Save (preserve):**
- `PATCH /api/voicemails/:id/save` — download recording from Twilio → upload to Supabase Storage (`voicemails/` bucket) → set `preserved=true`, `storage_path` in DB
- Recording proxy checks Supabase Storage first, Twilio second
- DB migration: add `preserved BOOLEAN DEFAULT false`, `storage_path TEXT` to voicemails table

**Delete:**
- `DELETE /api/voicemails/:id` — remove from DB + delete Twilio recording + remove from Supabase Storage
- Cascade: also removes associated call_log voicemail reference

**UI:** Bookmark (save) + trash (delete) icon buttons on voicemail rows. Bookmark filled when preserved.

**Files:** `api/routes/voicemails.js`, `api/db/migrations/003-voicemail-preserve.sql`, `src/routes/(auth)/calls/+page.svelte`

### 5. Font Size +1pt

Bump root `html` from 17px → 18px in `src/app.html`. All rem-based sizes scale proportionally (~6%).

**Files:** `src/app.html`

## Twilio Retention

User will manually set Twilio recording retention to 90 days in Console. "Save" downloads to Supabase Storage for permanent keeping beyond 90 days.
