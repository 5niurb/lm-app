-- Migration: Email records for conversation threads

CREATE TABLE IF NOT EXISTS public.emails (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  contact_id      UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  direction       TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_address    TEXT NOT NULL,
  from_name       TEXT,
  to_address      TEXT NOT NULL,
  cc              TEXT[],
  bcc             TEXT[],
  subject         TEXT,
  body_text       TEXT,
  body_html       TEXT,
  resend_id       TEXT,
  status          TEXT DEFAULT 'sent' CHECK (status IN ('draft', 'queued', 'sent', 'delivered', 'bounced', 'failed')),
  sent_by         UUID REFERENCES public.profiles(id),
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emails_conversation ON public.emails (conversation_id);
CREATE INDEX IF NOT EXISTS idx_emails_contact ON public.emails (contact_id);
CREATE INDEX IF NOT EXISTS idx_emails_created_at ON public.emails (created_at);

-- RLS
ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage emails"
  ON public.emails FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
