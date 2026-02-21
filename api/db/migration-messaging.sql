-- =============================================================================
-- LM App — Messaging Features Migration
-- SMS Templates, Scheduled Messages, Message Tags
-- =============================================================================

-- =============================================================================
-- TABLE: sms_templates
-- Reusable SMS message templates with dynamic tag support
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.sms_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  category    TEXT DEFAULT 'general'
              CHECK (category IN ('general', 'appointment', 'follow_up', 'promotion', 'reminder', 'greeting', 'custom')),
  tags        TEXT[] DEFAULT '{}',
  is_active   BOOLEAN DEFAULT true,
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.sms_templates IS 'Reusable SMS message templates with dynamic merge tags';

CREATE TRIGGER sms_templates_updated_at
  BEFORE UPDATE ON public.sms_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_sms_templates_category   ON public.sms_templates (category);
CREATE INDEX idx_sms_templates_is_active  ON public.sms_templates (is_active);
CREATE INDEX idx_sms_templates_created_by ON public.sms_templates (created_by);

-- RLS for sms_templates
ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read sms templates"
  ON public.sms_templates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert sms templates"
  ON public.sms_templates FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update sms templates"
  ON public.sms_templates FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins can delete sms templates"
  ON public.sms_templates FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- =============================================================================
-- TABLE: scheduled_messages
-- Messages scheduled to be sent at a future time
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.scheduled_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  to_number       TEXT NOT NULL,
  from_number     TEXT,
  body            TEXT NOT NULL DEFAULT '',
  template_id     UUID REFERENCES public.sms_templates(id) ON DELETE SET NULL,
  scheduled_at    TIMESTAMPTZ NOT NULL,
  status          TEXT DEFAULT 'pending'
                  CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  sent_at         TIMESTAMPTZ,
  error_message   TEXT,
  created_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.scheduled_messages IS 'SMS messages scheduled for future delivery';

CREATE TRIGGER scheduled_messages_updated_at
  BEFORE UPDATE ON public.scheduled_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_scheduled_messages_status       ON public.scheduled_messages (status);
CREATE INDEX idx_scheduled_messages_scheduled_at ON public.scheduled_messages (scheduled_at);
CREATE INDEX idx_scheduled_messages_created_by   ON public.scheduled_messages (created_by);
CREATE INDEX idx_scheduled_messages_conversation ON public.scheduled_messages (conversation_id);

-- RLS for scheduled_messages
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read scheduled messages"
  ON public.scheduled_messages FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert scheduled messages"
  ON public.scheduled_messages FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update scheduled messages"
  ON public.scheduled_messages FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins can delete scheduled messages"
  ON public.scheduled_messages FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- =============================================================================
-- Add twilio_number to conversations (if not already present)
-- =============================================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conversations' AND column_name = 'twilio_number'
  ) THEN
    ALTER TABLE public.conversations ADD COLUMN twilio_number TEXT;
  END IF;
END $$;

-- =============================================================================
-- SEED: Default templates
-- =============================================================================

INSERT INTO public.sms_templates (name, body, category, tags) VALUES
  ('Appointment Reminder', 'Hi {{first_name}}, this is a reminder about your appointment at Le Med Spa on {{date}} at {{time}}. Reply CONFIRM to confirm or call us at (818) 463-3772 to reschedule.', 'appointment', ARRAY['reminder', 'appointment']),
  ('Welcome New Client', 'Welcome to Le Med Spa, {{first_name}}! We''re thrilled to have you. If you have any questions before your visit, feel free to text us here or call (818) 463-3772.', 'greeting', ARRAY['welcome', 'new-client']),
  ('Follow Up After Visit', 'Hi {{first_name}}, thank you for visiting Le Med Spa! We hope you enjoyed your {{service}} treatment. How are you feeling? Let us know if you have any questions.', 'follow_up', ARRAY['follow-up', 'post-visit']),
  ('Promotion', 'Hi {{first_name}}! Le Med Spa has a special offer just for you: {{offer_details}}. Book now at lemedspa.com or reply to this message. Valid through {{expiry_date}}.', 'promotion', ARRAY['promo', 'offer']),
  ('Reschedule Request', 'Hi {{first_name}}, we noticed you missed your appointment. Would you like to reschedule? Reply with your preferred date/time or call us at (818) 463-3772.', 'reminder', ARRAY['reschedule', 'missed']),
  ('Thank You', 'Thank you, {{first_name}}! We appreciate you choosing Le Med Spa. See you next time! ✨', 'general', ARRAY['thank-you'])
ON CONFLICT DO NOTHING;
