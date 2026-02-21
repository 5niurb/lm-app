# CLAUDE.md — lm-app

## Session Management

### Starting a Session
- Read `SESSION_NOTES.md` first to restore context from previous sessions.
- Briefly confirm what you understand the current state to be before diving in.

### During a Session
- After completing each major task or milestone, append an update to `SESSION_NOTES.md`.
- Every ~15 minutes of active work, checkpoint progress to `SESSION_NOTES.md`.
- After implementing any new feature, design change, or component, update `SPECS.md` with the requirement, acceptance criteria, and any design decisions made. (Use `/capture-specs` to batch-update at session end if preferred.)
- If the conversation is getting long (50+ exchanges), proactively write a summary and suggest starting a fresh session.

### Ending a Session
- Always write a final summary to `SESSION_NOTES.md` before the session ends, including:
  - What was accomplished
  - Current state and what's working
  - Known issues or bugs
  - Recommended next steps
  - Dev server port and access URLs if running
  - A simple ASCII diagram illustrating the key changes (data flow, architecture, UI layout)

#### ASCII Diagrams in Session Notes
After each session's accomplishments, include a simple ASCII diagram illustrating the key changes. Keeps session notes scannable and helps restore context quickly. Under 15 lines, focused on data flow or architecture — not implementation details.

---

## What This Is

Custom management platform for Le Med Spa. Replaces HighLevel, TextMagic, and (eventually) Aesthetic Record. Handles call logging, voicemail, 2-way SMS messaging, CRM/contacts, softphone, services catalog, and automation sequences.

## Design Direction

