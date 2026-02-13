-- Migration: add contacts table, caller_name column, contact matching
-- Applied: 2026-02-13

-- Add caller_name to call_logs for CNAM lookup data
ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS caller_name TEXT;

COMMENT ON COLUMN public.call_logs.caller_name IS 'Caller name from Twilio CNAM lookup or contact match';

-- Create contacts table for Google Sheet sync + manual entries
CREATE TABLE IF NOT EXISTS public.contacts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name        TEXT,
  last_name         TEXT,
  full_name         TEXT,
  phone             TEXT,
  phone_normalized  TEXT,               -- digits only for matching
  email             TEXT,
  source            TEXT
                    CHECK (source IN ('aesthetic_record', 'gohighlevel', 'textmagic', 'manual', 'google_sheet')),
  source_id         TEXT,               -- ID from the original system
  patient_status    TEXT,               -- active, inactive, prospect, etc.
  tags              TEXT[] DEFAULT '{}',
  notes             TEXT,
  metadata          JSONB DEFAULT '{}',
  last_synced_at    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.contacts IS 'Unified contact list synced from Google Sheet + other sources';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contacts_phone_normalized ON public.contacts(phone_normalized);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON public.contacts(phone);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON public.contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_full_name ON public.contacts(full_name);
CREATE INDEX IF NOT EXISTS idx_contacts_source ON public.contacts(source);

-- RLS
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read contacts"
  ON public.contacts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role full access to contacts"
  ON public.contacts FOR ALL
  TO service_role
  USING (true);

-- Add contact_id to call_logs for linking calls to known contacts
ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_call_logs_contact_id ON public.call_logs(contact_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_caller_name ON public.call_logs(caller_name);

-- Update the unheard_voicemails view to include caller_name and contact
DROP VIEW IF EXISTS public.call_logs_with_voicemails;
CREATE VIEW public.call_logs_with_voicemails AS
  SELECT
    cl.*,
    vm.id AS voicemail_id,
    vm.recording_url AS vm_recording_url,
    vm.duration AS vm_duration,
    vm.transcription AS vm_transcription,
    vm.is_new AS vm_is_new,
    vm.mailbox AS vm_mailbox,
    c.full_name AS contact_name,
    c.email AS contact_email
  FROM public.call_logs cl
  LEFT JOIN public.voicemails vm ON vm.call_log_id = cl.id
  LEFT JOIN public.contacts c ON c.id = cl.contact_id;
