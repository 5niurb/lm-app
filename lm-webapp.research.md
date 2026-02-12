# Le Med Spa - Customer-Facing Web App Research

> Research compiled: February 2025
> Goal: Identify affordable tools, services, and architecture to build a Mangomint-like customer-facing web app with 2-way RCS/SMS/chat, mobile PWA, booking, payments, CRM, call logging/voicemail, and AI automation.

---

## Current Stack (What We Already Use / Pay For)

| Tool | Purpose | Notes |
|---|---|---|
| **Aesthetic Record** | EMR (Electronic Medical Records) | Clinical charting, consent forms, treatment records. **Keeping for now; custom EMR replacement planned as Phase 5 (long-term).** |
| **Twilio** | Voice + SMS backbone | Currently routed through HighLevel. Going DIRECT to eliminate middleman. Keeping Twilio. |
| **TextMagic** | SMS with patients/leads | Uses Twilio under the hood. Will be REPLACED by direct Twilio SMS/Conversations API. |
| **HighLevel (GoHighLevel)** | CRM, call routing, automation | Routes Twilio Voice via SIP to ASA adapter. Want to REPLACE with custom app. |
| **Zapier** (free tier) | Basic integrations | Will be REPLACED by custom webhooks + Trigger.dev. |
| **Make** (paid) | More complex integrations | Will be REPLACED by custom webhooks + Trigger.dev. |
| **Microsoft 365** | Email, calendar, documents | Keep. Integrate calendar sync where needed. |
| **Google Workspace** | Email, calendar, documents | Keep. Integrate calendar sync where needed. |
| **Resend** | Transactional email | Already configured. Keep. |
| **SquareSpace** | lemedspa.com (current live site) | $36/mo. Will be REPLACED by redesigned site on Netlify (free). |
| **Netlify** | lemedspa.com hosting (new) | Free static hosting. Replaces SquareSpace after Phase 1B redesign. |
| **Render** | timetracker hosting | Keep. Expand for new app backend. |
| **Supabase** | Database + auth (timetracker) | Keep. Expand for new app. |

### What We're Replacing and Why

| Replacing | With | Why |
|---|---|---|
| HighLevel | Custom app | Expensive, limited customization, we only use it for call routing + basic CRM |
| TextMagic | Direct Twilio RCS/SMS + Conversations API | Cut out middleman, full control over 2-way messaging, branded RCS with SMS fallback, unified multi-channel threading |
| Twilio via HighLevel SIP | Direct Twilio Voice API | Eliminate HighLevel markup, build custom call logging + voicemail |
| Zapier + Make | Custom webhooks + Trigger.dev | Free, more reliable, no monthly automation platform fees |
| SquareSpace ($36/mo) | Redesigned site on Netlify (free) | Simpler design focused on highest-priority services, saves $36/mo |

### What We're Keeping

| Keeping (For Now) | Why | Long-Term Plan |
|---|---|---|
| Aesthetic Record (EMR) | Clinical records, consent forms, charting | **Phase 5: Replace with custom EMR** -- SOAP notes, face/body mapping, consent management, photo workflow, lot tracking. Requires Supabase Teams ($599/mo) for HIPAA BAA. |
| M365 + Google Workspace | Staff already uses these. Calendar sync is the main integration point. | Keep permanently |
| Resend | Already configured, working fine. | Keep permanently |

---

## Table of Contents