All Le Med Spa properties use the **dark + gold** aesthetic:
- **Background:** Dark (#0a0a0c)
- **Accents:** Gold (#d4af37, #c5a24d)
- **Typography:** Playfair Display (headings) + Inter (body)
- **Style:** Luxurious, intimate, high-end

The lm-app dashboard should follow this same design language where possible — dark sidebar, gold accents, clean typography. shadcn-svelte components can be themed to match.

### Design References — Copy From the Best

When building new pages or components, **study industry-leading med spa / salon / CRM platforms first** before designing from scratch. Use Firecrawl, Playwright screenshots, or web search to pull real UI patterns from these apps:

| App | Strength | Use For |
|-----|----------|---------|
| **Mangomint** | Clean modern salon SaaS, beautiful dashboard | Dashboard layout, appointment views, nav patterns |
| **Boulevard (joinblvd.com)** | Premium med spa platform, elegant UI | Client profiles, booking flows, service catalog |
| **Pabau** | Med spa clinic management, clinical workflows | Consent forms, treatment records, automation |
| **Podium** | Messaging + reviews platform | Inbox/conversation UI, notification patterns |
| **Salesforce** | CRM gold standard | Contact management, pipeline views, settings |

**Workflow for new UI:**
1. Screenshot or scrape 2-3 reference apps for the feature being built
2. Identify the best patterns (layout, information hierarchy, interactions)
3. Adapt to our dark+gold theme and shadcn-svelte components
4. Build — don't reinvent what industry leaders have already perfected

**Goal:** The app should feel like Mangomint's polish with Boulevard's elegance, in our brand's dark+gold aesthetic. When in doubt about a design decision, look at what these apps do before asking the user.

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
PUBLIC_API_URL=https://api.lemedspa.app npx vite build
npx wrangler pages deploy .svelte-kit/cloudflare --project-name lm-app --branch main --commit-dirty=true
```

**API (Render):** Auto-deploys on push to `main`. Redeploys take ~2-3 minutes.

**CRITICAL:** The `.env` file has `PUBLIC_API_URL=http://localhost:3001` for local dev. When building for production, you MUST override it with the Render URL or the deployed site will try to reach localhost and fail silently with "failed to fetch" errors.

**IVR / Twilio Studio Flows (test → prod):**

Two flows, each permanently wired to its own phone number:
- **Test:** `FW9d3adadbd331019576b71c0a586fc491` — test phone number
- **Prod:** `FW839cc419ccdd08f5199da5606f463f87` — main number (+18184633772)

Workflow (like a branch → PR → merge):
1. Edit `twilio/flows/main-ivr.json`
2. Deploy to **test flow only**: `node twilio/deploy.js FW9d3adadbd331019576b71c0a586fc491 twilio/flows/main-ivr.json --publish`
3. Tell the user to call the test number and verify
4. **Wait for explicit user approval** before touching prod
5. On approval, deploy to **prod flow**: `node twilio/deploy.js FW839cc419ccdd08f5199da5606f463f87 twilio/flows/main-ivr.json --publish`

**Rules:**
- NEVER deploy directly to the prod flow without user approval
- NEVER deploy to both flows simultaneously
- Always deploy to test first, even for "small" changes
- After prod deploy, confirm the revision number to the user

## Testing & Verification

**Always verify changes before telling the user they're done.** After making frontend or API changes:

1. **Build check:** Run `npx vite build` — confirm no errors
2. **If deploying to CF Pages:** Verify the deployed bundle contains the correct API URL (not localhost)
3. **CORS check:** After API changes, verify with: `curl -s -D - -H "Origin: https://lemedspa.app" https://api.lemedspa.app/api/health | grep access-control-allow-origin`
4. **API health check:** `curl -s https://api.lemedspa.app/api/health` — should return `{"status":"ok"}`
5. **After Render redeploy:** Wait ~2-3 min, then re-verify CORS and health

**Production URLs:**
- Frontend: https://lemedspa.app
- API: https://api.lemedspa.app
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

## Autonomous Problem-Solving

**Resolve issues yourself before asking the user.** The goal is near-full automation — the user provides guidance and tweaks, not manual steps.

### Escalation Order (follow this every time)
1. **Use MCP tools first** — Supabase MCP for DB/keys, Firecrawl for web content, Chrome DevTools for debugging, Context7 for docs. These can answer most questions without user input.
2. **Search the codebase** — Grep, Glob, Read. The answer is often already in .env files, config, SESSION_NOTES, or SPECS.md.
3. **Search the web** — WebSearch, WebFetch for docs, Stack Overflow, GitHub issues.
4. **Try it and see** — Run the command, make the API call, deploy and check. Errors are informative.
5. **Only then ask the user** — And when you do, present the options you've already researched with a recommendation.

### Common Self-Service Patterns
| Need | Do This | Don't Do This |
|------|---------|---------------|
| Supabase anon key | `get_publishable_keys` MCP tool | Ask user to look it up |
| API not responding | Check Render logs, try curl, check if sleeping | Ask user to check Render |
| Package version issue | Check Node/npm versions, read lockfile, search for compatibility | Ask user what version to use |
| Design decision | Screenshot reference apps (Mangomint, Boulevard, etc.) | Ask user "what should it look like?" |
| Missing env var in CI | Hardcode public values, use MCP for keys | Ask user to add GitHub secrets |
| Build failing | Read the error, check recent changes, fix it | Report the error and wait |
| Unclear requirement | Check SPECS.md, docs/requirements/, SESSION_NOTES | Ask user to re-explain |

### Proactive Execution Policy

**Do it, don't ask.** When a task has operational steps (migrations, deployments, config changes), execute them immediately as part of the task. The user wants to be *informed* of what was done, not asked to do it themselves.

| Action | Do Proactively | Inform User |
|--------|---------------|-------------|
| DB migrations (DDL/DML) | Run via `/migrate` skill or Supabase MCP | State what was applied |
| Frontend deploys | Run via `/deploy` skill | Share deployed URL |
| API config changes | Apply directly | Note what changed |
| Package installs | Run `npm install` | List what was added |
| Seed data / test data | Insert via SQL | Describe what was seeded |
| Build verification | Run `npx vite build` | Report pass/fail |
| Git commits & pushes | Run via `/commit` skill | Share commit hash |

**The user reviews results, not steps.** Present completed work, not TODO lists of manual actions.

### When to Actually Ask the User
- **Business decisions** — pricing, feature priority, what to build next
- **Credentials/secrets** — actual secret keys (service role, API secrets), never public keys
- **Destructive actions** — deleting data, changing production config, domain changes
- **Ambiguous intent** — when two valid approaches exist and the choice affects UX or architecture

## Important Notes

- Webhook routes (`/api/webhooks/*`) are mounted BEFORE `express.json()` because Twilio sends URL-encoded data.
- Keep-alive ping runs every 14 min in production to prevent Render free tier spin-down.
- The `audit_log` table captures all API actions (fire-and-forget, doesn't block responses).
