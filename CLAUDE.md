# CLAUDE.md — lm-app

## What This Is

Custom management platform for Le Med Spa. Handles call logging, voicemail, and (eventually) scheduling, POS, CRM, and messaging.

## Day 1 Priority

**Ship call logging + voicemail ASAP to shut down HighLevel.** This is Phase 1A and the #1 priority. Everything else (booking, POS, CRM, messaging) comes after.

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
        dashboard/
        calls/
        settings/
    lib/
      components/ui/      — shadcn-svelte components (auto-generated, don't edit)
      components/         — App components (AppSidebar, AppHeader)
      stores/             — Svelte stores (auth)
      api/                — API client wrapper
      utils/              — Supabase client, formatters
  api/                    — Express backend
    server.js             — Entry point
    routes/               — Route handlers
    middleware/            — Auth, business hours, geo, audit
    services/             — Supabase, Twilio, Resend clients
    db/schema.sql         — Database schema
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

## Database

- Schema: `api/db/schema.sql` — paste into Supabase SQL Editor
- Seed: `supabase/seed.sql` — run after schema
- All tables have RLS enabled. Middleware uses `supabaseAdmin` to bypass when needed.

## Important Notes

- Webhook routes (`/api/webhooks/*`) are mounted BEFORE `express.json()` because Twilio sends URL-encoded data.
- Keep-alive ping runs every 14 min in production to prevent Render free tier spin-down.
- The `audit_log` table captures all API actions (fire-and-forget, doesn't block responses).
