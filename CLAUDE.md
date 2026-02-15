# CLAUDE.md — lm-app

## What This Is

Custom management platform for Le Med Spa. Replaces HighLevel, TextMagic, and (eventually) Aesthetic Record. Handles call logging, voicemail, 2-way SMS messaging, CRM/contacts, softphone, services catalog, and automation sequences.

## Design Direction

All Le Med Spa properties use the **dark + gold** aesthetic:
- **Background:** Dark (#0a0a0c)
- **Accents:** Gold (#d4af37, #c5a24d)
- **Typography:** Playfair Display (headings) + Inter (body)
- **Style:** Luxurious, intimate, high-end

The lm-app dashboard should follow this same design language where possible — dark sidebar, gold accents, clean typography. shadcn-svelte components can be themed to match.

## Tech Stack

- **Frontend:** SvelteKit + Tailwind CSS v4 + shadcn-svelte (Svelte 5)
- **API:** Express.js (ES modules, Node 20+)
- **Database:** Supabase (PostgreSQL with RLS + Auth)
- **Deployment:** Cloudflare Pages (frontend), Render (API)
- **Integrations:** Twilio (voice), Resend (email), Stripe (future), Cal.com (future)

## Project Structure

```
lm-app/
  src/                    — SvelteKit frontend
    routes/
      login/              — Public login page
      (auth)/             — Auth-protected routes (sidebar layout)
        dashboard/        — Stats, call volume chart, quick access
        softphone/        — Browser-based Twilio softphone (auto-connects)
        calls/            — Call log with inbound/outbound/missed filters
        voicemails/       — Voicemails by mailbox, audio proxy playback
        messages/         — 2-way SMS conversations
        contacts/         — CRM with tags, quick actions, website form leads
        services/         — Treatment catalog (Phase 1C)
        automation/       — Message sequences + execution log (Phase 1C)
        settings/         — App settings
    lib/
      components/ui/      — shadcn-svelte components (auto-generated, don't edit)
      components/         — App components (AppSidebar, AppHeader)
      stores/             — Svelte stores (auth)
      api/                — API client wrapper
      utils/              — Supabase client, formatters
  api/                    — Express backend
    server.js             — Entry point, CORS multi-origin config
    routes/
      calls.js            — Call logs CRUD + stats
      voicemails.js       — Voicemails CRUD + recording proxy
      messages.js         — SMS conversations + threads
      contacts.js         — Contacts CRUD + tags + form submissions
      services.js         — Services + content blocks (Phase 1C)
      automation.js       — Sequences + log + stats (Phase 1C)
      settings.js         — App settings
      webhooks/
        voice.js          — Twilio voice webhooks (incoming, event, recording, status, transcription)
        sms.js            — Twilio SMS incoming + delivery status
        contact-form.js   — Website contact form → lead creation
    middleware/            — Auth, business hours, geo, audit
    services/             — Supabase, Twilio, Resend clients
    db/
      schema.sql          — Phase 1A/1B schema (core tables)
      schema-phase1c.sql  — Phase 1C schema (services, automation, consents)
  supabase/seed.sql       — Dev seed data
```

## Conventions

- **JS, not TS.** We use JSDoc type annotations with `jsconfig.json` (checkJs enabled).
- **ES modules everywhere.** Both frontend and API use `import`/`export`.
- **No ORM.** Direct Supabase client calls. Use `supabaseAdmin` (service role) in API middleware, `supabase` (anon key) for RLS-respecting queries.
- **shadcn-svelte components** live in `src/lib/components/ui/` — don't edit them directly. Use `npx shadcn-svelte add <component>` to add new ones.
- **Svelte 5 runes.** Use `$state()`, `$derived()`, `$props()`, `$effect()`. No legacy `let` reactivity.

## Auth & Security

**Architecture:** Full 2FA with trusted device management — designed in from the start, shipped incrementally.

**Day 1 (MVP):**
1. User enters email + password → `supabase.auth.signInWithPassword()`
2. On success → redirect to `/dashboard`
3. Domain restriction: @lemedspa.com emails only (enforced at signup/invite)

**Phase 2 (ship shortly after):**
4. Check for trusted device token (cookie → API verification)
5. If not trusted → OTP challenge via email (Resend)
6. On success → set trust device cookie, redirect to `/dashboard`

**Full security (built into architecture, enable when ready):**
- Geo/IP restrictions for staff (middleware exists, needs wiring)
- Business hours access control (middleware exists, needs wiring)
- Audit logging on all API actions (table exists, fire-and-forget)
- HIPAA-ready safeguards (formal BAA in Phase 5)

**Key principle:** Security infrastructure is in the codebase from day 1. Features get enabled progressively — don't let 2FA block shipping call logging.

## Environment Variables

**API (.env):**
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- `RESEND_API_KEY`
- `PORT` (default 3001), `FRONTEND_URL`

**SvelteKit (PUBLIC_ prefix for client):**
- `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`
- `PUBLIC_API_URL`

## Running Locally

```bash
# Frontend (from root)
npm run dev          # localhost:5173

# API (from api/)
npm run dev          # localhost:3001 (uses --watch)
```

## Deploying

**Frontend (Cloudflare Pages):**
```bash
# IMPORTANT: Must set PUBLIC_API_URL for production build
# SvelteKit bakes $env/static/public vars at BUILD TIME, not runtime
PUBLIC_API_URL=https://lm-app-api.onrender.com npx vite build
npx wrangler pages deploy .svelte-kit/cloudflare --project-name lm-app --branch main --commit-dirty=true
```

**API (Render):** Auto-deploys on push to `main`. Redeploys take ~2-3 minutes.

**CRITICAL:** The `.env` file has `PUBLIC_API_URL=http://localhost:3001` for local dev. When building for production, you MUST override it with the Render URL or the deployed site will try to reach localhost and fail silently with "failed to fetch" errors.

## Testing & Verification

**Always verify changes before telling the user they're done.** After making frontend or API changes:

1. **Build check:** Run `npx vite build` — confirm no errors
2. **If deploying to CF Pages:** Verify the deployed bundle contains the correct API URL (not localhost)
3. **CORS check:** After API changes, verify with: `curl -s -D - -H "Origin: https://lm-app.pages.dev" https://lm-app-api.onrender.com/api/health | grep access-control-allow-origin`
4. **API health check:** `curl -s https://lm-app-api.onrender.com/api/health` — should return `{"status":"ok"}`
5. **After Render redeploy:** Wait ~2-3 min, then re-verify CORS and health

**Production URLs:**
- Frontend: https://lm-app.pages.dev
- API: https://lm-app-api.onrender.com
- Supabase: https://skvsjcckissnyxcafwyr.supabase.co

**Prefer testing on the hosted site** (lm-app.pages.dev) over localhost. Localhost is only for active code changes with hot-reload.

## Database

- Schema: `api/db/schema.sql` — paste into Supabase SQL Editor
- Seed: `supabase/seed.sql` — run after schema
- All tables have RLS enabled. Middleware uses `supabaseAdmin` to bypass when needed.

## TextMe Notifications

SMS notifications are configured **globally** — see workspace `lmdev/CLAUDE.md` for full details.
The Stop hook fires for ALL projects, not just lm-app.
Script: `C:/Users/LMOperations/.claude/scripts/textme.mjs`

## Requirements Capture

When implementing features or design changes based on user instructions, **always update the relevant requirement file** in `docs/requirements/`. See `docs/requirements/README.md` for the format.

Key rule: Capture the **user's exact words** in the "User's Original Words" section so requirements can be traced back to the original instruction.

Files: `calls.md`, `messages.md`, `contacts.md`, `dashboard.md`, `softphone.md`, `ivr-flow.md`

## Important Notes

- Webhook routes (`/api/webhooks/*`) are mounted BEFORE `express.json()` because Twilio sends URL-encoded data.
- Keep-alive ping runs every 14 min in production to prevent Render free tier spin-down.
- The `audit_log` table captures all API actions (fire-and-forget, doesn't block responses).
