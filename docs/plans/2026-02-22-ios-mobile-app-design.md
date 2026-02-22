# iOS Mobile App — Design Document

**Date:** 2026-02-22
**Status:** Draft
**Scope:** MVP — Calls + Messages + Softphone

## Context

LeMed Spa's lm-app web application (SvelteKit + Express + Supabase + Twilio) provides staff with messaging, call management, and a browser-based softphone. The softphone has a known UX issue: it requires navigating to the `/softphone` page, waiting for a Twilio WebSocket connection, and loses the connection when navigating away. Staff miss calls when on other pages. An iOS mobile app solves this with always-on VoIP via Apple's PushKit and CallKit — incoming calls arrive on the lock screen with no page loading or connection delay.

**Target user:** Staff (front desk, nurses, admin). Patient-facing mode is a future phase.

## Decisions Made

| Decision | Choice | Rationale |
|---|---|---|
| Framework | React Native (Expo) | Official Twilio Voice RN SDK with CallKit/PushKit. Expo supports it out-of-the-box. |
| Not Capacitor | Rejected | WebRTC in WKWebView can't support CallKit/PushKit for background incoming calls. |
| Not SvelteKit → React conversion | Rejected | Only ~20% code sharing between React web and React Native. Not worth the migration cost. |
| Separate repo | `lm-mobile/` | Different build system, dependencies, and deployment pipeline than the web app. |
| Same backend | No API changes for MVP (except token endpoint) | Express API on Render is already mobile-compatible. |

## Tech Stack

- **Expo SDK 52+** with Expo Router (file-based routing)
- **@twilio/voice-react-native-sdk v2.x** — VoIP, CallKit, PushKit
- **@supabase/supabase-js** — Auth (same as web app)
- **expo-secure-store** — JWT persistence (iOS Keychain)
- **expo-av** — Voicemail audio playback
- **expo-notifications** — Push for missed calls / new SMS
- **TanStack Query** — API data fetching with stale cache for offline resilience
- **@react-native-community/netinfo** — Connectivity detection

## Project Structure

```
lm-mobile/
├── app/                            # Expo Router
│   ├── (auth)/                     # Auth-gated tab layout
│   │   ├── _layout.tsx             # Tab navigator (Calls, Messages, Phone)
│   │   ├── calls/
│   │   │   └── index.tsx           # Call log (FlatList + filters)
│   │   ├── messages/
│   │   │   ├── index.tsx           # Conversation list
│   │   │   └── [id].tsx            # Message thread + compose
│   │   └── phone/
│   │       └── index.tsx           # Dial pad + active call
│   ├── login.tsx
│   └── _layout.tsx                 # Root layout (auth init, Twilio init)
├── src/
│   ├── api/
│   │   └── client.ts               # Fetch wrapper (Bearer auth, no cookies)
│   ├── auth/
│   │   └── session.ts              # Supabase + SecureStore adapter
│   ├── voip/
│   │   └── device.ts               # Twilio Voice singleton
│   ├── store/                      # TanStack Query hooks
│   └── utils/
│       └── phone.ts                # Port of formatPhone/normalizePhone
├── app.json
├── eas.json
└── package.json
```

## Navigation

Three-tab layout:

```
┌─────────────────────────────────┐
│         LeMed Spa               │
├─────────────────────────────────┤
│                                 │
│   [Screen Content]              │
│                                 │
├─────────────────────────────────┤
│  Calls  │  Messages  │  Phone   │
└─────────────────────────────────┘
```

- **Calls tab:** FlatList, filter chips (All/Inbound/Outbound/Missed/Voicemail), search, voicemail playback, swipe actions
- **Messages tab:** Conversation list with unread badges, tap → push to thread screen, compose bar
- **Phone tab:** Dial pad, call/hangup, mute/speaker. Incoming calls use native iOS CallKit UI (lock screen, car play)

## API Integration

The mobile app consumes the same Express API (`api.lemedspa.app`). No CORS changes needed — native apps don't send `Origin` headers.

### Endpoints (MVP)

| Screen | Endpoint | Method |
|---|---|---|
| Calls | `/api/calls` | GET |
| Calls | `/api/voicemails/:id/recording` | GET |
| Messages | `/api/messages/conversations` | GET |
| Messages | `/api/messages/conversations/:id` | GET |
| Messages | `/api/messages/send` | POST |
| Messages | `/api/messages/lookup` | GET |
| Messages | `/api/messages/stats` | GET |
| Softphone | `/api/softphone/token` | POST |
| Push | `/api/push/register` | POST (new) |

### Auth Pattern

```
Mobile App → supabase.auth.signInWithPassword() → JWT stored in SecureStore
Mobile App → fetch('/api/...', { headers: { Authorization: Bearer <token> } })
```

