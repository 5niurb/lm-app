# PRD: MMS / Image Support

## Overview
Inbound MMS media URLs are already stored in the `messages.media_urls` JSONB column but never displayed. There's no way to send images outbound. This PRD adds image display (inbound + outbound), a media proxy API, and image attachment in the compose bar.

## Context for Agent
- **Branch name:** ralph/mms-support
- **Tech stack:** SvelteKit + Svelte 5 runes, Express ES modules, Supabase, Tailwind v4
- **Key files touched:**
  - `api/routes/messages.js` — media proxy endpoint, extend send endpoint
  - `src/lib/components/messaging/ChatsTab.svelte` — message bubble rendering
  - `src/lib/components/messaging/ComposeBar.svelte` — file picker button
  - New: image lightbox component
- **Design system:** Dark bg #0a0a0c, gold accent #C5A55A, Playfair Display headings
- **API base:** http://localhost:3001 (dev) / https://api.lemedspa.app (prod)

## Technical Context
- **messages.media_urls:** JSONB array of Twilio media URLs (set by sms.js webhook on inbound)
- **Twilio media URLs:** Format `https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages/{SID}/Media/{SID}` — require HTTP Basic auth with account SID + auth token
- **Existing proxy pattern:** See `GET /api/voicemails/:id/recording` — same authenticated Twilio proxy approach
- **Twilio outbound MMS:** `client.messages.create({ to, from, body, mediaUrl: ['https://...'] })` — mediaUrl must be publicly accessible
- **File upload for outbound:** Options: (a) upload to Supabase Storage then pass public URL to Twilio, or (b) base64 inline. Supabase Storage is preferred.

## API Shape Reference

**Inbound message with media (existing):**
```json
{
  "id": "uuid",
  "body": "Check out this photo!",
  "media_urls": ["https://api.twilio.com/2010-04-01/Accounts/.../Media/..."],
  "direction": "inbound"
}
```

**Media proxy endpoint (new):**
```
GET /api/messages/:id/media/:index
→ Streams the Twilio media content with correct Content-Type
→ Requires auth (verifyToken)
```

**Outbound MMS (extend existing):**
```json
POST /api/messages/send
{
  "to": "+13105551234",
  "body": "Here's your treatment photo",
  "mediaUrl": "https://skvsjcckissnyxcafwyr.supabase.co/storage/v1/object/public/mms/..."
}
```

## Design Reference
- Inbound images: thumbnail inside the dark inbound bubble, below text
- Outbound images: thumbnail inside the gold outbound bubble, below text
- Thumbnails: max 240px wide, rounded corners, clickable
- Lightbox: full-screen dark overlay, close on click outside or X button
- Compose attachment preview: small thumbnail with X remove button, above the textarea

## Non-Goals
- No video support (images only: jpg, png, gif, webp)
- No file attachments beyond images
- No in-app image editing or cropping
- No gallery view across conversations
