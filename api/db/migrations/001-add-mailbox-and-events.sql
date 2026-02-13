-- Migration 001: Add mailbox column to voicemails + call_events table
-- Applied to Supabase project: skvsjcckissnyxcafwyr on 2025-02-12

-- Add mailbox column to voicemails
ALTER TABLE public.voicemails
  ADD COLUMN IF NOT EXISTS mailbox TEXT
  CHECK (mailbox IN ('lea', 'clinical_md', 'accounts', 'care_team'));

CREATE INDEX IF NOT EXISTS idx_voicemails_mailbox ON public.voicemails (mailbox);

COMMENT ON COLUMN public.voicemails.mailbox IS 'Which voicemail box received this message';

-- Create call_events table for tracking IVR navigation
CREATE TABLE IF NOT EXISTS public.call_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_log_id UUID REFERENCES public.call_logs(id) ON DELETE SET NULL,
  twilio_sid  TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  event_data  JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.call_events IS 'IVR menu navigation and call flow events';

CREATE INDEX IF NOT EXISTS idx_call_events_twilio_sid  ON public.call_events (twilio_sid);
CREATE INDEX IF NOT EXISTS idx_call_events_call_log_id ON public.call_events (call_log_id);
CREATE INDEX IF NOT EXISTS idx_call_events_created_at  ON public.call_events (created_at);

-- RLS for call_events
ALTER TABLE public.call_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read call events"
  ON public.call_events FOR SELECT
  TO authenticated
  USING (true);

-- Update unheard_voicemails view to include mailbox
DROP VIEW IF EXISTS public.unheard_voicemails;

CREATE VIEW public.unheard_voicemails AS
SELECT
  v.id,
  v.from_number,
  v.recording_url,
  v.recording_sid,
  v.duration,
  v.transcription,
  v.transcription_status,
  v.mailbox,
  v.assigned_to,
  v.created_at,
  cl.direction AS call_direction,
  cl.to_number AS called_number,
  cl.started_at AS call_started_at,
  pe.extension AS to_extension_number
FROM public.voicemails v
LEFT JOIN public.call_logs cl ON cl.id = v.call_log_id
LEFT JOIN public.phone_extensions pe ON pe.id = v.to_extension
WHERE v.is_new = true
ORDER BY v.created_at DESC;

COMMENT ON VIEW public.unheard_voicemails IS 'All unheard voicemails with associated call and extension info';
