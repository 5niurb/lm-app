# Working with Claude Code: A Practical Guide for Building LM App

> This guide explains how to effectively work with Claude Code (me) to build your custom med spa platform. It covers CLAUDE.md strategy, project setup, communicating design preferences, and what to expect at each stage.

---

## 1. What is CLAUDE.md and Why It Matters

`CLAUDE.md` is a file I read at the start of every conversation. It's my "memory" between sessions. Without it, each new conversation starts from scratch -- I don't know your tech stack, conventions, project structure, or preferences.

### What belongs in CLAUDE.md

Think of it as the briefing document you'd give a new developer on day one:

**YES, put these in CLAUDE.md:**
- Project descriptions (what each folder/repo is)
- Tech stack decisions (frameworks, databases, hosting)
- Coding conventions (naming, style, patterns to follow)
- Environment info (env vars, deployment targets, domains)
- API keys/services in use (names only, never actual secrets)
- Integration details (which services talk to which)
- Design system rules (once established)
- Links to reference designs (your "build it like this" URLs)
- Things I keep getting wrong that you want me to remember

**NO, don't put these in CLAUDE.md:**
- Actual secrets, passwords, API keys
- Long research documents (that's what `lm-webapp.research.md` is for)
- Detailed implementation plans (those go in separate files)
- Full database schemas (reference the file instead: "see `schema.sql`")

### How CLAUDE.md Should Evolve

Your current CLAUDE.md covers the existing projects. When we start the new app, we'll add a section like this:

```markdown
### lm-app/
- **What:** Full med spa management platform (calls, voicemail, SMS, booking, CRM, POS, inventory, EMR)
- **Tech:** SvelteKit frontend, Express API, Supabase (PostgreSQL), Twilio (voice+SMS+conversations)
- **Frontend hosting:** Cloudflare Pages
- **Backend hosting:** Render.com
- **Database:** Supabase PostgreSQL (same org as timetracker, separate project)
- **Key integrations:** Twilio (voice+SMS+WhatsApp), Stripe (payments+Terminal POS), Cal.com (booking), Resend (email)
- **Design reference:** [URLs you provide]
- **UI framework:** shadcn-svelte + Tailwind CSS
- **Design tokens:** See `lm-app/src/lib/styles/tokens.css`
- **Env vars:** TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, SUPABASE_URL, SUPABASE_ANON_KEY, RESEND_API_KEY, STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY
- **Research docs:** lm-webapp.research.md, lm-pos-inventory.research.md
```

I'll suggest updates to CLAUDE.md as we make decisions. You approve before I write them.

---

## 2. How to Communicate Design & UI/UX Preferences

### Method 1: Reference URLs (Best Starting Point)

**Yes, just give me URLs to sites you like.** This is the most effective way. Here's how to do it well:

Instead of just "make it look like mangomint.com", be specific:

```
Design references:
- mangomint.com - I like the clean dashboard layout, the sidebar nav, the card-based design
- boulevard.io/booking - I like how their online booking flow looks for clients
- glossgenius.com - I like their mobile experience and how the client portal feels
- stripe.com/dashboard - I like how clean and data-dense their tables are

What I DON'T like:
- Mindbody's cluttered UI
- Vagaro's dated design
- Anything that looks "template-y" or generic
```

I'll visit those URLs, analyze the design patterns, and extract what matters: layout structure, color philosophy, typography choices, spacing systems, component patterns.

### Method 2: Screenshots (Most Precise)

Take screenshots of specific UI elements you like and save them in the project:

```
lm-app/
  design-refs/
    dashboard-layout-mangomint.png
    booking-flow-boulevard.png
    mobile-nav-glossgenius.png
    color-palette-inspo.png
```

I can read image files. Point me to them and say "the sidebar should look like this" or "the card design in this screenshot."

### Method 3: Brand Guidelines Document

If you have existing brand assets (you have `Branding Photo Shoot Photos` and business cards), tell me:

```
Brand guidelines:
- Primary color: [hex code from your logo/cards]
- Font: [what's on lemedspa.com]
- Tone: Luxury, private, clinical confidence
- Logo: see LMbizcards/ and lemedspa-website/
```

I'll extract colors and fonts from your existing site and cards to ensure consistency.

### Method 4: Design Tokens File (We'll Create This Together)

Once you give me references, I'll create a design tokens file that codifies your preferences:

```css
/* lm-app/src/lib/styles/tokens.css */
:root {
  --color-primary: #2C3E50;
  --color-accent: #D4AF37;
  --font-heading: 'Cormorant Garamond', serif;
  --font-body: 'Inter', sans-serif;
  --radius-card: 12px;
  --spacing-page: 24px;
  /* etc. */
}
```

This becomes the source of truth. Every component references these tokens. Want to change the accent color? Change one line, everything updates.

### What I Need From You

At minimum, before we start building UI:
1. **2-3 reference URLs** with notes on what you like about each
2. **Your brand colors** (I can pull these from your existing site if you're not sure)
3. **Light mode, dark mode, or both?**
4. **"Luxury minimal" vs "friendly approachable" vs "clinical professional"** -- which end of the spectrum?

---

## 3. Project Structure & How We'll Build

### Recommended Monorepo Structure

```
lm-app/
  ├── CLAUDE.md              (project-specific instructions, in addition to root CLAUDE.md)
  ├── package.json
  ├── svelte.config.js
  ├── tailwind.config.js
  ├── src/
  │   ├── routes/             (SvelteKit pages)
  │   │   ├── (auth)/         (pages requiring login)
  │   │   │   ├── dashboard/
  │   │   │   ├── calls/      (call log, voicemail)
  │   │   │   ├── inbox/      (SMS conversations)
  │   │   │   ├── clients/    (CRM)
  │   │   │   ├── calendar/   (bookings)
  │   │   │   ├── pos/        (POS checkout, barcode scanning)
  │   │   │   ├── inventory/  (stock management, purchase orders)
  │   │   │   ├── clinical/   (SOAP notes, charting -- Phase 5)
  │   │   │   └── settings/
  │   │   ├── (public)/       (no auth needed)
  │   │   │   ├── book/       (client-facing booking)
  │   │   │   └── portal/     (client self-service)
  │   │   └── +layout.svelte
  │   ├── lib/
  │   │   ├── components/     (reusable UI components)
  │   │   │   ├── ui/         (shadcn-svelte components)
  │   │   │   ├── calls/      (call-specific components)
  │   │   │   ├── inbox/      (messaging components)
  │   │   │   ├── clients/    (CRM components)
  │   │   │   ├── pos/        (POS components: cart, checkout, scanner)
  │   │   │   └── clinical/   (SOAP notes, body maps -- Phase 5)
  │   │   ├── stores/         (Svelte stores for state)
  │   │   ├── api/            (API client functions)
  │   │   ├── styles/         (design tokens, global styles)
  │   │   └── utils/          (helpers, formatters)
  │   └── app.html
  ├── api/                    (Express backend -- or separate repo)
  │   ├── server.js
  │   ├── routes/
  │   │   ├── webhooks/       (Twilio, Stripe, Cal.com webhooks)
  │   │   ├── calls.js
  │   │   ├── voicemails.js
  │   │   ├── conversations.js
  │   │   ├── clients.js
  │   │   ├── bookings.js
  │   │   ├── pos.js          (checkout, cart, Stripe Terminal)
  │   │   ├── inventory.js    (products, stock, POs)
  │   │   └── clinical.js     (SOAP notes, consents -- Phase 5)
  │   ├── services/           (business logic)
  │   │   ├── twilio.js       (voice + SMS + conversations)
  │   │   ├── stripe.js       (payments + Terminal POS)
  │   │   ├── ai.js           (GPT/Claude integrations)
  │   │   └── resend.js
  │   └── db/
  │       └── schema.sql      (full Supabase schema)
  └── supabase/
      ├── migrations/         (schema changes over time)
      └── seed.sql            (test data)
```

### Monorepo vs Separate Repos

**Recommendation: Start monorepo, split later if needed.** Having frontend + API in one repo makes it easier for me to work on features that touch both (which is most features). We can split into separate repos later if deployment requires it.

---

## 4. How Our Build Sessions Will Work

### Session Flow

A typical build session looks like this:

1. **You tell me what to work on**: "Let's build the call log page" or "Add voicemail playback to the dashboard"
2. **I read the relevant code**: I'll look at existing files, the schema, the API routes
3. **I explain my approach**: "I'm going to create a Svelte component that fetches from /api/calls, displays them in a sortable table, and uses Supabase Realtime to show new calls live"
4. **You approve or redirect**: "Sounds good" or "Actually, I want it more like [this screenshot]"
5. **I write the code**: Creating/editing files, explaining what I'm doing
6. **I test if possible**: Running the dev server, checking for errors
7. **We iterate**: You review, I adjust

### What to Say to Get the Best Results

**Good prompts:**
- "Build the voicemail inbox page. Show unheard count in the sidebar badge. Each voicemail should show caller number, time, duration, and have a play button. Let me mark them as listened."
- "Here's a screenshot of how I want the call log to look [screenshot]. Build it like this but use our brand colors."
- "The SMS inbox should work like iMessage -- conversation list on the left, messages on the right. New messages should appear in real-time."

**Less helpful prompts:**
- "Build the call page" (which call page? what should it show?)
- "Make it look nice" (nice how? luxury? modern? colorful?)
- "Do the SMS thing" (sending? receiving? inbox? auto-reply? all of it?)

### When I Should Ask vs When I Should Decide

I'll ask you about:
- Visual design choices (layout, colors, what to show)
- Business logic ("should voicemails auto-delete after 90 days?")
- Third-party service choices (when they come up)
- Anything that costs money

I'll decide on my own:
- Code structure and file organization
- Which npm packages to use for utilities
- Database index strategy
- Error handling patterns
- API route naming

---

## 5. Skills and Agents You Should Know About

### What Are Skills?

Skills are commands you can invoke with `/` that trigger specific workflows. For example:
- `/commit` -- I'll review changes and create a git commit with a good message
- `/review-pr` -- I'll review a pull request

### What Are Agents?

When I need to do something complex, I can spin up specialized sub-agents that work in parallel. You've already seen this -- when I researched the tech stack, I launched 5 research agents simultaneously. You don't need to configure these; I use them automatically.

### Custom Project Skills (We Could Build These)

As the project matures, we could create custom slash commands for common workflows. These would be defined in a `.claude/` config directory:

**Potential custom skills:**
- `/deploy` -- Run build, check for errors, deploy to Cloudflare Pages + Render
- `/db-migrate` -- Generate and apply a Supabase migration
- `/add-route` -- Scaffold a new API route + Svelte page + types

These are optional and we'd build them only if you find yourself repeating the same multi-step processes.

---

## 6. Environment Setup (What We'll Do First)

Before writing any app code, we need to set up the development environment. Here's what that looks like:

### Step 1: Initialize the Project

```bash
# I'll run these commands (with your approval)
mkdir lm-app
cd lm-app
npm create svelte@latest .    # SvelteKit scaffolding
npm install                    # dependencies
npx svelte-add@latest tailwindcss  # add Tailwind
```

### Step 2: Set Up Supabase

- Create a new Supabase project (you do this in the dashboard -- I can't access your account)
- You give me the project URL and anon key
- I create the database schema (all the tables from the research doc)

### Step 3: Set Up Twilio (Direct)

- You already have Twilio (through HighLevel). We need your own direct Twilio account.
- Create a Twilio account at twilio.com if you don't have a direct one (you do this)
- Port your business number from HighLevel to your Twilio account (or buy a new one to test with first)
- You give me the Account SID and Auth Token
- I configure the webhook URLs on your Twilio number to point to our Express API
- We test with a real phone call

### Step 4: Local Development

- I'll set up a `.env.example` file (no real secrets, just the variable names)
- You create `.env` locally with your actual keys
- We run the dev server and start building

---

## 7. Local Workspace & GitHub Repo Structure

> Goal: Organize everything so you can work from your phone, other computers, or this PC — and Claude Code has clean project boundaries on any machine.

### Current State of `lmdev/`

```
C:\Users\LMOperations\lmdev\          ← your local workspace (NOT a git repo)
├── CLAUDE.md                          ← root project instructions
├── lm-webapp.research.md             ← platform research (this doc)
├── lm-webapp.guide.md                ← this guide
├── lm-pos-inventory.research.md      ← POS research
├── lemedspa-website/                  ← current site (NOT a git repo)
├── timetracker/                       ← payroll app (IS a git repo → github.com/5niurb/timetracker)
├── LMmenu/                            ← treatment menu PDFs + device logos
├── LMbizcards/                        ← business card assets
├── Branding Photo Shoot Photos/       ← ~400MB of high-res photos (Lea, space, devices)
│   └── Edited Photos/                 ← treatment device action shots
├── design-refs/                       ← design reference files (empty)
└── .claude/                           ← Claude Code workspace state
```

**Problems with current setup:**
- `lemedspa-website/` has no version control — changes can be lost
- Research docs are loose files not tracked anywhere
- Photo assets are huge (~400MB) and shouldn't be in git
- No way to work from phone or other computers on code
- No separation between "code" and "non-code" assets

### Recommended GitHub Repo Structure

Create **3 repos** under the `5niurb` GitHub account (where `timetracker` already lives):

| Repo | What | Why Separate |
|---|---|---|
| `5niurb/lemedspa-website` | Marketing site (Phase 1B redesign) | Deploys to Netlify via git. Vanilla HTML/CSS/JS. |
| `5niurb/lm-app` | Platform app (Phase 1A, 1C, 2, 3, 4, 5) | SvelteKit + Express. Deploys frontend to Cloudflare Pages, API to Render. |
| `5niurb/lm-docs` | Research docs, guides, planning | Keep research/planning separate from code. Accessible from phone via GitHub mobile. |

The existing `5niurb/timetracker` stays as-is.

### Repo 1: `lemedspa-website` (Marketing Site)

```
lemedspa-website/
├── .github/
│   └── workflows/             (future: Lighthouse CI, broken link checks)
├── index.html                 (landing page — scroll narrative)
├── services.html              (service catalog with accordion)
├── services/                  (individual service pages)
│   ├── neuromodulators.html
│   ├── dermal-fillers.html
│   ├── skin-refinement.html
│   ├── iv-therapy.html
│   ├── hormones.html
│   ├── body-contouring.html
│   └── signature-protocol.html
├── care/                      (pre/post-treatment instruction pages — Phase 1C link targets)
│   ├── botox-pre.html
│   ├── botox-post.html
│   ├── filler-pre.html
│   ├── filler-post.html
│   └── ...                    (one pre + one post per service)
├── skincare.html              (product catalog)
├── testimonials.html          (social proof hub)
├── insights/                  (blog — can be static HTML or future headless CMS)
│   └── index.html
├── contact.html
├── css/
│   ├── main.css               (design tokens, global styles)
│   ├── landing.css            (landing page-specific)
│   └── services.css           (service pages)
├── js/
│   ├── main.js                (nav, scroll effects, accordion)
│   └── testimonials.js        (review feed, IG embed)
├── img/                       (web-optimized images — NOT the raw photo shoot files)
│   ├── hero/                  (full-bleed hero images, compressed)
│   ├── team/                  (Lea headshot, practitioner photos, compressed)
│   ├── space/                 (treatment rooms, coffee bar, compressed)
│   ├── devices/               (Sofwave, Sylfirm, etc., compressed)
│   ├── products/              (product wall, skincare, compressed)
│   └── logos/                 (vendor logo cloud PNGs)
├── video/                     (ambient video clips, compressed for web)
├── netlify.toml               (deploy config, headers, redirects, forms)
├── _redirects                 (Netlify redirects)
├── robots.txt
├── sitemap.xml
├── CLAUDE.md                  (project-specific Claude instructions)
├── .gitignore
└── README.md
```

**`.gitignore` for this repo:**
```
# OS files
.DS_Store
Thumbs.db

# Editor
.vscode/
.idea/

# Raw photos (too large for git — keep locally, optimize for /img/)
*.psd
*.ai
raw/

# Environment
.env
```

**Netlify deploy**: Connect this repo to Netlify → auto-deploys on push to `main`. Free tier.

### Repo 2: `lm-app` (Platform Application)

This is the SvelteKit monorepo already detailed in §3 above. No changes needed — it stays as designed.

```
lm-app/
├── CLAUDE.md
├── package.json
├── svelte.config.js
├── src/                       (SvelteKit frontend)
│   ├── routes/
│   ├── lib/
│   └── app.html
├── api/                       (Express backend)
│   ├── server.js
│   ├── routes/
│   ├── services/
│   └── db/
├── supabase/
│   ├── migrations/
│   └── seed.sql
├── .env.example
├── .gitignore
└── README.md
```

### Repo 3: `lm-docs` (Research & Planning)

```
lm-docs/
├── research/
│   ├── lm-webapp.research.md          (main platform research)
│   ├── lm-pos-inventory.research.md   (POS deep-dive)
│   └── future-research-docs...
├── guides/
│   ├── lm-webapp.guide.md             (Claude Code guide — this file)
│   └── future-guides...
├── brand/
│   ├── color-palette.md               (design tokens, hex codes, font choices)
│   ├── voice-and-tone.md              (brand voice guide — the 5 principles)
│   └── inspiration-sites.md           (screenshots, notes on Matt Morris Wines, Aesop, etc.)
├── CLAUDE.md                          (doc-specific instructions: "this is research, not code")
├── .gitignore
└── README.md
```

**Why a separate docs repo?**
- Research docs are ~200KB+ of markdown — they clutter code repos
- You can read/edit these from GitHub Mobile on your phone
- Claude Code can reference them via the root CLAUDE.md pointer
- No deploy pipeline, no CI, just markdown files

### What Stays Local (NOT in git)

These folders contain large binary assets that should NOT go in any git repo:

| Folder | Size | Why Not Git |
|---|---|---|
| `Branding Photo Shoot Photos/` | ~400MB | Raw high-res photos. Select + compress best ones → `lemedspa-website/img/` |
| `LMmenu/` | ~5MB | PDFs + logos. Reference locally. Copy logos → `lemedspa-website/img/logos/` |
| `LMbizcards/` | ~6MB | Business card PDFs. Not needed in any repo. |

**For photo assets across devices:** Use a cloud sync folder (OneDrive, Google Drive, Dropbox) to access raw photos from any device. Only web-optimized versions go in git.

### Updated Local Workspace Structure (After Reorganization)

```
C:\Users\LMOperations\lmdev\
├── CLAUDE.md                          ← root instructions (points to all repos + docs)
├── lemedspa-website/                  ← git repo → github.com/5niurb/lemedspa-website
├── lm-app/                            ← git repo → github.com/5niurb/lm-app
├── lm-docs/                           ← git repo → github.com/5niurb/lm-docs
├── timetracker/                       ← git repo → github.com/5niurb/timetracker (existing)
├── assets/                            ← local only, NOT in git (renamed for clarity)
│   ├── photos/                        ← Branding Photo Shoot Photos (renamed)
│   │   └── edited/
│   ├── menus/                         ← LMmenu (renamed)
│   ├── bizcards/                      ← LMbizcards (renamed)
│   └── design-refs/                   ← screenshots, inspiration saves
└── .claude/                           ← Claude Code workspace state
```

### Working From Phone & Other Computers

| Task | How |
|---|---|
| **Read/edit research docs** | GitHub Mobile app → `lm-docs` repo. Edit markdown directly in browser/app. |
| **Review website changes** | GitHub Mobile → `lemedspa-website` repo. Netlify deploy previews on every PR. |
| **Quick code review** | GitHub Mobile → `lm-app` repo. PR reviews, code browsing. |
| **Edit code from another PC** | Clone repos (`git clone github.com/5niurb/lm-app`), run `npm install`, open in VS Code or Claude Code. |
| **Edit code from phone** | GitHub.dev (tap `.` on any repo in mobile browser) → web-based VS Code editor. |
| **Access raw photos** | OneDrive/Google Drive sync (not git). |
| **Claude Code on another PC** | Install Claude Code, clone repos, the CLAUDE.md files provide full context. |

### Setup Commands (When Ready)

```bash
# From C:\Users\LMOperations\lmdev\

# 1. Initialize lemedspa-website as a git repo
cd lemedspa-website
git init
git add .
git commit -m "Initial commit: current site before Phase 1B redesign"
# Create repo on GitHub, then:
git remote add origin https://github.com/5niurb/lemedspa-website.git
git push -u origin main

# 2. Create lm-docs repo
cd ..
mkdir lm-docs && cd lm-docs
mkdir research guides brand
git init
# Move research docs into repo:
cp ../lm-webapp.research.md research/
cp ../lm-pos-inventory.research.md research/
cp ../lm-webapp.guide.md guides/
git add .
git commit -m "Initial commit: research docs and guides"
git remote add origin https://github.com/5niurb/lm-docs.git
git push -u origin main

# 3. lm-app will be created fresh when we start Phase 1A
# (SvelteKit scaffolding via npm create svelte@latest)
```

---

## 8. How to Handle Design References Practically

### The Process

1. **Before we start UI work**, create a folder:
   ```
   lm-app/design-refs/
   ```

2. **Save screenshots** of things you like. Name them descriptively:
   ```
   design-refs/
     sidebar-nav-mangomint.png
     call-log-table-style.png
     mobile-bottom-nav.png
     color-palette.png
     voicemail-player-inspo.png
   ```

3. **Add reference URLs to CLAUDE.md** (or a separate design-refs.md):
   ```markdown
   ## Design References
   - Dashboard layout: mangomint.com (after login)
   - Booking flow: boulevard.io/demo
   - Mobile experience: glossgenius.com
   - Data tables: stripe.com/docs/dashboard

   ## Brand Direction
   - Luxury, clean, confident
   - Muted color palette with gold accents
   - Generous whitespace
   - Serif headings, sans-serif body
   ```

4. **I'll reference these** when building every page. If I drift from the intended look, just say "look at the mangomint screenshot again" and I'll course-correct.

### What If You Don't Have Design References Yet?

That's fine. We can:
1. Start with shadcn-svelte defaults (clean, minimal, professional)
2. Pull your brand colors from lemedspa.com
3. Build a quick style guide page first (colors, typography, buttons, cards)
4. Iterate from there

---

## 9. What to Update in CLAUDE.md Now

Based on everything we've discussed, here's what I'd add to your root CLAUDE.md when we're ready to start building. I'll propose the exact text and you approve before I write it.

The key additions will be:
- New `lm-app/` project section with tech stack details
- Current services being replaced (HighLevel, TextMagic, Aesthetic Record eventually)
- Services being kept permanently (M365, Google Workspace, Resend)
- Design reference URLs (once you provide them)
- New coding conventions for the SvelteKit frontend
- Integration details (Twilio, Stripe, Cal.com, etc.)
- POS hardware setup (barcode scanner, Stripe Terminal)
- EMR phasing notes (Phase 5, requires Supabase Teams for HIPAA)

---

## 10. Recommended First Steps

Here's what I suggest we do, in order:

### Decisions Made

- **Frontend framework**: SvelteKit -- DECIDED
- **CPaaS provider**: Twilio (direct, no HighLevel) -- DECIDED

### Before We Start Building (You Need To Do)
1. **Gather 2-3 design reference URLs** with notes on what you like about each
2. **Set up a direct Twilio account** (or confirm you already have one separate from HighLevel)
3. **Confirm your Supabase org** -- will we create a new project alongside the timetracker, or use the same one?

### Next Session: Project Scaffolding
1. Initialize the SvelteKit project (`lm-app/`)
2. Set up Tailwind + shadcn-svelte
3. Create the Express API skeleton
4. Set up Supabase schema (call_logs, voicemails, phone_extensions, clients)
5. Update CLAUDE.md with the new project
6. Initialize git repo

### Following Session: Call Logging MVP (Phase 1A)
1. Connect Twilio Voice webhooks to Express (TwiML responses)
2. Build call routing logic (business hours, extensions, ring groups)
3. Build voicemail recording + storage flow
4. Build the call log dashboard page (SvelteKit)
5. Build voicemail playback with audio player
6. Test with real phone calls (buy a test number first)

### Website Redesign (Phase 1B — ~3 weeks)

Complete redesign of lemedspa.com. Narrative-driven, minimalist, scroll-based storytelling. See lm-webapp.research.md Phase 1B for full creative brief.

**Design inspirations**: Matt Morris Wines (scroll storytelling, candid photography), Valeria Monis (simplicity, whitespace), Aesop (warm tones, elegance, video backgrounds), Pure Cosmetics (vivid product photography, decisive CTAs).

**Week 1: Foundation + Landing Page**
1. New color palette: move from dark (#0a0a0a) to warm/sophisticated (cream/ivory, dark text, gold/bronze accents)
2. Typography: elegant serif headings + clean sans-serif body (replace Cormorant Garamond + Montserrat)
3. Build landing page with scroll-based narrative sections:
   - Hero: full-bleed cinematic image or ambient video, minimal text, no nav clutter
   - Who We Are: brand ethos, candid photo of Lea Culver
   - What Makes Us Different: scroll-reveal cards with polaroid-style candid photos
   - The Space: gallery/video of treatment rooms, coffee bar, product wall
   - Social Proof: curated IG posts, Yelp + Google review highlights, star ratings
   - Services Preview: 3-4 hero services with imagery
   - Vendor Logo Cloud: all brand/device logos we carry
   - CTA: "Ready to join the family?" + Book Consultation

**Week 2: Inner Pages**
4. /services: single page, all services with accordion "+" reveal, links to dedicated sub-pages
5. /services/[service]: individual service deep-dive pages (double as ad landing pages + automation link targets)
6. /skincare: curated product catalog
7. /testimonials: Yelp, Google, IG social proof hub
8. /insights: blog placeholder (R&D findings, Korean beauty research, hidden gems)
9. /contact: map, hours, phone, Netlify Forms

**Week 3: Care Pages + Polish + Launch**
10. /care/[service]-pre and /care/[service]-post: pre/post-treatment instruction pages (expandable "+" accordion sections with visuals) — these are link targets for Phase 1C automated messages
11. Mobile-first responsive testing across all pages
12. Gather + integrate real photography (candid action shots, space, devices, IG content)
13. Deploy to Netlify — replace SquareSpace ($36/mo savings)
14. Featured devices to showcase: Cynosure Lutronic Ultra, Cynosure Lutronic XERF, Sofwave, Sylfirm X, Alma Soprano Titanium

### After That: Lead Management & Patient Journey (Phase 1C — ~6 weeks)

Phase 1C is the largest Phase 1 sub-phase. It builds the core patient journey automation system. All messaging uses **RCS as the primary channel** (branded sender, rich cards, quick-reply buttons, read receipts) with automatic SMS fallback — same Twilio Programmable Messaging API, no separate integration.

**1C.1 — 2-Way RCS/SMS & Unified Inbox (Week 4-5)**
1. Set up Twilio Conversations API
2. Register RCS sender profile (Le Med Spa brand: logo, colors, description — Twilio manages carrier onboarding)
3. Connect messaging webhooks to Express (RCS + SMS on same API)
4. Build unified conversation inbox (calls + RCS/SMS in one view)
5. Build 2-way messaging from the app (RCS rich features where supported, SMS fallback)
6. Link conversations to client CRM records
7. This architecture enables adding WhatsApp + web chat later via Twilio dashboard

**1C.2 — Lead Pipeline & CRM (Week 5-6)**
1. Build lead pipeline stages (New → Contacted → Consultation → Booked → Treated → Active)
2. Kanban-style pipeline view for staff
3. Lead source tracking + scoring (rule-based)
4. Automated staff reminders for stale leads
5. Configurable lead nurture drip sequences

**1C.3 — Service Content Repository (Week 6-7)**
1. Database schema for per-service content (pre-instructions, post-instructions, consent forms, questionnaires)
2. Admin UI to create/edit content blocks per service
3. Static instruction pages on lemedspa.com (ties into Phase 1B site): `lemedspa.com/care/[service]-pre`, `lemedspa.com/care/[service]-post`
4. Expandable accordion ("+" sections) for detailed explanations with visuals
5. Digital consent forms with e-signature (signature_pad library)
6. Initial content for all current services (neuromodulators, fillers, peels, laser, IV, hormones, body contouring)

**1C.4 — Pre-Treatment Automation (Week 7-8)**
1. Automation engine: configurable triggers + timing offsets + channel selection per service
2. Booking confirmation (immediate RCS/SMS + email) — RCS: branded rich card with "Add to Calendar" + "Get Directions" buttons
3. Consent form + questionnaire sends (immediate email)
4. Pre-treatment reminders at 7d, 3d, 1d, 2h (medication restrictions, sun avoidance, prep steps) — RCS: quick-reply buttons ("✅ Got it", "❓ Questions", "📅 Reschedule")
5. Messages = brief summary + link to full instruction page on site
6. Nudge if consent form not completed 24h before appointment
7. RCS read receipts give staff visibility into which messages were actually read

**1C.5 — Post-Treatment Automation (Week 8-9)**
1. Post-care summary (immediate) + link to post-care page — RCS: "View Post-Care Guide" button
2. Check-in messages at 1d, 3d, 7d — RCS: quick-reply buttons ("😊 Great", "😐 Some concerns", "📞 Need to call")
3. Rebooking prompts at 14d, 30d — RCS: "Book Follow-Up" button
4. Post-care pages with expandable detail sections and visuals
5. All timing configurable per service in admin
6. RCS read receipts on post-care messages (important for liability — proof patient received aftercare info)

**1C.6 — Appointment Modification & No-Show Handling (Week 9-10)**
1. RCS: dedicated "Reschedule" and "Cancel" action buttons (one tap, no typing)
2. SMS fallback: "Reply RESCHEDULE or CANCEL"
3. Twilio webhook parses responses, offers alternatives or confirms
4. No-show auto-follow-up
5. Cancellation reason capture (RCS: quick-reply options for common reasons) + rebooking prompt

---

## 11. Tips for Getting the Most Out of Claude Code

1. **Be specific about what you want**, but don't worry about HOW to do it. "I want a sidebar with call stats at the top and recent voicemails below" is perfect. I'll figure out the implementation.

2. **Show me screenshots** when words aren't enough. A picture of what you want beats a paragraph of description.

3. **Tell me when something's wrong early.** If the first component I build doesn't match your vision, say so immediately rather than waiting until I've built 10 more in the same style.

4. **Ask me to explain.** If I do something and you want to understand why, just ask. I'll explain the trade-off or reasoning. This helps you learn the codebase and make better decisions.

5. **Don't worry about breaking things.** We're using git. Everything can be reverted. Experiment freely.

6. **Context carries within a session, not between sessions.** Within one conversation, I remember everything. Between conversations, I rely on CLAUDE.md and the code itself. If we make an important decision, I'll suggest adding it to CLAUDE.md.

7. **You can paste error messages directly.** If something breaks, just paste the error. I'll diagnose and fix it.

8. **Batch related work.** "Build the call log page, voicemail player, and call stats widget" in one session is more efficient than three separate sessions, because I maintain context about the data model and design patterns.