1. [Mangomint Feature Benchmark](#1-mangomint-feature-benchmark)
2. [Frontend Framework & PWA Strategy](#2-frontend-framework--pwa-strategy)
3. [Backend, Database & Hosting](#3-backend-database--hosting)
4. [SMS, Chat & 2-Way Communication](#4-sms-chat--2-way-communication)
5. [Online Booking & Scheduling](#5-online-booking--scheduling)
6. [Payment Processing](#6-payment-processing)
7. [CRM & Lead Management](#7-crm--lead-management)
8. [Email: Transactional & Marketing](#8-email-transactional--marketing)
9. [AI Automation](#9-ai-automation)
10. [Analytics & Reporting](#10-analytics--reporting)
11. [Open-Source Spa Platforms](#11-open-source-spa-platforms)
12. [Call Logging, Voicemail & Phone System](#12-call-logging-voicemail--phone-system)
13. [CPaaS Provider Deep Comparison](#13-cpaaS-provider-deep-comparison)
14. [POS & Inventory Management](#14-pos--inventory-management)
15. [EMR & Clinical Features](#15-emr--clinical-features)
16. [Competitor Platform Comparison](#16-competitor-platform-comparison)
17. [Recommended Architecture & Cost Summary](#17-recommended-architecture--cost-summary)

---

## 1. Mangomint Feature Benchmark

Mangomint is a modern salon/spa management platform (Austin, TX, founded ~2017). It targets salons, spas, and med spas as a modern alternative to Mindbody, Booker, Vagaro, and Boulevard. Key differentiators: clean UI, no per-user pricing, strong automation.

### Core Features We Want to Replicate

| Feature Area | Mangomint Capability |
|---|---|
| **Scheduling** | Drag-and-drop calendar, multi-staff views, smart gap-filling, waitlist, resource scheduling, recurring appointments |
| **POS** | Integrated checkout, multiple payment methods, tip handling, hardware reader support |
| **Client CRM** | Profiles with history, SOAP notes, photo storage, digital consent/intake forms, tags, segments |
| **Inventory** | Product catalog, SKU tracking, stock alerts, vendor tracking |
| **Staff Management** | Individual schedules, commission structures, payroll-ready reports, role-based permissions |
| **2-Way SMS** | Staff sends/receives texts in-platform from business number, photo support, conversation history on client profile, no per-message fees |
| **Automated Notifications** | Booking confirmations, configurable reminders, cancellation/reschedule alerts, post-visit follow-ups, review requests |
| **Online Booking** | Embeddable widget, standalone booking page, real-time availability, deposits, cancellation policy enforcement |
| **Platform Integrations** | Reserve with Google, Instagram/Facebook booking buttons |
| **Marketing Automation** | Lapsed client outreach, birthday messages, review requests, new client welcome series, rebooking reminders |
| **Memberships & Packages** | Recurring monthly memberships, prepaid packages, auto-billing, benefit tracking |
| **Gift Cards** | Online and physical, balance tracking |
| **Mobile App** | Native iOS and Android with near-full functionality, push notifications |
| **API** | Open REST API, Zapier, webhooks (higher-tier plans) |

### Mangomint Pricing (as of early 2025)

| Plan | ~Monthly Price | Key Features |
|---|---|---|
| Essentials | ~$165/mo | Core scheduling, POS, client management, online booking |
| Standard | ~$245/mo | + Advanced automations, additional reporting |
| Unlimited | ~$375/mo | + API access, priority support, all features |

- No per-user/per-provider fees (flat per-location pricing)
- Payment processing: ~2.6% + $0.10 per transaction (Stripe-powered)
- SMS included in subscription (no per-message charges)

### What We Would Add Beyond Mangomint (Med Spa Specific)

- HIPAA-compliant data handling
- Treatment protocol tracking (multi-session series)
- Before/after photo management with consent workflows
- Injectable/product lot and batch tracking
- Detailed clinical treatment notes
- AI-powered automation (follow-ups, content, voice)

---

## 2. Frontend Framework & PWA Strategy

### Framework Comparison

| Factor | Next.js (React) | SvelteKit | Nuxt 3 (Vue) |
|---|---|---|---|
| PWA setup | Plugin required (`next-pwa` / Serwist) | Built-in service worker support | Plugin required (`@vite-pwa/nuxt`) |
| Bundle size | Larger (React runtime) | Smallest (compiles to vanilla JS) | Medium |
| Ecosystem | Largest | Growing rapidly | Large |
| Hiring ease | Easiest | Harder | Medium |
| Learning curve | Higher (App Router complexity) | Lower | Medium |
| Mobile performance | Good | Best | Good |
| iOS Safari compat | Strong | Strong | Strong |

**Recommendation**: **SvelteKit** for best mobile performance and built-in PWA support, or **Next.js** for largest ecosystem and hiring pool.

### Mobile Delivery: PWA vs Native vs Hybrid

#### PWA on iOS (2025-2026) - What Works

- Add to Home Screen (standalone, no browser chrome)
- Service workers for offline caching
- Web Push Notifications (since iOS 16.4, requires home screen install)
- Camera, mic, geolocation, WebSockets, Payment Request API
- Local Storage, IndexedDB, Cache API

#### PWA on iOS - Limitations

- Storage can be purged after ~7 days of inactivity
- Push notifications require home screen install first (lower opt-in rates)
- No badge count on app icon
- No background sync/fetch
- No App Store listing (no discoverability)
- No NFC, Bluetooth, or USB access

#### Approach Comparison

| Approach | Dev Time | Monthly Cost | App Store | iOS Experience |
|---|---|---|---|---|
| **Pure PWA** | 2-3 months | $0-20 | No | Good (minor gaps) |
| **PWA + Capacitor.js** | 2-4 months | $0-20 + $124/yr stores | Yes | Excellent |
| **React Native / Expo** | 4-6 months | $0-99 EAS + $124/yr | Yes | Native |
| **Flutter** | 4-6 months | $0-20 + $124/yr | Yes | Native (Dart required) |

**Recommendation**: **Start as PWA, add Capacitor.js later for App Store.**

- Phase 1: Build and launch as web app / PWA (2-3 months)
- Phase 2: Wrap with Capacitor.js for native app stores (1-2 weeks additional)
- Capacitor is free (MIT), adds native push notifications, Face ID/Touch ID, deep linking
- Apple Developer: $99/yr, Google Play: $25 one-time

### UI Component Libraries

| Library | Framework | Price | Quality | Notes |
|---|---|---|---|---|
| **shadcn/ui** | React | Free (MIT) | Excellent | Copy-paste-and-own model, built on Radix + Tailwind. Clean, minimal, professional. |
| **shadcn-svelte** | Svelte | Free (MIT) | Excellent | Community port, built on Melt UI / Bits UI + Tailwind |
| **Tailwind UI** | Any | $299 one-time | Premium | Complete page layouts, dashboard templates. Worth it without a designer. |
| **DaisyUI** | Any | Free (MIT) | Good | Tailwind plugin with theme system. More generic looking. |
| **Radix UI** | React | Free (MIT) | Excellent | Unstyled primitives (shadcn/ui builds on this) |
| **Skeleton UI** | Svelte | Free (MIT) | Good | Batteries-included for SvelteKit |

**Recommendation**: **shadcn/ui** (React) or **shadcn-svelte** (Svelte) + optionally **Tailwind UI** ($299) for layouts.

### Frontend Hosting

| Platform | Free Tier | Paid | Best For |
|---|---|---|---|
| **Vercel** | 100 GB bandwidth, 6K build min | $20/member/mo | Next.js (they created it) |
| **Netlify** | 100 GB bandwidth, 300 build min | $19/member/mo | Already used for lemedspa.com |
| **Cloudflare Pages** | **Unlimited bandwidth**, 500 builds/mo | **$5/mo flat** | Best value at any scale |

**Recommendation**: **Cloudflare Pages** for SvelteKit (unlimited free bandwidth, $5/mo flat when needed). **Vercel** for Next.js. Keep lemedspa.com on Netlify.

---

## 3. Backend, Database & Hosting

### Backend-as-a-Service (BaaS) Comparison

| Service | Free Tier | Paid | Real-time | Database | Best For |
|---|---|---|---|---|---|
| **Supabase** | 500 MB DB, 50K MAU auth, 2M realtime msgs | $25/mo (8 GB DB) | Native Postgres subscriptions | PostgreSQL | **Best overall for this project** |
| Firebase | 1 GiB Firestore, 50K reads/day | Pay-as-you-go | Excellent | NoSQL (Firestore) | Real-time mobile apps (poor for relational CRM) |
| Appwrite | 2 GB storage, 750K function exec | $15/member/mo | WebSocket | Document-based | Self-hosting preference |
| Nhost | 1 GB DB, 1K MAU | $25/mo | GraphQL subscriptions (Hasura) | PostgreSQL | GraphQL preference |
| PocketBase | Free (self-hosted, single Go binary) | VPS cost only | SSE | SQLite | Prototyping, simple apps |

**Supabase is the clear winner** - already in use for the timetracker, PostgreSQL is ideal for relational spa data, native real-time subscriptions, built-in auth, edge functions, and pg_cron.

**Why NOT Firebase**: Firestore's NoSQL model makes relational CRM queries extremely difficult. Per-document-read pricing is dangerous for admin dashboards. Cloud Functions require paid plan.

### Backend Hosting (for custom Express logic)

| Platform | Free Tier | Entry Paid | Notes |
|---|---|---|---|
| **Render** (already used) | 512 MB, spins down after 15 min | $7/mo always-on | Familiar, $7 eliminates spin-down |
| Railway | $5 credit/mo | ~$5-10/mo usage-based | Flexible pricing |
| Fly.io | 3 VMs (256 MB each) | ~$1.94-3.82/mo | Edge deployment, more DevOps required |
| Coolify + Hetzner VPS | Self-hosted | ~$4.50/mo total | Maximum control, self-managed |

**Recommendation**: Stay on **Render** ($7/mo Starter for production).

### Database

**Supabase PostgreSQL** is the primary recommendation.

| Feature | Supabase | Neon | Turso | PlanetScale |
|---|---|---|---|---|
| Free storage | 500 MB | 512 MB | 9 GB | None (free tier removed) |
| SQL dialect | PostgreSQL | PostgreSQL | SQLite | MySQL |
| Real-time subscriptions | **Native (built-in)** | No | No | No |
| Extensions | Full (pg_cron, pgvector, PostGIS) | Limited | None | None |
| Cheapest paid | $25/mo | $19/mo | $29/mo | $39/mo |

### Authentication

| Provider | Free MAU | Phone/SMS | Pre-built UI | Notes |
|---|---|---|---|---|
| **Supabase Auth** | 50,000 | Yes (bring Twilio) | Basic | Best if using Supabase |
| **Clerk** | 10,000 | Yes (included) | Excellent | Best out-of-box UI |
| Auth0 | 25,000 | Yes | Good | Enterprise-oriented, complex |
| Firebase Auth | Unlimited (email) | 10K/mo free | Basic | Best standalone |
| Lucia | Unlimited | DIY | None | Free library, most work |

**Recommendation**: **Supabase Auth** (already in ecosystem, 50K MAU free).

### File Storage

| Service | Free Storage | Egress | S3 Compatible | Image Transforms |
|---|---|---|---|---|
| Supabase Storage | 1 GB | Included | No | Yes (built-in) |
| **Cloudflare R2** | **10 GB** | **$0 (zero egress)** | Yes | No (separate service) |
| AWS S3 | 5 GB (12 months) | $0.09/GB | Yes | No |

**Recommendation**: Start with **Supabase Storage** for simplicity. Move large assets to **Cloudflare R2** (10 GB free, zero egress fees) when needed.

### Background Jobs / Scheduling

| Solution | Free Tier | Delayed Jobs | Retries | Dashboard |
|---|---|---|---|---|
| **pg_cron** (Supabase) | Free | No | No | No |
| **Trigger.dev** | 50K runs/mo | Yes | Yes | Yes |
| Inngest | 25K runs/mo | Yes | Yes | Yes |
| BullMQ + Redis | Self-hosted | Yes | Yes | DIY |

**Recommendation**: Start with **pg_cron** (free, in Supabase). Add **Trigger.dev** (50K free runs) when you need delayed jobs with retries.

---

## 4. SMS, Chat & 2-Way Communication

### SMS Provider Comparison

| Provider | Outbound SMS | Inbound SMS | Number/Month | MMS Out |
|---|---|---|---|---|
| Twilio | $0.0079 | $0.0075 | $1.15 | $0.0200 |
| **Telnyx** | **$0.0040** | **$0.0040** | **$1.00** | **$0.0080** |
| Plivo | $0.0050 | $0.0050 | $0.80 | $0.0180 |
| Vonage | $0.0068 | $0.0062 | $1.00 | $0.0160 |
| Sinch | $0.0060 | Free | $1.00 | $0.0180 |

All providers also pass through ~$0.003/msg carrier surcharges.

**Telnyx is ~50% cheaper than Twilio** with comparable API quality and documentation.

### Monthly SMS Cost Estimates

| Volume | Twilio | Telnyx | Savings |
|---|---|---|---|
| 500 msgs | ~$10.70 | ~$7.00 | 35% |
| 2,000 msgs | ~$42.80 | ~$28.00 | 35% |
| 5,000 msgs | ~$107.00 | ~$70.00 | 35% |

### Twilio Conversations API (Multi-Channel)

- First 200 MAU: free. Beyond: ~$0.05/MAU/month
- Threads SMS + WhatsApp + web chat in one conversation
- Delivery/read receipts, webhooks, SDKs
- Standard SMS rates still apply on top
- **Skip Twilio Flex** ($150/user/mo) - enterprise contact center, overkill for a spa

### Live Chat Options

| Platform | Price | Best Feature |
|---|---|---|
| **Tawk.to** | Free (unlimited) | Zero cost, mobile apps for agents |
| **Crisp** | Free / $25/mo Pro | Beautiful UI, fits luxury brand |
| Tidio | Free (50 chats/mo) / $29/mo | Built-in AI chatbot (Lyro) |
| HubSpot Chat | Free with CRM | Free CRM integration |
| **Chatwoot** (open source) | Free self-hosted / $19/agent cloud | Multi-channel inbox, bot builder |

### Custom Chat with Supabase Realtime

Build a unified inbox using Supabase Realtime subscriptions:

```sql
-- conversations table
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT,
  customer_phone TEXT,
  status TEXT DEFAULT 'open',    -- open, assigned, closed
  assigned_to UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- messages table (handles chat + SMS in one place)
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id),
  sender_type TEXT NOT NULL,     -- 'customer' or 'staff'
  content TEXT NOT NULL,
  channel TEXT DEFAULT 'chat',   -- 'chat', 'sms', 'email'
  created_at TIMESTAMPTZ DEFAULT now()
);
```

- Free tier: 200 concurrent connections, 2M realtime messages/month
- Zero per-message cost for chat
- Full brand control
- SMS messages funnel into same inbox via webhook
- Build time: 1-2 weeks for basic implementation

### Unified Messaging Platforms

| Platform | Price | Channels |
|---|---|---|
| **Chatwoot (self-hosted)** | Free + $7-15/mo hosting | Chat, SMS, Email, WhatsApp, Instagram, Facebook |
| Missive | $14/user/mo | Email, SMS, Chat, WhatsApp |
| Front | $19/user/mo | Email, SMS, Chat, Social |
| Respond.io | $79/mo (5 users) | All channels |
| HubSpot Inbox | Free (basic) | Email, Chat, Messenger |

### Compliance Requirements (Non-Negotiable)

**TCPA (Telephone Consumer Protection Act)**:
- Obtain express written consent before marketing SMS ($500-$1,500 per violation)
- Use unchecked checkboxes for opt-in on forms
- Include opt-out instructions on every marketing message ("Reply STOP to unsubscribe")
- Handle STOP keyword automatically
- Maintain consent records

**10DLC Registration** (required for all business A2P SMS):
- Brand registration: ~$4 one-time
- Campaign registration: ~$15 one-time per campaign
- Monthly fee: ~$2-10/mo
- Total upfront: ~$19-59
- Register 2 campaigns: transactional (reminders/confirmations) + marketing (promotions)

### AI Auto-Responder for SMS/Chat

Custom Claude Haiku auto-responder:
- ~$0.0003 per interaction (200 input + 300 output tokens)
- 500 conversations/month = ~$0.15/month
- Handles 60-80% of routine inquiries: hours, pricing, service info, directions
- Escalates complex questions to human staff
- System prompt defines it as Le Med Spa receptionist with service details

### Communication Recommendation

> **Updated**: Twilio selected as unified voice + SMS + multi-channel provider. See [Section 13](#13-cpaaS-provider-deep-comparison) for full rationale.

| Component | Choice | Monthly Cost |
|---|---|---|
| SMS + Voice + Conversations | **Twilio (direct)** | ~$30 |
| Live chat | **Twilio Conversations SDK** (web chat) or Tawk.to (free) | $0 |
| 10DLC fees | Required | ~$2-10 |
| AI auto-responder | Claude Haiku API | ~$0.15 |
| Unified inbox | **Twilio Conversations API** + Supabase Realtime for UI | $0 |
| **Total** | | **~$32-40/mo** |

Twilio Conversations API provides unified threading across SMS, WhatsApp, and web chat. Adding WhatsApp or web chat later is a dashboard configuration change, not a new integration.

---

## 5. Online Booking & Scheduling

### Cal.com - Top Recommendation

**Open source** (AGPLv3), self-hostable, or cloud-hosted.

**Self-hosted**: Free forever. Deploy via Docker on VPS ($7-15/mo).

**Cloud pricing**:
- Free: 1 user, Cal.com branding
- Team: $12/user/mo (round-robin, collective scheduling)
- Organization: $37/user/mo (admin controls, advanced routing)

**Features for med spa**:
- Multiple providers with independent availability
- Service-based event types with durations and pricing
- Buffer/cleanup times between appointments
- Google Calendar and Outlook sync
- Stripe integration for deposits at booking
- Custom intake questions on booking form
- Webhook support for Express backend
- SMS and email reminders
- Embeddable / white-label

### Alternatives

| Platform | Price | Self-Host | API | Notes |
|---|---|---|---|---|
| **Cal.com** | Free self-hosted / $12+/user cloud | Yes | Full REST | Best overall fit |
| Calendly | $10-16/user/mo | No | REST (limited) | Simpler but less flexible |
| Acuity (Squarespace) | $16-49/mo | No | Basic | Good for service businesses |
| SimplyBook.me | Free (50 bookings/mo) / $8.25/mo | No | Yes | Budget-friendly |
| Square Appointments | Free (1 staff) / $29/mo | No | Yes | Bundles with Square payments |

### Multi-Provider Scheduling Considerations

Key algorithmic challenges for a custom or extended system:
1. **Availability calculation**: Recurring weekly schedules minus existing bookings minus buffer times
2. **Service-provider mapping**: Not every provider offers every service
3. **Resource constraints**: Treatment rooms may be fewer than providers
4. **Buffer/cleanup times**: Room turnover between appointments
5. **Smart slot suggestions**: Minimize gaps in provider schedules

Cal.com handles #1, #2, and #4 natively. #3 and #5 require customization.

**Recommendation**: **Self-hosted Cal.com** ($7-15/mo hosting). Full API, white-label, zero software fees, handles complex scheduling logic, Stripe integration for deposits.

---

## 6. Payment Processing

### Stripe - Primary Recommendation

| Transaction Type | Rate |
|---|---|
| Online card payments | 2.9% + $0.30 |
| In-person (Stripe Terminal) | 2.6% + $0.10 |
| ACH direct debit | 0.8%, capped at $5 |
| Monthly platform fee | $0 |

**Stripe Billing** (memberships/subscriptions):
- Starter: +0.5% of recurring volume
- Handles trials, proration, dunning (failed payment retries), pause/resume
- Perfect for membership programs ("Gold $199/mo - 1 facial + 10% off")

**Stripe Terminal** (in-person POS):
- Reader M2: ~$59 (handheld tap reader)
- WisePOS E: ~$249 (countertop with screen)
- Reader S700: ~$349 (larger touchscreen)
- Built-in tipping with preset percentages

**Stripe Connect**: Only needed if splitting payments with independent contractors. Not needed for employee-based spa.

### Square (Alternative)

| Transaction Type | Rate |
|---|---|
| In-person | 2.6% + $0.10 |
| Online | 2.9% + $0.30 |
| Keyed-in | 3.5% + $0.15 |

Square Appointments bundles booking + payments ($0-69/mo) but limits customization.

### Why Stripe Over Square

- Stripe.js / Elements give pixel-perfect control over payment UI (luxury brand)
- Stripe Billing is purpose-built for subscription/membership management
- Stripe Terminal integrates into same account (unified online + in-person)
- Superior webhook system for Express backend
- Best developer documentation in the industry

**Recommendation**: **Stripe** for everything. $0 platform fees, pay only per-transaction.

---

## 7. CRM & Lead Management

### Why Build Custom (Not Use a Generic CRM)

Med spa CRM needs are domain-specific. Generic CRMs (HubSpot, Salesforce) don't natively support:
- Health profiles (allergies, medications, skin type, contraindications)
- Consent forms with expiration tracking
- Treatment records (units used, areas treated, before/after photos)
- Product lot/batch tracking
- Clinical notes

### Recommended Supabase Data Model

```sql
-- Core client record
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  date_of_birth DATE,
  address JSONB,
  referral_source TEXT,
  lead_status TEXT DEFAULT 'new',  -- new/contacted/consulted/active/inactive
  membership_tier TEXT,
  stripe_customer_id TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Health profile (med spa specific)
CREATE TABLE client_health_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  allergies TEXT[],
  medications TEXT[],
  medical_conditions TEXT[],
  skin_type TEXT,
  skin_concerns TEXT[],           -- acne, aging, hyperpigmentation, etc.
  contraindications TEXT[],
  pregnancy_status TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Consent forms
CREATE TABLE consent_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  form_type TEXT NOT NULL,        -- general, botox, filler, laser, peel
  signature_url TEXT,
  signed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  form_version TEXT
);

-- Treatment records (clinical history)
CREATE TABLE treatments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  provider_id UUID,
  service_name TEXT NOT NULL,
  service_category TEXT,
  treatment_date TIMESTAMPTZ,
  duration_minutes INT,
  units_used NUMERIC,             -- e.g., 20 units Botox
  product_used TEXT,
  areas_treated TEXT[],           -- forehead, glabella, crow's feet, etc.
  before_photo_url TEXT,
  after_photo_url TEXT,
  provider_notes TEXT,
  amount_charged NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Interaction/communication log
CREATE TABLE interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  type TEXT NOT NULL,              -- call, email, sms, walk-in, form, consultation
  direction TEXT,                  -- inbound/outbound
  subject TEXT,
  content TEXT,
  outcome TEXT,                    -- booked, no-answer, follow-up-needed
  handled_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Follow-up reminders
CREATE TABLE follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  treatment_id UUID REFERENCES treatments(id),
  type TEXT NOT NULL,              -- post-treatment, rebooking, renewal, birthday
  due_date DATE,
  status TEXT DEFAULT 'pending',  -- pending/completed/cancelled
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Lead Scoring (Rule-Based, No AI Needed)

Simple point system stored on client record:
- +10: Submitted contact form
- +15: Booked a consultation
- +20: Attended consultation
- +5: Opened marketing email
- +10: Clicked link in email
- +25: Visited pricing/services page
- -10: No response to outreach in 14 days
- -20: Cancelled consultation

### Generic CRM Options (For Reference)

| CRM | Price | Notes |
|---|---|---|
| HubSpot Free | $0 (1M contacts) | Good for supplementary lead tracking, not primary data store |
| Twenty (open source) | Free self-hosted | Modern, PostgreSQL-based, customizable schema |
| EspoCRM | Free self-hosted | Mature but PHP/MySQL stack |

**Recommendation**: **Custom Supabase tables** (6 tables, ~1 day to build schema). Full control, zero additional cost, integrates directly with Express backend.

---

## 8. Email: Transactional & Marketing

### Transactional Email: Resend (Keep It)

Already configured with `updates.lemedspa.com` sending domain and `RESEND_API_KEY`.

| Tier | Price | Volume |
|---|---|---|
| Free | $0 | 3,000/mo (100/day limit) |
| Pro | $20/mo | 50,000/mo |
| Business | $100/mo | 100,000/mo |

**Use for**: Booking confirmations, reminders, receipts, follow-ups, membership notifications.

### Marketing Email: Brevo (formerly Sendinblue)

| Tier | Price | Volume |
|---|---|---|
| Free | $0 | 300/day (~9,000/mo), unlimited contacts |
| Starter | $9/mo | 5,000/mo, no daily limit |
| Business | $18/mo | 5,000/mo + automation, A/B testing |

**Use for**: Newsletters, promotions, drip sequences (new client welcome, re-engagement), seasonal campaigns, birthday offers.

Also includes: SMS marketing (pay per msg), basic CRM, automation builder.

### Alternatives

| Service | Free Tier | Paid | Notes |
|---|---|---|---|
| SendGrid | 100/day | $19.95/mo for 50K | Both transactional + marketing |
| Mailchimp | 500 contacts, 1K sends/mo | $13/mo | Free tier too limited now |
| Loops | 1,000 contacts | $49/mo | API-first, better for SaaS |
| Postmark | 100/mo trial | $15/mo for 10K | Best deliverability |

**Recommendation**: **Resend** (transactional, already set up) + **Brevo free** (marketing). Total: $0/mo.

---

## 9. AI Automation

### API Pricing

| Model | Input Cost/M tokens | Output Cost/M tokens | Best For |
|---|---|---|---|
| GPT-4o-mini | $0.15 | $0.60 | Cheapest, good for most tasks |
| GPT-4o | $2.50 | $10.00 | High quality writing |
| Claude 3.5 Haiku | $0.80 | $4.00 | Fast classification, FAQ responses |
| Claude 3.5 Sonnet | $3.00 | $15.00 | Nuanced, complex conversations |

At 100 AI interactions/day (~700 tokens each): GPT-4o-mini costs ~$0.30-1.50/month.

### Use Case 1: Smart Appointment Suggestions

Cron job queries clients whose last treatment of a given type was N weeks ago. Sends history to GPT-4o-mini for natural-language rebooking suggestion. Displays in admin dashboard.

**Cost**: ~$1-3/mo. **Alternative**: Simple rule-based queries work nearly as well.

### Use Case 2: Automated Follow-Up Messages

Cron job finds treatments completed N days ago (1 day for injectables, 3 days for peels, 7 for laser). AI personalizes aftercare follow-up with brand voice. Auto-send via Resend or queue for review.

**Cost**: ~$1-3/mo. **High value** - most spas don't do this consistently.

### Use Case 3: Review Response Generation

Admin page shows recent Google/Yelp reviews. Click "Generate Response" sends review to GPT-4o-mini with brand guidelines. Staff edits and posts.

**Cost**: ~$0.50-2/mo.

### Use Case 4: Marketing Content Generation

Internal tool for generating social posts, blog content, treatment descriptions, promo copy. Use GPT-4o or Claude Sonnet for higher quality.

**Cost**: ~$5-15/mo.

### Use Case 5: SMS/Chat Auto-Responder

Claude Haiku as a Le Med Spa receptionist. Handles: hours, pricing, service info, directions, FAQs. Escalates complex queries to staff.

**Cost**: ~$0.15/mo for 500 conversations.

### Use Case 6: AI Voice Agent (Phase 4)

| Platform | Cost/Minute | 100 Calls/Mo (3 min avg) | Notes |
|---|---|---|---|
| **Vapi** | $0.07-0.15 | $21-45/mo | Most flexible, tool calling, custom LLM |
| Bland.ai | $0.07-0.12 | $21-36/mo | Simpler setup, supports outbound |
| Retell AI | $0.07-0.15 | $21-45/mo | Good interruption handling |

**Use for**: After-hours call handling, overflow during busy periods, basic inquiry answering.

### AI Budget Summary

| Use Case | Monthly Cost |
|---|---|
| Appointment suggestions | $1-3 |
| Follow-up messages | $1-3 |
| Lead scoring | $0 (rule-based) |
| Review responses | $0.50-2 |
| Marketing content | $5-15 |
| SMS/chat auto-responder | $0.15 |
| **Total (without voice)** | **$8-23/mo** |
| Voice agent (Phase 4) | +$30-100/mo |

---

## 10. Analytics & Reporting

### Website Analytics

| Platform | Price | Script Size | Notes |
|---|---|---|---|
| **Umami** (self-hosted) | Free | ~2KB | Node.js + PostgreSQL (matches our stack), no cookies |
| Plausible | $9/mo cloud / free self-hosted | <1KB | Privacy-friendly, clean dashboard |
| PostHog | Free (1M events/mo) | Larger | Full product analytics, funnels, session recordings |
| Google Analytics | Free | ~45KB | Full-featured but privacy concerns, cookie banner needed |

**Recommendation**: **Umami self-hosted** on Render + Supabase PostgreSQL. Free, matches stack, no cookies.

### Business Reporting

**Option A**: Custom dashboards in Express admin panel using **Chart.js** (~60KB). Full control, $0 cost.

**Option B**: **Metabase** (open source BI tool, self-hosted free). Connects directly to Supabase PostgreSQL. Drag-and-drop queries, scheduled email reports. Good for giving non-dev staff access to data.

**Recommendation**: Start with custom Chart.js dashboards. Add Metabase later for ad-hoc reporting.

---

## 11. Open-Source Spa Platforms

### The Honest Assessment

**There is no good open-source, full-featured med spa management platform.** The landscape:

| Project | Stack | What It Does | Why Not |
|---|---|---|---|
| Easy!Appointments | PHP/MySQL | Booking only | Cal.com does it better, wrong stack |
| Booknetic | WordPress plugin ($79) | Booking + payments | Not open source, requires WordPress |
| ERPNext | Python/Frappe | Full ERP with healthcare module | Massively over-engineered for a small spa |
| InvoiceNinja | PHP/Laravel | Invoicing/billing | Only one piece of the puzzle |
| Twenty CRM | TypeScript/NestJS | Modern CRM | Not spa-specific |

### Conclusion

**Assemble a custom platform from best-of-breed components** rather than adapting an ill-fitting monolith. The Express + Supabase + vanilla JS stack is well-positioned for this. Each component (booking, payments, CRM, chat, AI) plugs in via API.

---

## 12. Call Logging, Voicemail & Phone System

> **PRIORITY: HIGH** -- This replaces HighLevel + Twilio SIP routing, which is the most immediate pain point.

### Current Setup Being Replaced

```
Inbound Call --> Twilio --> HighLevel --> SIP --> ASA Adapter --> Staff phones
                              ^
                              |
                          HighLevel CRM (call logs, routing rules)
```

### New Setup

```
Inbound Call --> Twilio (direct, no HighLevel) --> Express API webhook
                                                    |
                                              Check routing rules (Supabase)
                                                    |
                                        +-----------+-----------+
                                        |           |           |
                                    Ring staff   Voicemail    Log call
                                    (forward)   (if no ans)  (Supabase)
                                                    |
                                              Store MP3 in
                                              Supabase Storage
                                                    |
                                              Dashboard: play,
                                              log, callback
```

### Voice Provider Comparison

| Provider | Inbound/min | Outbound/min | Recording | Number/mo | Est. Monthly (500in + 200out) | Migration from Twilio |
|---|---|---|---|---|---|---|
| **Telnyx** | $0.0035 | $0.0070 | $0.0025/min | $1.00 | **~$5.03** | Good (TeXML compat) |
| **SignalWire** | $0.0040 | $0.0080 | Included | $1.00 | **~$4.60** | Easiest (cXML = TwiML drop-in) |
| Plivo | $0.0055 | $0.0100 | Included | $0.80 | ~$5.55 | Good (similar XML) |
| Vonage | $0.0049 | $0.0139 | $0.0040/min | $0.90 | ~$7.53 | Moderate (JSON API) |
| Twilio Direct | $0.0085 | $0.0140 | $0.0025/min | $1.15 | ~$9.08 | N/A (already on it) |

**Decision**: **Twilio Direct** -- see [Section 13: CPaaS Deep Comparison](#13-cpaaS-provider-deep-comparison) for full rationale. Best HIPAA clarity, best SDK/docs, multi-channel roadmap (WhatsApp, Conversations API), and we already use Twilio (just cutting out HighLevel).

### Call Routing via Webhooks

How it works with any CPaaS provider:

1. Inbound call hits your phone number
2. Provider POSTs webhook to `POST /webhooks/voice/inbound` on your Express server
3. Your Express app checks: Is it business hours? Which extension should ring? Any special routing for this caller?
4. You respond with XML/JSON instructions: ring this number for 20 seconds
5. If no answer, provider POSTs another webhook
6. You respond: play voicemail greeting, then record
7. Caller leaves message, hangs up
8. Provider POSTs recording URL to your webhook
9. You download MP3, store in Supabase Storage, log in database

### Voicemail Storage & Playback

**Storage**: Download recordings from provider, upload to Supabase Storage bucket `call-recordings/`. ~1 MB per minute of audio at MP3 quality. 15 voicemails/day at 30 seconds avg = ~225 MB/month. Well within Supabase limits.

**Playback**: Standard HTML5 `<audio>` element -- works in all browsers, no library needed:

```html
<div class="voicemail-card">
  <strong>(555) 123-4567</strong>
  <span>Today, 2:34 PM</span>
  <span class="badge">New</span>
  <audio controls preload="none">
    <source src="/api/voicemails/abc123/audio" type="audio/mpeg">
  </audio>
</div>
```

`preload="none"` prevents downloading all voicemails on page load. Mark as listened on play.

### Database Schema for Calls & Voicemail

```sql
-- Staff phone extensions
CREATE TABLE phone_extensions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES employees(id),
  extension_number VARCHAR(10) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  forward_to_number VARCHAR(20),         -- cell/desk to ring
  is_active BOOLEAN DEFAULT true,
  ring_timeout_seconds INTEGER DEFAULT 20,
  voicemail_enabled BOOLEAN DEFAULT true,
  voicemail_greeting_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Call routing rules (time-based, caller-based)
CREATE TABLE call_routing_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  priority INTEGER DEFAULT 0,             -- lower = higher priority
  is_active BOOLEAN DEFAULT true,
  time_start TIME,                        -- business hours start
  time_end TIME,                          -- business hours end
  days_of_week INTEGER[],                 -- 0=Sun, 1=Mon, etc.
  action_type VARCHAR(30) NOT NULL,       -- ring_extension, ring_group, voicemail, ivr
  target_extension_id UUID REFERENCES phone_extensions(id),
  ring_group_extensions UUID[],           -- ring multiple simultaneously
  fallback_action VARCHAR(30),            -- what to do if no answer
  fallback_extension_id UUID REFERENCES phone_extensions(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Call log (every call, in and out)
CREATE TABLE call_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_call_sid VARCHAR(100) UNIQUE,  -- provider's call ID
  direction VARCHAR(10) NOT NULL,         -- inbound / outbound
  from_number VARCHAR(20) NOT NULL,
  to_number VARCHAR(20) NOT NULL,
  caller_name VARCHAR(100),               -- CNAM lookup if available
  client_id UUID REFERENCES clients(id),  -- matched to CRM record
  extension_id UUID REFERENCES phone_extensions(id),
  answered_by VARCHAR(100),
  initiated_at TIMESTAMPTZ NOT NULL,
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER DEFAULT 0,
  status VARCHAR(30) NOT NULL,            -- completed, no-answer, busy, voicemail, failed
  disposition VARCHAR(50),                -- appointment_booked, inquiry, callback_requested, spam
  disposition_notes TEXT,
  is_recorded BOOLEAN DEFAULT false,
  recording_url TEXT,
  recording_storage_path TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Voicemails
CREATE TABLE voicemails (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  call_log_id UUID REFERENCES call_logs(id),
  from_number VARCHAR(20) NOT NULL,
  to_extension_id UUID REFERENCES phone_extensions(id),
  recording_url TEXT NOT NULL,
  recording_storage_path TEXT,
  duration_seconds INTEGER NOT NULL,
  transcription TEXT,                     -- AI transcription (optional)
  is_new BOOLEAN DEFAULT true,
  listened_at TIMESTAMPTZ,
  listened_by UUID,
  callback_completed BOOLEAN DEFAULT false,
  callback_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_call_logs_initiated ON call_logs(initiated_at DESC);
CREATE INDEX idx_call_logs_from ON call_logs(from_number);
CREATE INDEX idx_call_logs_client ON call_logs(client_id);
CREATE INDEX idx_voicemails_new ON voicemails(is_new) WHERE is_new = true;
CREATE INDEX idx_voicemails_created ON voicemails(created_at DESC);

-- Dashboard view: daily call stats
CREATE VIEW call_stats_daily AS
SELECT
  DATE(initiated_at) AS call_date,
  direction,
  COUNT(*) AS total_calls,
  COUNT(*) FILTER (WHERE status = 'completed') AS answered,
  COUNT(*) FILTER (WHERE status = 'no-answer') AS missed,
  COUNT(*) FILTER (WHERE status = 'voicemail') AS voicemails,
  AVG(duration_seconds) AS avg_duration
FROM call_logs
GROUP BY DATE(initiated_at), direction
ORDER BY call_date DESC;

-- View: unheard voicemails
CREATE VIEW unheard_voicemails AS
SELECT v.*, pe.display_name AS extension_name, cl.caller_name
FROM voicemails v
JOIN phone_extensions pe ON v.to_extension_id = pe.id
LEFT JOIN call_logs cl ON v.call_log_id = cl.id
WHERE v.is_new = true
ORDER BY v.created_at DESC;
```

### Phone Number Porting

Since we already use Twilio (via HighLevel), the number may already be on Twilio's network. Transition involves reconfiguring the number's webhook URLs to point to our Express API instead of HighLevel's SIP adapter. If the number is owned by HighLevel, porting to our own Twilio account typically takes 1-2 weeks.

### Cost Summary (Phone System Only)

| Component | Monthly Cost |
|---|---|
| Twilio Voice (~700 minutes) | ~$9 |
| Phone number | ~$1.15 |
| Call recording storage | ~$1 |
| Supabase Storage (voicemails) | Included in existing plan |
| AI transcription (optional, GPT Whisper) | ~$1-3 |
| **Total** | **~$12-14/mo** |

**vs. HighLevel**: $97-497/mo depending on plan. This is a massive savings.

---

## 13. CPaaS Provider Deep Comparison

> **Decision: Twilio (Direct)**. After deep research into multi-channel support, HIPAA compliance, SDK quality, and future-proofing, Twilio going direct (cutting out HighLevel) is the best fit.

### Why We Evaluated Beyond Price

Price difference between providers is ~$10-15/mo at our volume -- negligible. The real differentiators are:
- Multi-channel messaging (Instagram DM, RCS, WhatsApp)
- HIPAA compliance clarity
- Developer experience and SDK quality
- Unified conversation threading across channels

### Multi-Channel Support Comparison

| Channel | Twilio | Telnyx | SignalWire | Vonage | Sinch |
|---|---|---|---|---|---|
| SMS/MMS | **GA** | **GA** | **GA** | **GA** | **GA** |
| WhatsApp | **GA** (native BSP) | No | Alpha | **GA** | **GA** |
| Facebook Messenger | **GA** | No | No | **GA** | **GA** |
| Instagram DM | No | No | No | Marketing tool only | **GA** |
| RCS | **GA** (Aug 2025) | No | No | **GA** | **GA** |
| Web Chat SDK | **GA** (Conversations SDK) | No | No | No | **GA** |
| Unified Conversation Threading | **Yes** (Conversations API) | No | No | No | **Yes** |

### Developer Experience & SDK Quality

| Factor | Twilio | Telnyx | SignalWire | Vonage | Sinch |
|---|---|---|---|---|---|
| Node.js SDK quality | **Best** | Good | Decent | Best (TypeScript-first) | Weak (3 GitHub stars) |
| Documentation | **Best-in-class** | Good | Improving | Good (legacy confusion) | Inconsistent |
| Stack Overflow answers | **Thousands** | Few | Very few | Moderate | Very few |
| Express.js tutorials | **Dozens exist** | Sparse | Very few | Some | Very few |
| Debugging tools | **Excellent** (Request Inspector) | Adequate | Basic | Good | Basic |

### HIPAA Compliance (Critical for Med Spa)

| Provider | BAA Available | What's Covered | Cost | Clarity |
|---|---|---|---|---|
| **Twilio** | **Yes** | Voice, SMS, Conversations (detailed guide) | Included on paid tiers | **Best** |
| Telnyx | Yes | Voice, SMS, storage | Included | Good but less documented |
| SignalWire | Yes | Everything including AI agents | **$1,000/mo** | Very clear |
| Vonage | Yes | SMS (US only), Video. Messages API **likely NOT covered** | Enterprise contract | Gaps |
| Sinch | Yes | Conversation API coverage **UNCONFIRMED** | Unknown | Must ask sales |

### Voice Quality & Unique Features

| Factor | Twilio | Telnyx | SignalWire |
|---|---|---|---|
| Network | Public carrier routes | **Private IP backbone** (best quality) | FreeSWITCH-based (excellent) |
| WebRTC (browser calling) | **Mature SDK** | Available | Available |
| AI Voice Agent | No (use Vapi/etc.) | No | **Built-in ($0.16/min)** |
| Call recording pause/resume | Yes (HIPAA) | Yes | Yes |
| SIP trunking | Good | **Best** | Good |

### Pricing at Our Volume (~500 inbound min, 200 outbound min, 2000 SMS/mo)

| Provider | Est. Monthly |
|---|---|
| Telnyx | ~$15 |
| SignalWire | ~$18 |
| Plivo | ~$20 |
| Sinch | ~$25 |
| Vonage | ~$25 |
| **Twilio** | **~$30** |

### Why Twilio Wins for This Project

1. **Fastest to build.** Best docs + most tutorials + biggest community = Claude Code moves faster and can solve any integration problem.
2. **HIPAA is clear.** Detailed implementation checklist, no "call sales to find out" uncertainty. Critical for med spa patient communications.
3. **One vendor** for voice + SMS + WhatsApp + web chat + WebRTC browser calling.
4. **Conversations API** threads messages across channels in a single conversation view -- exactly what we need for the unified inbox.
5. **We already use Twilio** (through HighLevel). Going direct removes the middleman while keeping a provider we know works. Number porting is simpler (same underlying carrier).
6. **Instagram DM** is a direct Meta Graph API integration regardless of CPaaS provider -- even Sinch uses Meta's API under the hood. We can add this independently (~1 week integration).
7. **RCS** is now GA on Twilio (Aug 2025). Same Programmable Messaging API — no code changes needed, automatic SMS fallback when RCS unavailable. Rich text at $0.0083/msg (same as SMS), rich media at $0.022/msg. Branded sender, read receipts, quick-reply buttons, image carousels. We use RCS as the **primary channel** with automatic SMS fallback.
8. **$15/mo extra vs Telnyx** is meaningless compared to the development speed advantage and HIPAA clarity.

### Future Multi-Channel Strategy

```
Phase 1C (Now):   Twilio Voice + RCS (primary, auto-fallback to SMS) + Conversations API
Phase 2 (Month 3): Add WhatsApp via Twilio Messages API (enable in dashboard)
Phase 3 (Month 4): Add Instagram DM via Meta Graph API (direct integration)
Phase 4A (Month 5): AI voice receptionist via Vapi or SignalWire (standalone add-on)
```

RCS is the **default messaging channel from Day 1** — same Twilio Programmable Messaging API, no additional code. Rich branded messages (logo, colors, quick-reply buttons, carousels, read receipts) automatically sent via RCS where supported; seamless SMS fallback for older devices. ~90% US device coverage as of late 2025.

Each channel addition is incremental -- no need to rip out and replace the core platform.

### Providers We Considered But Passed On

| Provider | Why Not |
|---|---|
| **Telnyx** | No multi-channel (SMS/voice only). Great price but we'd outgrow it. No conversation threading. |
| **SignalWire** | AI Agent feature is compelling but no Instagram, no RCS, no conversation threading. Smaller community = slower development. $1K/mo HIPAA BAA. Consider as standalone voice AI add-on later. |
| **Vonage** | Good SDK but HIPAA BAA likely doesn't cover Messages API (WhatsApp/RCS). No Instagram DM in developer API. |
| **Sinch** | Broadest channel support (14 channels!) but HIPAA coverage of Conversation API is unconfirmed. Weakest SDK (3 GitHub stars). Inconsistent docs from acquisition-heavy growth. Most expensive SMS rates. |
| **Plivo** | Cheapest for basic SMS+voice but no Instagram, no RCS (coming soon), no multi-channel story. Would outgrow it. |

---

## 14. POS & Inventory Management

> Full detailed research in separate document: **lm-pos-inventory.research.md**

### Summary

**Barcode Scanning**: USB barcode scanners work as keyboard input devices -- zero special code needed. Scanner "types" the barcode into a focused input field and presses Enter. Recommended budget pick: Tera HW0002 (~$25). For mobile/tablet: camera-based scanning via html5-qrcode library (free, MIT license, works on iOS Safari PWA).

**Stripe Terminal POS**: Stripe Terminal handles payment collection at the physical counter. Reader M2 ($59) for tap/chip payments. Workflow: scan products into cart in the SvelteKit POS page, then send the total to Stripe Terminal via JavaScript SDK. Tipping, split payments, and receipts all handled.

**Inventory Management**: Custom PostgreSQL schema covers products (retail + backbar), SKUs with barcodes, stock levels, vendor management, purchase orders, receiving, stock adjustments, and low stock alerts. Backbar products auto-decrement when treatments are completed.

**Injectable Lot/Batch Tracking**: Critical for med spa compliance. Tracks which batch of Botox/Juvederm was used on which patient, with lot numbers, expiration dates, and recall traceability.

**Hardware Cost (One Checkout Station)**: ~$340 total (USB scanner $25 + Stripe Reader M2 $59 + tablet/display $250). No software licenses needed.

**Implementation**: Planned as Phase 4B (Month 5-7). See revised phasing below.

---

## 15. EMR & Clinical Features

> **IMPORTANT**: This is the most complex, most regulated, and highest-stakes component of the platform. It replaces Aesthetic Record over time.

### Core EMR Features Required

**SOAP Notes**: Structured clinical documentation (Subjective, Objective, Assessment, Plan) with treatment-type-specific templates. Stored as JSONB for flexible structured data. Notes must be signed/locked after completion with an amend-only workflow for corrections. Full audit trail on all modifications.

**Face/Body Mapping**: SVG anatomical diagrams where providers click to mark injection sites, treatment areas, and annotate with product/units. Custom SVG diagrams needed (~$300-500 one-time commission). Annotation data stored as JSON coordinates with metadata per point.

**Before/After Photo Management**: Guided capture workflow (consistent angles, ghost overlay of previous photos), side-by-side comparison slider, photo consent management (separate from treatment consent), encrypted storage in Supabase Storage.

**Consent Forms**: Digital signature capture (signature_pad library, free MIT), versioned templates that store an immutable content snapshot at signing time, expiration tracking, and PDF generation (Puppeteer for HTML-to-PDF).

**Medical History**: Versioned records with medication interaction warnings from a configurable rules engine, allergy tracking, and contraindication checking integrated into the charting workflow.

**Treatment Protocols/Series**: Reusable templates with multi-session series tracking, progress metrics, and auto-scheduling of next sessions.

**Product & Lot Tracking**: Every injectable unit used is linked to a specific patient treatment with batch/lot traceability for safety recalls.

### HIPAA Compliance Requirements

The dominant cost driver is **Supabase Teams plan at $599/month**, required to obtain a BAA (Business Associate Agreement) for PHI storage. Additional requirements:

| Requirement | Implementation |
|---|---|
| Encryption at rest | Supabase (included on Teams) |
| Encryption in transit | TLS everywhere (standard) |
| Access controls | Row Level Security (RLS) per role |
| Audit logging | Immutable audit table with triggers on all clinical tables |
| Session timeout | Automatic logout after inactivity |
| Minimum necessary access | Role-based access: admin, provider, front_desk, patient |
| BAAs required | Supabase Teams, Twilio (available), Render (verify with sales) |
| PHI in messages | Never in SMS/email body -- send portal links instead |

### Database Schema (17 Clinical Tables)

The EMR schema adds these table groups to the existing platform schema:

- **soap_notes** + **soap_note_amendments**: Clinical documentation with sign/lock/amend workflow
- **body_map_templates** + **body_map_annotations**: SVG-based anatomical diagrams with click-to-annotate
- **clinical_photos** + **photo_consents**: Before/after photography with consent management
- **consent_form_templates** + **signed_consents**: Versioned consent forms with digital signatures
- **medical_histories** + **medication_interaction_rules**: Health records with interaction checking
- **treatment_series** + **treatment_series_sessions**: Multi-session protocol management
- **products** + **product_lots** + **treatment_product_usage**: Injectable lot tracking
- **care_instructions**: Post-treatment care templates
- **hipaa_audit_log**: Immutable audit trail for all PHI access and modifications

### Cost Impact

| Item | Cost |
|---|---|
| Supabase Teams (for BAA) | +$574/month (from $25 to $599) |
| Custom anatomical SVG diagrams | $300-500 one-time |
| Additional photo storage | +$3-10/month |
| signature_pad library | $0 (MIT) |
| Puppeteer for PDF generation | $0 (Apache 2.0) |
| **Net monthly increase** | **~$577-584/month** |

### Recommendation: Hybrid Approach

1. **Build Phases 1-4 first** (communication, CRM, booking, payments, POS) on current Supabase Pro ($25/mo). No HIPAA implications for these features.
2. **Keep Aesthetic Record for clinical charting** during this period.
3. **When ready for EMR (Phase 5)**: Upgrade Supabase to Teams ($599/mo) for the BAA.
4. **Optional interim integration**: If Aesthetic Record has an API, build a read-only view that pulls patient treatment summaries into the custom app's client profile.

### Implementation Timeline

EMR features span approximately 6-8 months of development:
- **Phase 5A** (months 8-10): SOAP notes, consent forms, medical history
- **Phase 5B** (months 10-12): Face/body mapping, lot tracking, treatment series
- **Phase 5C** (months 12-13): Photo management
- **Phase 5D** (months 13-14): Patient portal clinical features
- **Phase 5E** (months 14-16): Migration from Aesthetic Record (parallel running, then cutover)

---

## 16. Competitor Platform Comparison

> Research on Podium Aesthetics, Zenoti, Boulevard, and Vagaro -- the major all-in-one platforms our custom build competes with.

### Feature Matrix Summary

| Feature | Podium Aesthetics | Zenoti | Boulevard | Vagaro | **Our Custom Build** |
|---|---|---|---|---|---|
| **SOAP Notes** | Yes, aesthetics templates | Yes, fully customizable | Yes | Yes, templates | Phase 5A |
| **Face/Body Mapping** | Yes, interactive | Yes, interactive | Limited | Very limited | Phase 5B |
| **Lot/Batch Tracking** | Yes (injectables) | Yes, full traceability | Limited | Basic/manual | Phase 5B |
| **Before/After Photos** | Yes, with consent | Yes, progress comparison | Yes | Basic upload | Phase 5C |
| **Consent Forms (e-sign)** | Yes, expiration tracking | Yes, version control | Yes | Yes (add-on) | Phase 5A |
| **POS Barcode Scanning** | Hardware scanners | Hardware scanners | Hardware scanners | Hardware scanners | Phase 4B |
| **Split Payments** | Yes | Yes, multi-client | Yes | Yes | Phase 4B |
| **Inventory Management** | Basic | Enterprise-grade | Yes | Yes | Phase 4B |
| **Purchase Orders** | Limited | Full PO system | Basic | Yes | Phase 4B |
| **Commission Structures** | Basic | Advanced (tiered) | Configurable | Configurable | Already built (timetracker) |
| **2-Way RCS/SMS** | Strong (core Podium) | Yes | Yes | Yes (add-on) | Phase 1C |
| **Multi-Channel (WhatsApp)** | No | No | No | No | Phase 2+ (Twilio) |
| **AI Auto-Responder** | No | No | No | No | Phase 3 |
| **Custom CRM** | Basic | Yes | Yes | Yes | Phase 1C |
| **Loyalty Programs** | Yes | Yes, tiered | Yes | Yes | Phase 3 |
| **HIPAA Compliant** | Yes, BAA included | Yes, SOC 2 + BAA | Yes, BAA | Add-on required | Phase 5 (Supabase Teams) |

### Pricing Comparison (Updated)

| Platform | Monthly Cost | Model | Contract |
|---|---|---|---|
| **Vagaro** | $30-85 + add-ons | Per-user | Month-to-month |
| **Boulevard** | $175-475 | Per-location, tiered | No (lower tiers) |
| **Podium Aesthetics** | $350-500+ | Per-location, custom | Likely annual |
| **Zenoti** | $300-500+ | Per-location, enterprise | Annual/multi-year |
| **Our Custom (Phases 1-4)** | **$64-241** | **Flat** | **None** |
| **Our Custom (Full w/ EMR)** | **$640-825** | **Flat** | **None** |

### Key Insight

Our custom build costs more than Vagaro but provides features none of these platforms offer: branded RCS messaging with rich cards and quick-reply buttons (auto SMS fallback), AI auto-responder, multi-channel messaging (WhatsApp via Twilio), custom face/body mapping with full data ownership, and zero vendor lock-in. The full EMR phase is expensive due to Supabase Teams ($599/mo), but this should be weighed against what Aesthetic Record costs (verify current AR subscription to calculate net savings).

---

## 17. Recommended Architecture & Cost Summary

### GitHub Repos & Local Workspace

Three repos under `github.com/5niurb/`:

| Repo | Purpose | Deploys To |
|---|---|---|
| `lemedspa-website` | Marketing site (Phase 1B) — vanilla HTML/CSS/JS | Netlify (free) |
| `lm-app` | Platform app (Phase 1A, 1C, 2-5) — SvelteKit + Express | Cloudflare Pages + Render |
| `lm-docs` | Research, guides, brand docs — markdown only | N/A (reference only) |
| `timetracker` | Payroll PWA (existing) — Express + Supabase | Render |

Large binary assets (raw photos ~400MB, PDFs, business cards) stay local / cloud-synced, NOT in git. Web-optimized images go in `lemedspa-website/img/`.

> See **lm-webapp.guide.md §7** for full local workspace layout, repo contents, setup commands, and multi-device workflow.

### Architecture Overview

```
[lemedspa.com - Netlify]            [LM App - Cloudflare Pages]
  Static marketing site               SvelteKit PWA
  Booking widget (Cal.com embed)       Staff dashboard: calls, voicemail, SMS, CRM
  Chat widget                          Client portal: book, pay, chat, profile

                    [Express API - Render $7/mo]
                      /webhooks/voice/* (Twilio call events, TwiML responses)
                      /webhooks/sms/* (Twilio SMS/Conversations events)
                      /api/calls (call log CRUD)
                      /api/voicemails (voicemail CRUD + audio)
                      /api/conversations (unified inbox - Twilio Conversations API)
                      /api/clients (CRM CRUD)
                      /api/bookings (Cal.com webhooks)
                      /api/payments (Stripe webhooks)
                      /api/ai (GPT-4o-mini / Claude Haiku)

                    [Supabase - $25/mo]
                      PostgreSQL (clients, call_logs, voicemails, messages, bookings)
                      Auth (email, phone OTP, social login)
                      Realtime (live updates: new calls, new messages, new voicemails)
                      Storage (voicemail MP3s, photos, consent forms)
                      Edge Functions (lightweight handlers)
                      pg_cron (scheduled reminders, follow-ups)

[Twilio]          [Cal.com]         [Stripe]        [Resend]      [Brevo]
Voice + SMS       Booking engine    Payments        Transactional  Marketing
Conversations     Self-hosted       Processing      email (exist)  email
~$30/mo           $7-15/mo          fees only        $0-20/mo       $0-18/mo

[Umami]           [Trigger.dev]     [GPT-4o-mini / Claude Haiku]
Analytics         Background jobs   AI automation
Free              Free (50K/mo)     ~$8-23/mo

[Aesthetic Record - EMR]            [M365 + Google Workspace]
  Clinical records (Phase 5 replace)   Calendar sync, email, docs
  Keep for now, custom EMR later       NOT being replaced
```

### Finalized Tech Stack Decisions

| Decision | Choice | Status |
|---|---|---|
| Frontend framework | **SvelteKit** | **DECIDED** |
| CPaaS provider | **Twilio (direct)** | **DECIDED** |
| UI components | shadcn-svelte + Tailwind | Decided |
| Mobile strategy | PWA first, Capacitor later | Decided |
| Frontend hosting | Cloudflare Pages | Decided |
| Backend | Express on Render | Decided |
| Database | Supabase PostgreSQL | Decided |
| Auth | Supabase Auth | Decided |
| Booking | Cal.com self-hosted | Decided |
| Payments | Stripe | Decided |
| Transactional email | Resend (existing) | Decided |
| Marketing email | Brevo | Decided |
| AI models | GPT-4o-mini + Claude Haiku | Decided |
| Analytics | Umami self-hosted | Decided |
| POS | Stripe Terminal + barcode scanner | Decided |
| Inventory | Custom Supabase tables + lot tracking | Decided |
| EMR (current) | Aesthetic Record (keep for Phases 1-4) | Decided |
| EMR (future) | Custom build on Supabase Teams (Phase 5) | Planned |

### Phased Implementation (Re-prioritized)

> Phase 1 covers three immediate wins: **1A** = Call Logging (HighLevel replacement), **1B** = Website Redesign (SquareSpace replacement, saves $36/mo), **1C** = Lead Management, Patient Journey & Automated RCS/SMS Communications (TextMagic replacement + patient journey automation).

#### Phase 1A: Call Logging & Voicemail (Week 1-3) -- HIGHEST PRIORITY

| Component | Choice | Monthly Cost |
|---|---|---|
| Frontend framework | SvelteKit + shadcn-svelte + Tailwind | $0 |
| Frontend hosting | Cloudflare Pages | $0 |
| Backend API | Express on Render | $7/mo |
| Database + Auth + Realtime | Supabase Pro | $25/mo |
| Voice provider | Twilio (direct, Voice API + TwiML) | ~$12-14/mo |
| Call routing, voicemail, call log dashboard | Custom (Express + Supabase) | $0 |
| **Phase 1A Total** | | **~$44-46/mo** |

**Deliverable**: Staff dashboard where they can see all inbound/outbound calls, play voicemails, log dispositions, and manage routing rules. Replaces HighLevel for call management.

#### Phase 1B: Website Redesign (Week 2-5)

| Component | Choice | Monthly Cost |
|---|---|---|
| Design | Vanilla HTML/CSS/JS — minimalist, narrative-driven | $0 |
| Hosting | Netlify (free tier) | $0 |
| Forms | Netlify Forms | $0 |
| Domain | lemedspa.com (existing) | Already paid |
| Care instruction pages | Static HTML (serves Phase 1C automation) | $0 |
| **Phase 1B Total** | | **$0/mo** |
| **SquareSpace eliminated** | | **-$36/mo savings** |

##### Brand Positioning & Core Principles

The website must communicate these five brand truths immediately:

1. **Exclusive, high-end environment** — We operate in a beautiful, luxurious space. It is an honor to be treated here. No room for rudeness or low-effort energy.
2. **Unapologetic point of view** — Cult-like following, not shy about what makes us special, different, and better. Strong brand voice with conviction.
3. **Best at what we do** — Celebrities and the top 1% come to us because we are the best. Proof through social validation (IG posts, reviews, before/after).
4. **Fair, not cheap** — You get what you pay for. No bargaining, no coupons. Premium pricing reflects premium outcomes.
5. **Integrity over sales** — We will not sell you something we don't believe will work. If you insist, we'll be honest about the likelihood of noticeable improvement.

##### Key Differentiators (What Makes LeMedSpa Different)

| Differentiator | Detail |
|---|---|
| **Lea Culver is patient #1** | Director of Aesthetics / owner has been doing this for 20+ years. She is passionate about finding the best treatments for herself and her extended family first — you benefit from her personal research. |
| **Relentless R&D** | Conferences, partnerships, global research (Korea/Asia). We do the work to find treatments that *actually work* — not just those with the most publicity or corporate backing. |
| **Female owned & operated** | Promotes beauty and strength for women of all ages and the men in their lives. Target: 30+ women who are successful and discerning. Treatment plans developed primarily by females, for females. |
| **Selective entry** | To maintain a positive, peaceful, intimate, supportive, and exclusive environment, LeMedSpa is selective about who enters its extended family. Bad or unknown vibes are not welcome, regardless of status or wealth. |
| **Aesthetics-first, not clinical** | Skin-first approach with personal touch and bespoke care. Different from larger doctor's offices (more personal) and smaller nurse-run spas (broader offerings). |
| **Patient-experience first** | No brand favoritism. We curate top picks across the entire industry — representation from a variety of brands based on what works, not vendor relationships. |

##### Design Direction

**Primary inspiration**: [Matt Morris Wines](https://mattmorriswines.com/) — narrative-driven, minimalist, full-bleed imagery, deliberate pacing, scroll-based storytelling, polaroid/candid photography feel. The landing page unfolds a story as you scroll.

**Supporting inspirations:**
- [Valeria Monis](https://www.valeriamonis.com/) — beautifully simple, generous whitespace, grid-based, smooth transitions, layered depth
- [Aesop](https://www.aesop.com/) — elegant, warm muted tones, video backgrounds, three-column grid, serif + sans-serif pairing (Suisse Int'l + Optima), monochromatic harmony, calm motion design
- [Pure Cosmetics](https://purecosmetics.com/) — impactful, vivid product photography, clean hierarchy, decisive CTAs

**Design synthesis — what to take from each:**

| Element | Inspiration | Apply To LeMedSpa |
|---|---|---|
| Scroll-based storytelling | Matt Morris Wines | Landing page narrative: brand story unfolds as you scroll |
| Polaroid/candid photography | Matt Morris Wines | Candid shots of Lea, practitioners, patients, conferences |
| Generous whitespace + simplicity | Valeria Monis | Overall layout — let content breathe, minimal clutter |
| Warm muted tones + video backgrounds | Aesop | Hero sections, ambient video of the space |
| Serif + sans-serif type pairing | Aesop | Headings in elegant serif, body in clean sans-serif |
| Vivid product photography | Pure Cosmetics | Product wall, device showcase, treatment close-ups |
| Decisive black CTAs | Pure Cosmetics | "Book Consultation", "Explore Services" buttons |

**Color palette evolution**: Move away from current dark-on-dark (#0a0a0a bg + #d4af37 gold). New direction: warm, muted, sophisticated — think cream/ivory backgrounds with dark text, subtle gold or warm bronze accents, occasional rich dark sections for contrast. More Aesop, less nightclub.

##### Landing Page Structure

First-time visitors see a minimalist, scroll-based narrative. The page is intentionally sparse at the top and reveals depth as they scroll.

```
┌─────────────────────────────────────────────┐
│ HERO                                         │
│ Full-bleed cinematic image or ambient video   │
│ of the space. Minimal text overlay:           │
│ "LE MED SPA" + one-line ethos.               │
│ No nav clutter — just logo + hamburger menu. │
│ Subtle scroll indicator ↓                    │
├─────────────────────────────────────────────┤
│ SECTION 1: WHO WE ARE                        │
│ 2-3 sentences. "We are a private wellness    │
│ sanctuary..." Candid photo of Lea at work.   │
│ Confident, unapologetic tone.                │
├─────────────────────────────────────────────┤
│ SECTION 2: WHAT MAKES US DIFFERENT           │
│ Scroll-reveal cards (3-4 differentiators).   │
│ Polaroid-style candid photos paired with     │
│ short, punchy copy. Conference shots, R&D,   │
│ Lea with patients. Korean beauty research.   │
├─────────────────────────────────────────────┤
│ SECTION 3: THE SPACE                         │
│ Full-bleed gallery or ambient video.          │
│ Coffee bar, treatment rooms, product wall,   │
│ device wall. Let the space speak for itself. │
├─────────────────────────────────────────────┤
│ SECTION 4: SOCIAL PROOF                      │
│ Curated IG posts from real patients/celebs.  │
│ Yelp + Google review highlights.             │
│ Star ratings prominently displayed.          │
│ "The 1% trust us" without saying it overtly. │
├─────────────────────────────────────────────┤
│ SECTION 5: OUR SERVICES (PREVIEW)            │
│ 3-4 hero services with stunning imagery.     │
│ "Explore All Services →" CTA                 │
├─────────────────────────────────────────────┤
│ SECTION 6: VENDOR LOGO CLOUD                 │
│ Trusted by the best — logo grid of all       │
│ product/device brands we carry.              │
├─────────────────────────────────────────────┤
│ SECTION 7: CTA                               │
│ "Ready to join the family?"                  │
│ Book Consultation button.                    │
│ Phone number. Location.                      │
└─────────────────────────────────────────────┘
```

##### Site Map (Public-Facing Pages)

| Page | Purpose | Notes |
|---|---|---|
| **/** | Landing page / About | Scroll-based narrative (detailed above). Brand story, differentiators, social proof, space, services preview. |
| **/testimonials** | Social proof hub | Yelp reviews, Google reviews, IG posts/stories from real users, before/after (with consent), ratings badges. Links to external review profiles. |
| **/services** | Service catalog | Single page with all major services. Each service has accordion "+" to reveal bullets. Each links to a dedicated sub-page. |
| **/services/[service]** | Individual service pages | Deep dive per service. Doubles as ad landing page and patient care link target. Hero image, description, what to expect, pricing indication, CTA. |
| **/skincare** | Product catalog | Curated product selection. Product photography. No full e-commerce yet (link to booking or in-person). |
| **/insights** | Blog | R&D findings, "hidden gem" treatments, conference takeaways, Korean beauty research. IG feed integration. |
| **/contact** | Contact & location | Map, hours, phone, form. Netlify Forms. |
| **/care/[service]-pre** | Pre-treatment instructions | Static pages linked from Phase 1C automated messages. Expandable "+" detail sections with visuals. |
| **/care/[service]-post** | Post-treatment instructions | Static pages linked from Phase 1C automated messages. What's normal, restrictions, recovery timeline. |

##### Featured Devices (for device wall / content)

- Cynosure Lutronic Ultra
- Cynosure Lutronic XERF
- Sofwave
- Sylfirm X
- Alma Soprano Titanium

##### Social Proof Sources

| Source | URL / Notes |
|---|---|
| Yelp | https://www.yelp.com/biz/lemed-spa-encino (32+ reviews, 5-star) |
| Google Reviews | Search: "LeMed Spa" Encino |
| Instagram | Stories, posts, reposts from actual patients/clients |
| Celebrity/VIP | Photos with notable clients (need to gather) |

##### Visual Asset Checklist (To Gather/Create)

| Asset Type | Examples | Priority |
|---|---|---|
| **Candid action photos** | Lea Culver with patients, at conferences, doing treatments | 🔴 High |
| **Practitioner photos** | Nurses, NPs at work — warm, candid, not staged | 🔴 High |
| **Space photography** | Coffee bar, treatment rooms, waiting area, overall luxury vibe | 🔴 High |
| **Product wall** | Curated skincare display, beautifully lit | 🟡 Medium |
| **Device wall / in-use** | Sofwave, Sylfirm X, Lutronic devices in action + standing | 🟡 Medium |
| **Celebrity/VIP photos** | Lea with high-profile clients (if available) | 🟡 Medium |
| **IG screenshots/embeds** | Real patient stories, before/after, testimonials | 🔴 High |
| **Vendor logos** | All product/device brand logos for logo cloud | 🟡 Medium |
| **Ambient video** | Short clips of the space — coffee being made, treatments, atmosphere | 🟢 Nice-to-have (can add later) |

**Deliverable**: Minimalist, narrative-driven marketing site on Netlify that communicates LeMedSpa's brand positioning through scroll-based storytelling, candid photography, and confident copy. Service pages with accordion details + dedicated sub-pages that double as ad landing pages and automation link targets. Social proof integration (Yelp, Google, IG). Pre/post-care instruction pages ready for Phase 1C automation. No SquareSpace dependency. Saves $36/mo ($432/yr).

#### Phase 1C: Lead Management, Patient Journey & Automated Communications (Week 4-10)

| Component | Choice | Monthly Cost |
|---|---|---|
| RCS + SMS provider | Twilio (same Programmable Messaging API, RCS primary with auto SMS fallback) | ~$15-20/mo |
| 10DLC registration | Required (transactional + marketing campaigns) | ~$2-10/mo |
| RCS sender registration | Twilio-managed carrier onboarding | One-time carrier fees |
| Unified inbox (calls + RCS/SMS + future WhatsApp) | Twilio Conversations + Supabase Realtime | $0 |
| CRM (client records, lead pipeline, journey tracking) | Custom Supabase tables | $0 |
| Transactional email (confirmations, reminders, forms) | Resend (existing) | $0 |
| Background jobs / scheduled sends | pg_cron + Trigger.dev | $0 |
| Content repository (instructions, forms, questionnaires) | Supabase + static pages on lemedspa.com | $0 |
| E-signature for consent forms | signature_pad (MIT) | $0 |
| **Phase 1C Additional** | | **~$17-30/mo** |

**Phase 1C is the largest Phase 1 sub-phase.** It replaces TextMagic, Zapier, and Make, and builds the core patient journey automation that differentiates a med spa app from a generic CRM. All outbound messages use **RCS as the primary channel** (branded sender, read receipts, quick-reply buttons, rich cards) with automatic SMS fallback for devices that don't support RCS (~10% of US phones). Same Twilio API — no separate integration needed.

##### 1C.1 — 2-Way RCS/SMS & Unified Inbox (Week 4-5)

- Staff send/receive messages from business number in the app (RCS primary, auto SMS fallback)
- RCS benefits: branded sender (Le Med Spa logo + colors), read receipts, typing indicators, quick-reply buttons, image carousels, no 160-char limit
- Message threads linked to client records (Twilio Conversations API)
- Call history + message history visible on same client profile
- Conversation assignment (which staff member owns which thread)
- Twilio Conversations architecture enables future WhatsApp/web chat via dashboard toggle
- RCS sender profile registration: business name, logo, brand color, description (Twilio manages carrier onboarding)

##### 1C.2 — Lead Tracking & Pipeline (Week 5-6)

- **Lead stages**: New → Contacted → Consultation Booked → Consultation Completed → Treatment Booked → Treated → Rebooking → Active Client
- Kanban-style pipeline view for staff (drag leads between stages)
- Lead source tracking (website form, phone call, walk-in, referral, social media)
- Lead scoring (rule-based, see §7 above)
- **Automated staff reminders**: When a lead sits in a stage too long (configurable), alert assigned staff via in-app notification + optional SMS
- **Automated lead nurture**: Configurable drip sequences (e.g., Day 1: "Thanks for your inquiry", Day 3: "Here are popular treatments", Day 7: "Ready to book?")
- Conversion tracking: lead → booked → paid → rebooking rates

##### 1C.3 — Service Content Repository (Week 6-7)

A per-service content library that powers all downstream automation. Each service in the system has configurable content blocks:

| Content Type | Purpose | Format |
|---|---|---|
| **Pre-treatment instructions** | What to do/avoid before appointment | Structured text + static page |
| **Post-treatment instructions** | Aftercare, restrictions, expectations | Structured text + static page |
| **Consent forms** | Required signatures before treatment | Digital form + e-signature |
| **Questionnaires** | Health history, skin concerns, goals | Dynamic form |
| **FAQ / What to Expect** | Procedure details, recovery timeline | Static page with expandable sections |

**Static instruction pages on lemedspa.com** (ties into Phase 1B website):
- Each service gets a clean instruction page at e.g. `lemedspa.com/care/botox-pre` and `lemedspa.com/care/botox-post`
- SMS/email messages contain a brief summary + link to the full page
- Pages use expandable accordion ("+") sections for detailed explanations with visuals
- Mobile-first, matches brand aesthetic, loads fast (static HTML on Netlify)
- Pages are public but non-indexed (no SEO) — they're informational, not marketing

**Initial service content to develop** (based on current service menu):

| Service Category | Services | Content Needed |
|---|---|---|
| Advanced Aesthetics | Neuromodulators (Botox/Dysport), Dermal Fillers, Skin Refinement (peels, laser, microneedling) | Pre-instructions, post-instructions, consent, questionnaire |
| Regenerative Wellness | IV Nutrient Therapy, Bioidentical Hormones, Body Contouring | Pre-instructions, post-instructions, consent, questionnaire |
| Bespoke Treatments | Signature Protocol, Executive Wellness | Pre-instructions, post-instructions, consent, questionnaire |

##### 1C.4 — Booking Confirmation & Pre-Treatment Automation (Week 7-8)

Triggered when a booking is confirmed (integrates with Phase 2 booking engine, but the automation framework is built here):

| Timing | Channel | Content |
|---|---|---|
| **Immediately** | RCS/SMS + Email | Booking confirmation rich card: date, time, service, location, what to bring. RCS: branded card with "Add to Calendar" and "Get Directions" buttons |
| **Immediately** | Email | Link to required consent form(s) + questionnaire for the booked service |
| **7 days before** | Email | Detailed pre-treatment instructions (full page link) |
| **3 days before** | RCS/SMS + Email | Reminder: stop restricted medications, avoid sun exposure, specific prep for service. RCS: quick-reply buttons ("✅ Got it", "❓ Questions", "📅 Reschedule"). Includes questions ("Are you currently on blood thinners?", "Have you had sun exposure in the last 48 hours?") |
| **3 days before** | RCS/SMS + Email | "What to expect" overview — procedure, duration, initial results timeline, link to detailed page |
| **1 day before** | RCS/SMS | Final reminder: appointment time, address, parking. RCS: "Reschedule" and "Cancel" action buttons |
| **2 hours before** | RCS/SMS | "See you soon" with any last-minute reminders |

- All automated sends are configurable per service (admin can adjust timing, enable/disable each touchpoint)
- Messages contain a **brief summary** (2-3 sentences) + **link to full instruction page** on lemedspa.com
- RCS messages leverage rich cards, quick-reply buttons, and branded sender — falls back to plain SMS with link for ~10% of devices
- **Read receipts** (RCS) let staff see which messages were actually read, not just delivered
- Staff can see which messages have been sent/read/opened per client in the timeline view
- If consent form or questionnaire is not completed 24h before appointment, auto-nudge is sent

##### 1C.5 — Post-Treatment Automation & Follow-Up (Week 8-9)

Triggered after treatment is marked complete:

| Timing | Channel | Content |
|---|---|---|
| **Immediately** | RCS/SMS + Email | Thank you + post-care summary (brief) + link to full post-care instructions page. RCS: branded card with "View Post-Care Guide" button |
| **1 day after** | RCS/SMS | "How are you feeling?" check-in. RCS: quick-reply buttons ("😊 Great", "😐 Some concerns", "📞 Need to call"). Reminder of what's normal vs. what to call about |
| **3 days after** | RCS/SMS | Recovery expectations, activity restrictions still in effect, encourage hydration/care |
| **7 days after** | Email | Full recovery check-in, before/after expectations, "when to book your follow-up" |
| **14 days after** | RCS/SMS | Results timeline reminder ("you should start seeing full results around now"). RCS: "Book Follow-Up" button |
| **30 days after** | Email | Rebooking prompt + loyalty/membership mention |

- Post-care pages on lemedspa.com include: what's normal, warning signs, activity restrictions with timelines, product recommendations
- Expandable "+" sections for detailed medical explanations (for patients who want more detail)
- RCS read receipts give staff visibility into which post-care messages were actually read (important for liability)
- Each service's post-care automation is independently configurable

##### 1C.6 — Appointment Modification & Cancellation (Week 9-10)

- RCS: dedicated "Reschedule" and "Cancel" action buttons in reminder messages (no need to type — one tap)
- SMS fallback: "Reply RESCHEDULE or CANCEL"
- Twilio webhook parses reply → offers alternative times or confirms cancellation
- Cancellation triggers: reason capture (RCS: quick-reply options for common reasons), optional rebooking prompt, staff notification
- No-show handling: automated follow-up ("We missed you today, would you like to reschedule?")
- Cancellation policy reminder in confirmation messages

##### Phase 1C Database Additions

```sql
-- Service content repository
CREATE TABLE service_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID REFERENCES services(id),
  content_type TEXT NOT NULL,        -- pre_instructions, post_instructions, consent_form, questionnaire, faq
  title TEXT NOT NULL,
  summary TEXT,                       -- brief version for SMS/email (2-3 sentences)
  page_slug TEXT,                     -- e.g., 'botox-pre' → lemedspa.com/care/botox-pre
  content_json JSONB,                 -- structured content blocks (accordion sections, visuals, etc.)
  version INT DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Lead pipeline stages and automation rules
CREATE TABLE lead_pipeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  current_stage TEXT NOT NULL,        -- new, contacted, consultation_booked, consultation_completed, treatment_booked, treated, rebooking, active
  assigned_to UUID,                   -- staff member
  source TEXT,                        -- website, phone, walk_in, referral, social
  entered_stage_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Automation sequences (configurable per service)
CREATE TABLE automation_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID REFERENCES services(id),
  trigger_event TEXT NOT NULL,        -- booking_confirmed, pre_appointment, post_treatment, lead_nurture, no_show
  timing_offset INTERVAL NOT NULL,    -- e.g., '-3 days', '+1 day', '+30 days'
  channel TEXT NOT NULL,              -- sms, email, both
  template_type TEXT NOT NULL,        -- confirmation, pre_instructions, reminder, post_care, check_in, rebooking
  content_ref UUID REFERENCES service_content(id),  -- links to the content to send
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0
);

-- Sent message log (tracks what was sent to whom and when)
CREATE TABLE automation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  booking_id UUID,
  sequence_id UUID REFERENCES automation_sequences(id),
  channel TEXT NOT NULL,
  status TEXT DEFAULT 'sent',         -- scheduled, sent, delivered, opened, failed
  sent_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB                      -- twilio message SID, resend ID, etc.
);

-- Consent form submissions (extends existing consent_forms table)
CREATE TABLE consent_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  booking_id UUID,
  form_id UUID REFERENCES service_content(id),
  responses JSONB,                    -- questionnaire answers
  signature_data TEXT,                -- signature_pad output (base64 PNG or SVG)
  signed_at TIMESTAMPTZ,
  ip_address INET,
  user_agent TEXT
);
```

**Deliverable**: Full patient journey management — from first inquiry through treatment and rebooking. Lead pipeline with automated nurture sequences. 2-way RCS/SMS inbox with branded rich messaging (quick-reply buttons, rich cards, read receipts, auto SMS fallback). Per-service content repository powering automated pre/post-treatment communications. Static care instruction pages on lemedspa.com with expandable detail sections. Consent forms and questionnaires sent in advance and tracked. Configurable automation timing per service. Replaces TextMagic + Zapier + Make and eliminates manual follow-up workflows.

#### Phase 2: Booking & Payments (Month 3-4)

| Component | Choice | Monthly Cost |
|---|---|---|
| Booking engine | Cal.com self-hosted | $7-15/mo |
| Payments | Stripe | Processing fees only |
| Memberships | Stripe Billing | +0.5% of recurring |
| Transactional email | Resend (existing) | $0-20/mo |
| **Phase 2 Additional** | | **$7-35/mo** |

#### Phase 3: AI & Marketing Automation (Month 4-5)

| Component | Choice | Monthly Cost |
|---|---|---|
| AI auto-responder (SMS/chat) | Claude Haiku | $0.15/mo |
| Follow-up generation | GPT-4o-mini | $2-5/mo |
| Marketing email | Brevo free | $0 |
| Content generation | GPT-4o | $5-15/mo |
| Background jobs | Trigger.dev free | $0 |
| Analytics | Umami self-hosted | $0 |
| **Phase 3 Additional** | | **$8-20/mo** |

#### Phase 4A: Advanced Features (Month 5-6)

| Component | Choice | Monthly Cost |
|---|---|---|
| Native iOS/Android app | Capacitor.js wrapper | $99/yr Apple + $25 Google |
| AI voice agent (after-hours) | Vapi | $30-100/mo |
| Business intelligence | Metabase self-hosted | $0 |
| **Phase 4A Additional** | | **$30-110/mo** |

#### Phase 4B: POS & Inventory (Month 6-8)

| Component | Choice | Monthly/One-Time Cost |
|---|---|---|
| Barcode scanner | Tera HW0002 (USB) | $25 one-time |
| Payment terminal | Stripe Terminal Reader M2 | $59 one-time |
| Tablet/display | iPad or similar | ~$250 one-time |
| POS checkout (SvelteKit) | Custom build | $0 |
| Inventory management | Custom Supabase tables | $0 |
| Lot/batch tracking | Custom (injectables) | $0 |
| **Phase 4B Hardware** | | **~$334 one-time** |

> See **lm-pos-inventory.research.md** for full POS and inventory research.

#### Phase 5: EMR / Clinical Features (Month 9-17)

| Component | Choice | Monthly Cost |
|---|---|---|
| Supabase Teams (HIPAA BAA) | Upgrade from Pro | +$574/mo |
| Custom anatomical SVG diagrams | One-time commission | $300-500 one-time |
| SOAP notes + consent forms | Custom build | $0 |
| Face/body mapping | SVG + click-to-annotate | $0 |
| Photo management | Supabase Storage | +$3-10/mo |
| signature_pad library | MIT license | $0 |
| Puppeteer (PDF generation) | Apache 2.0 | $0 |
| **Phase 5 Additional** | | **~$577-584/mo** |

> **Phase 5 sub-phases**: 5A (SOAP notes, consent, medical history) → 5B (face/body mapping, lot tracking) → 5C (photo management) → 5D (patient portal clinical) → 5E (Aesthetic Record migration)

### Total Monthly Cost by Phase

| Phase | Monthly Cost | What It Replaces |
|---|---|---|
| Phase 1A (calls + voicemail) | ~$44-46 | HighLevel ($97-497/mo) |
| Phase 1A+1B (+ website redesign) | ~$44-46 | + SquareSpace ($36/mo saved) |
| Phase 1A+1B+1C (+ SMS + CRM) | ~$61-76 | + TextMagic + Zapier + Make |
| + Phase 2 (+ booking + payments) | ~$68-111 | Potential Mangomint replacement |
| + Phase 3 (+ AI + marketing) | ~$76-131 | Full platform minus mobile app |
| + Phase 4A (+ mobile + voice AI) | ~$106-241 | Full non-clinical platform |
| + Phase 4B (+ POS + inventory) | ~$106-241 | + Aesthetic Record checkout |
| + Phase 5 (+ EMR) | ~$640-825 | **Everything including Aesthetic Record** |

### Comparison to Current + Commercial Alternatives

| Platform | Monthly Cost | Per-Provider Fees | Data Ownership | Customization |
|---|---|---|---|---|
| **Current stack (HighLevel+TextMagic+Make+Zapier+SquareSpace+AR)** | **~$286-786** | **Varies** | **Scattered** | **Limited** |
| **Our Custom (Phases 1-4)** | **$64-241** | **None** | **Full** | **Unlimited** |
| **Our Custom (Full w/ EMR)** | **$640-825** | **None** | **Full** | **Unlimited** |
| GlossGenius | $24-48 | None | None | Limited |
| Vagaro | $25-85 | Per-provider add-ons | Limited | Limited |
| Mindbody | $139-699 | Per-provider | None | Very limited |
| Mangomint | $165-375 | None (per-location) | Limited | Moderate |
| Boulevard | $175-475 | Per-provider | Limited | Moderate |
| Podium Aesthetics | $350-500 | Custom | Limited | Limited |
| Zenoti | $300-500 | Enterprise | Limited | Moderate |

### Key Decisions Summary

| Decision | Choice | Rationale |
|---|---|---|
| Website redesign (Phase 1B) | **Vanilla HTML/CSS/JS on Netlify** | Simpler, focused on top services, replaces SquareSpace ($36/mo → $0/mo) |
| Frontend framework | **SvelteKit** | Smallest bundles, built-in PWA, simpler than React for small team |
| UI components | shadcn-svelte + Tailwind | Free, clean, customizable |
| Mobile strategy | PWA first, Capacitor later | Fastest to market, App Store when ready |
| Frontend hosting | Cloudflare Pages | Unlimited free bandwidth, $5/mo flat |
| Backend | Express on Render | Already familiar, $7/mo always-on |
| Database | Supabase PostgreSQL | Already in use, real-time, auth, storage included |
| Auth | Supabase Auth | 50K MAU free, integrated |
| **Voice + RCS/SMS + Multi-Channel** | **Twilio (direct)** | **Best HIPAA, best SDK, Conversations API for unified threading. RCS now GA (Aug 2025) — branded rich messaging as default channel, auto SMS fallback** |
| Booking | Cal.com self-hosted | Free software, full API, white-label |
| Payments | Stripe | Best developer tools, Billing for memberships |
| Chat | Twilio Conversations + Supabase Realtime | Unified threading across SMS/WhatsApp/web chat, real-time UI updates |
| Transactional email | Resend | Already configured |
| Marketing email | Brevo | Generous free tier, automation builder |
| AI models | GPT-4o-mini + Claude Haiku | Pennies per interaction |
| Analytics | Umami self-hosted | Free, privacy-friendly, matches stack |
| Background jobs | pg_cron + Trigger.dev | Free tiers cover spa workload |
| File storage | Supabase Storage + Cloudflare R2 | Start simple, scale cheap |
| POS hardware | Stripe Terminal M2 + USB barcode scanner | $84 total, works with web app |
| Lead pipeline (Phase 1C) | Custom Supabase + Kanban UI | Stage-based tracking, lead scoring, automated nurture drips |
| Patient journey automation (Phase 1C) | pg_cron + Trigger.dev + Twilio + Resend | Configurable per-service pre/post-treatment SMS/email sequences |
| Service content repository (Phase 1C) | Supabase JSONB + static pages on Netlify | Per-service instructions, consent forms, questionnaires; SMS links to expandable detail pages |
| Consent forms / e-signature (Phase 1C) | signature_pad + Supabase | Digital consent with signature capture, pre-appointment delivery |
| Inventory | Custom Supabase tables | Lot tracking, backbar, vendor management |
| EMR (Phases 1-4) | Aesthetic Record (keep) | Don't distract from core platform build |
| EMR (Phase 5) | Custom build + Supabase Teams | Full data ownership, replaces AR long-term |
| HIPAA (Phase 5) | Supabase Teams BAA + Twilio BAA | $599/mo for database, Twilio BAA included |

---

> **Note**: All pricing reflects published rates as of early 2025-2026. Verify current pricing on each provider's website before committing, as this space evolves quickly -- AI pricing in particular trends downward.
>
> **Additional research documents:**
> - **lm-pos-inventory.research.md** -- Detailed POS barcode scanning, Stripe Terminal, inventory schema, checkout workflow design
> - **lm-webapp.guide.md** -- How to work with Claude Code to build this platform
