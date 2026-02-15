---
paths:
  - "api/db/**/*.sql"
  - "supabase/**"
---

# Database Rules

## Supabase
- Project ID: `skvsjcckissnyxcafwyr`
- All tables in `public` schema
- RLS enabled on ALL tables — always add policies

## Schema Conventions
- Table names: snake_case, plural (`call_logs`, `voicemails`, `contacts`)
- Column names: snake_case (`created_at`, `phone_normalized`)
- Primary keys: `id UUID DEFAULT gen_random_uuid()`
- Timestamps: `created_at TIMESTAMPTZ DEFAULT now()`, `updated_at TIMESTAMPTZ DEFAULT now()`
- Phone numbers: store normalized in `phone_normalized` (E.164: +1XXXXXXXXXX)

## RLS Policies
- Every new table must have RLS enabled: `ALTER TABLE x ENABLE ROW LEVEL SECURITY`
- Service role bypasses RLS — used by API middleware
- Anon key respects RLS — used for public/patient-facing routes

## Indexes
- Always index foreign keys
- Index columns used in WHERE clauses (phone_normalized, created_at, status)
- Use GIN indexes for array columns (tags, lists) and JSONB columns

## Migration Naming
- snake_case: `add_consent_submissions_table`
- Use `apply_migration` MCP tool for DDL
- Use `execute_sql` MCP tool for DML/queries

## Key Tables
- `contacts` — CRM with tags[], lists[], source tracking
- `call_logs` — Inbound/outbound calls with disposition, duration, caller_name
- `voicemails` — Linked to call_logs, has transcription, mailbox routing
- `conversations` + `messages` — 2-way SMS messaging
- `services` — Treatment catalog
- `content_blocks` — Pre/post care instructions, consent forms, FAQs
- `automation_sequences` + `automation_log` — Message sequences
- `consent_submissions` — Signed consent forms
- `settings` — App configuration (key-value with JSONB)
- `audit_log` — All API actions (fire-and-forget)
