-- Migration: Update contacts source CHECK constraint
-- Applied: 2026-02-19
-- Reason: Add website_form, inbound_call sources; remove gohighlevel (never used)

-- Drop the old CHECK constraint and add the updated one
ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_source_check;

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_source_check
  CHECK (source IN ('aesthetic_record', 'textmagic', 'manual', 'google_sheet', 'website_form', 'inbound_call'));
