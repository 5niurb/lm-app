# Contacts / CRM

**Route:** `/contacts`
**Status:** Active
**Last Updated:** 2026-02-15

## Overview

Contact management (CRM) for all patients, leads, and callers. Supports search, tags, quick actions, and auto-creation from inbound calls and website form submissions.

## User Stories

### US-001: View and search contacts
**As a** staff member, **I want to** browse and search all contacts, **so that** I can find patient/lead information.
**Priority:** P0
**Status:** Implemented

#### Acceptance Criteria
- [x] AC-1: Contacts displayed in a list with name, phone, tags, source, last contact date
- [x] AC-2: Search by name, phone number, or email
- [x] AC-3: Pagination with page controls
- [x] AC-4: Filter by tags (patient, lead, unknown, VIP, etc.)

---

### US-002: Quick actions on contacts
**As a** staff member, **I want to** quickly call or message a contact, **so that** I can act immediately.
**Priority:** P1
**Status:** Implemented

#### Acceptance Criteria
- [x] AC-1: Call icon (green phone) links to `/softphone?call=<phone>` (auto-dials)
- [x] AC-2: Message icon (blue) links to `/messages?phone=<phone>&name=<name>&new=true`
- [x] AC-3: Icons visible on hover for each contact row
- [x] AC-4: Message link includes contact name for smart conversation routing

---

### US-003: Auto-create contacts from calls
**As the** system, **I want to** create contact records for unknown callers, **so that** no caller is lost.
**Priority:** P0
**Status:** Implemented

#### Acceptance Criteria
- [x] AC-1: Unknown callers auto-created with 'unknown' tag
- [x] AC-2: Caller ID name captured when available
- [x] AC-3: Caller city/state stored in metadata
- [x] AC-4: Contact can be promoted to 'lead' or 'patient' later

---

### US-004: Website form submissions create leads
**As the** system, **I want to** create contacts from website form submissions, **so that** leads are captured.
**Priority:** P1
**Status:** Implemented

#### Acceptance Criteria
- [x] AC-1: Website contact form posts to `/api/webhooks/contact-form`
- [x] AC-2: Creates contact with 'lead' tag and 'website_form' source
- [x] AC-3: Deduplicates by email/phone

---

## Design Specifications

### Layout
- Full-width card with search + tag filter bar
- Contact list with expandable/clickable rows
- Quick action icons per row

### Visual Style
- **Tags:** Color-coded badges (patient=gold, lead=blue, unknown=gray, VIP=purple)
- **Contact indicator:** Gold diamond for known contacts
- **Quick actions:** Emerald call + blue message icons on hover

## API Dependencies
- `GET /api/contacts?search=&tags=&page=&pageSize=` — Contact list
- `POST /api/contacts` — Create contact
- `PATCH /api/contacts/:id` — Update contact
- `POST /api/webhooks/contact-form` — Website form submission

## Revision History
| Date | Change | Prompted By |
|------|--------|-------------|
| 2026-02-12 | Initial contacts page with search, tags, quick actions | Phase 1A build |
| 2026-02-15 | Message link now includes contact name param | Follow-up to message action fix |
