-- Migration 006: Add voicemail preservation columns
-- Allows users to save voicemails permanently (downloads to Supabase Storage)

ALTER TABLE public.voicemails
  ADD COLUMN IF NOT EXISTS preserved BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS storage_path TEXT;

COMMENT ON COLUMN public.voicemails.preserved IS 'When true, recording has been downloaded to Supabase Storage for permanent keeping';
COMMENT ON COLUMN public.voicemails.storage_path IS 'Path in Supabase Storage bucket where the preserved recording is stored';

CREATE INDEX IF NOT EXISTS idx_voicemails_preserved ON public.voicemails(preserved) WHERE preserved = true;