No `credentials: 'include'` — native apps have no cookie jar. The Supabase client auto-refreshes tokens via the SecureStore adapter.

## VoIP Architecture

```
Twilio Cloud ──VoIP Push──► PushKit ──► Twilio RN SDK ──► CallKit (native call screen)
                                              │
Mobile App ──token request──► Express API ──► Twilio Access Token (with pushCredentialSid)
```

**Incoming calls:** PushKit wakes app (even if terminated) → CallKit shows native call screen → user answers → WebRTC audio connects. No delay.

**Outbound calls:** SDK fetches token → connects to Twilio → TwiML webhook routes call → CallKit shows active call UI.

## Backend Changes Required

### 1. Token endpoint modification (backward-compatible)

File: `api/routes/twilio.js` (or wherever POST /softphone/token lives)

Add `platform` parameter. When `platform === 'mobile'`, include `pushCredentialSid` in the VoiceGrant:

```javascript
const voiceGrant = new VoiceGrant({
  outgoingApplicationSid: process.env.TWILIO_TWIML_APP_SID,
  incomingAllow: true,
  ...(platform === 'mobile' && process.env.TWILIO_PUSH_CREDENTIAL_SID
    ? { pushCredentialSid: process.env.TWILIO_PUSH_CREDENTIAL_SID }
    : {}),
});
```

### 2. New push registration endpoint

File: `api/routes/push.js` (new)

```
POST /api/push/register
Body: { device_token, platform }
```

### 3. New Supabase table

```sql
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  device_token TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'ios',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, platform)
);
```

### 4. Push trigger on inbound SMS

File: `api/routes/webhooks/sms.js`

After processing an inbound SMS, send a push notification to the staff member's registered device token via APNs (using `expo-server-sdk` or `apn` library on the backend).

## Apple Developer Setup (prerequisites)

1. Create App ID with VoIP Services entitlement
2. Generate VoIP Services certificate in Apple Developer Portal
3. Register certificate as PushKit credential in Twilio Console → Voice → Push Credentials
4. Store the credential SID as `TWILIO_PUSH_CREDENTIAL_SID` in Render env vars

## Web-Specific Patterns to Avoid on Mobile

| Web Pattern | Mobile Alternative |
|---|---|
| `URL.createObjectURL(blob)` | `expo-av` + `FileSystem.cacheDirectory` |
| `new AudioContext()` | Bundle ringtone `.mp3`, play via `expo-av` |
| `credentials: 'include'` | Omit — Bearer token only |
| `window.location.search` | Expo Router `useLocalSearchParams()` |
| `setInterval` polling (10s) | Supabase Realtime (foreground) + push (background) |

## Offline / Poor WiFi Handling

- **Messages:** Optimistic send queue → persisted in AsyncStorage → drained on connectivity restore
- **Call log:** TanStack Query with `staleTime: 5min` → shows cached data when offline
- **Voicemails:** Cache audio in `FileSystem.cacheDirectory` after first play
- **VoIP calls:** Twilio SDK has built-in reconnection. If full disconnect, call drops (VoIP constraint).

## Security

- JWT in `expo-secure-store` (iOS Keychain, hardware-backed)
- Voicemail cache in `cacheDirectory` (excluded from iCloud backup)
- 401 response → clear session, redirect to login
- Phase 2: biometric lock (`expo-local-authentication`), certificate pinning

## Hard Costs

| Item | Cost |
|---|---|
| Apple Developer Program | $99/yr |
| Framework + SDKs | Free (MIT) |
| Build system | Xcode (local, free) or EAS Build (free tier: 30/mo) |
| Twilio | No change from current |
| Backend hosting | No change |

## Implementation Phases

| Phase | Scope | Estimate |
|---|---|---|
| **1 (MVP)** | Auth + Calls + Messages + Softphone | ~1-2 weeks |
| **2** | Dashboard tab, Contacts tab, push notifications | ~1 week |
| **3** | Appointments, voicemail transcription view | ~1 week |
| **4** | Automation, Kanban, marketing | ~2-3 weeks |
| **5** | Patient-facing mode | ~2-4 weeks |

## Build & Distribution

- **Development:** Expo Dev Client (custom native build with Twilio)
- **Testing:** TestFlight (internal)
- **Production:** App Store
- **CI/CD:** EAS Build or local Xcode

## Verification

1. Login with Supabase credentials → lands on Calls tab
2. Call log loads with filters and search working
3. Tap conversation → thread loads, can send reply
4. Dial number from Phone tab → outbound call connects
5. Receive inbound call while app is backgrounded → native CallKit screen appears
6. Receive inbound call while app is terminated → CallKit wakes app and shows call screen
7. New SMS arrives while app is backgrounded → push notification appears
