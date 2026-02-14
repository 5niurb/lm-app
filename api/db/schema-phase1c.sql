-- =============================================================================
-- LM App — Phase 1C Database Schema (Additive Migration)
-- Services, Content Repository, Automation Engine
-- Run AFTER schema.sql (Phase 1A tables)
-- =============================================================================

-- =============================================================================
-- TABLE: services
-- The spa's treatment/service catalog
-- =============================================================================

CREATE TABLE public.services (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,        -- URL-friendly: 'botox', 'dermal-fillers'
  category      TEXT NOT NULL
                CHECK (category IN ('advanced_aesthetics', 'regenerative_wellness', 'bespoke_treatments')),
  description   TEXT,
  duration_min  INTEGER,                     -- typical treatment duration in minutes
  price_from    NUMERIC(10,2),               -- starting price (display only, not billing)
  is_active     BOOLEAN DEFAULT true,
  sort_order    INTEGER DEFAULT 0,
  metadata      JSONB DEFAULT '{}',          -- flexible: contraindications, device used, etc.
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.services IS 'Spa treatment/service catalog powering content, automation, and booking';

CREATE TRIGGER services_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Indexes
CREATE INDEX idx_services_category  ON public.services (category);
CREATE INDEX idx_services_slug      ON public.services (slug);
CREATE INDEX idx_services_active    ON public.services (is_active);

-- =============================================================================
-- TABLE: service_content
-- Per-service content library (pre/post instructions, consent forms, FAQs)
-- =============================================================================

CREATE TABLE public.service_content (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id    UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  content_type  TEXT NOT NULL
                CHECK (content_type IN (
                  'pre_instructions',
                  'post_instructions',
                  'consent_form',
                  'questionnaire',
                  'faq',
                  'what_to_expect'
                )),
  title         TEXT NOT NULL,
  summary       TEXT,                        -- brief 2-3 sentence version for SMS/email
  page_slug     TEXT,                        -- e.g., 'botox-pre' → lemedspa.com/care/botox-pre
  content_json  JSONB DEFAULT '[]',          -- structured content: [{heading, body, icon?, image_url?}]
  version       INTEGER DEFAULT 1,
  is_active     BOOLEAN DEFAULT true,
  created_by    UUID REFERENCES public.profiles(id),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.service_content IS 'Per-service content blocks (pre/post instructions, consent, questionnaires, FAQs)';
COMMENT ON COLUMN public.service_content.content_json IS 'Structured content: array of {heading, body, icon?, image_url?} accordion sections';
COMMENT ON COLUMN public.service_content.summary IS 'Brief 2-3 sentence summary for SMS/email messages (links to full page)';

CREATE TRIGGER service_content_updated_at
  BEFORE UPDATE ON public.service_content
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Indexes
CREATE INDEX idx_service_content_service    ON public.service_content (service_id);
CREATE INDEX idx_service_content_type       ON public.service_content (content_type);
CREATE INDEX idx_service_content_slug       ON public.service_content (page_slug);
CREATE UNIQUE INDEX idx_service_content_uniq ON public.service_content (service_id, content_type) WHERE is_active = true;

-- =============================================================================
-- TABLE: automation_sequences
-- Configurable message sequences triggered by events (per service)
-- =============================================================================

CREATE TABLE public.automation_sequences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id      UUID REFERENCES public.services(id) ON DELETE CASCADE,  -- null = global (all services)
  name            TEXT NOT NULL,
  trigger_event   TEXT NOT NULL
                  CHECK (trigger_event IN (
                    'booking_confirmed',
                    'pre_appointment',
                    'post_treatment',
                    'lead_nurture',
                    'no_show',
                    'rebooking',
                    'consent_reminder',
                    'check_in'
                  )),
  timing_offset   INTERVAL NOT NULL,          -- e.g., '-3 days', '+1 day', '+30 days'
  channel         TEXT NOT NULL DEFAULT 'both'
                  CHECK (channel IN ('sms', 'email', 'both')),
  template_type   TEXT NOT NULL
                  CHECK (template_type IN (
                    'confirmation',
                    'pre_instructions',
                    'reminder',
                    'post_care',
                    'check_in',
                    'rebooking',
                    'consent_request',
                    'custom'
                  )),
  content_ref     UUID REFERENCES public.service_content(id) ON DELETE SET NULL,
  subject_line    TEXT,                        -- email subject (null → auto-generated)
  message_body    TEXT,                        -- custom SMS body override (null → use content summary)
  rcs_actions     JSONB,                       -- RCS quick-reply buttons: [{label, action}]
  is_active       BOOLEAN DEFAULT true,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.automation_sequences IS 'Configurable message sequences triggered by booking/treatment events';
COMMENT ON COLUMN public.automation_sequences.timing_offset IS 'Relative to trigger event: negative = before, positive = after. E.g., -3 days, +1 day';
COMMENT ON COLUMN public.automation_sequences.rcs_actions IS 'RCS quick-reply buttons: [{label: "Got it", action: "confirm"}, ...]';

CREATE TRIGGER automation_sequences_updated_at
  BEFORE UPDATE ON public.automation_sequences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Indexes
CREATE INDEX idx_auto_seq_service    ON public.automation_sequences (service_id);
CREATE INDEX idx_auto_seq_trigger    ON public.automation_sequences (trigger_event);
CREATE INDEX idx_auto_seq_active     ON public.automation_sequences (is_active);
CREATE INDEX idx_auto_seq_sort       ON public.automation_sequences (sort_order);

-- =============================================================================
-- TABLE: automation_log
-- Tracks every automated message sent (or scheduled) to a client
-- =============================================================================

CREATE TABLE public.automation_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  booking_id    UUID,                          -- future: references bookings(id)
  sequence_id   UUID REFERENCES public.automation_sequences(id) ON DELETE SET NULL,
  channel       TEXT NOT NULL
                CHECK (channel IN ('sms', 'email', 'rcs')),
  status        TEXT NOT NULL DEFAULT 'scheduled'
                CHECK (status IN ('scheduled', 'sent', 'delivered', 'opened', 'clicked', 'failed', 'cancelled')),
  scheduled_at  TIMESTAMPTZ,                   -- when the message should/will fire
  sent_at       TIMESTAMPTZ,                   -- when actually sent
  error_message TEXT,                          -- failure reason if status = failed
  metadata      JSONB DEFAULT '{}',            -- twilio SID, resend ID, read receipt, etc.
  created_at    TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.automation_log IS 'Execution log for all automated messages sent to clients';

-- Indexes
CREATE INDEX idx_auto_log_client     ON public.automation_log (client_id);
CREATE INDEX idx_auto_log_booking    ON public.automation_log (booking_id);
CREATE INDEX idx_auto_log_sequence   ON public.automation_log (sequence_id);
CREATE INDEX idx_auto_log_status     ON public.automation_log (status);
CREATE INDEX idx_auto_log_scheduled  ON public.automation_log (scheduled_at);
CREATE INDEX idx_auto_log_sent_at    ON public.automation_log (sent_at);

-- =============================================================================
-- TABLE: consent_submissions
-- Signed consent forms and completed questionnaires
-- =============================================================================

CREATE TABLE public.consent_submissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  booking_id      UUID,                        -- future: references bookings(id)
  form_id         UUID REFERENCES public.service_content(id) ON DELETE SET NULL,
  service_id      UUID REFERENCES public.services(id) ON DELETE SET NULL,
  responses       JSONB DEFAULT '{}',          -- questionnaire answers: {field_name: value}
  signature_data  TEXT,                        -- signature_pad output (base64 PNG or data URL)
  signed_at       TIMESTAMPTZ,
  ip_address      INET,
  user_agent      TEXT,
  status          TEXT DEFAULT 'pending'
                  CHECK (status IN ('pending', 'completed', 'expired', 'voided')),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.consent_submissions IS 'Signed consent forms and completed questionnaires for treatments';

CREATE TRIGGER consent_submissions_updated_at
  BEFORE UPDATE ON public.consent_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Indexes
CREATE INDEX idx_consent_client      ON public.consent_submissions (client_id);
CREATE INDEX idx_consent_booking     ON public.consent_submissions (booking_id);
CREATE INDEX idx_consent_form        ON public.consent_submissions (form_id);
CREATE INDEX idx_consent_service     ON public.consent_submissions (service_id);
CREATE INDEX idx_consent_status      ON public.consent_submissions (status);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) for new tables
-- =============================================================================

-- -------------------------
-- services
-- -------------------------
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read services"
  ON public.services FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert services"
  ON public.services FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update services"
  ON public.services FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete services"
  ON public.services FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- -------------------------
-- service_content
-- -------------------------
ALTER TABLE public.service_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read service content"
  ON public.service_content FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert service content"
  ON public.service_content FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update service content"
  ON public.service_content FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete service content"
  ON public.service_content FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- -------------------------
-- automation_sequences
-- -------------------------
ALTER TABLE public.automation_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read automation sequences"
  ON public.automation_sequences FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert automation sequences"
  ON public.automation_sequences FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update automation sequences"
  ON public.automation_sequences FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete automation sequences"
  ON public.automation_sequences FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- -------------------------
-- automation_log
-- -------------------------
ALTER TABLE public.automation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read automation log"
  ON public.automation_log FOR SELECT
  TO authenticated
  USING (true);

-- Inserts handled by service role (automation engine) — no INSERT policy needed

-- -------------------------
-- consent_submissions
-- -------------------------
ALTER TABLE public.consent_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read consent submissions"
  ON public.consent_submissions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert consent submissions"
  ON public.consent_submissions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can update consent submissions"
  ON public.consent_submissions FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =============================================================================
-- SEED DATA: Default services from Le Med Spa menu
-- =============================================================================

INSERT INTO public.services (name, slug, category, description, sort_order) VALUES
  -- Advanced Aesthetics
  ('Neuromodulators (Botox/Dysport)', 'neuromodulators', 'advanced_aesthetics',
   'FDA-approved injectable treatments to smooth fine lines and wrinkles. Targets forehead lines, crow''s feet, and frown lines.', 10),

  ('Dermal Fillers', 'dermal-fillers', 'advanced_aesthetics',
   'Hyaluronic acid-based injectables to restore volume, contour facial features, and enhance lips. Brands include Juvederm and Restylane.', 20),

  ('Chemical Peels', 'chemical-peels', 'advanced_aesthetics',
   'Medical-grade peels to improve skin texture, reduce hyperpigmentation, and treat acne scarring. Multiple depths available.', 30),

  ('Laser Skin Resurfacing', 'laser-resurfacing', 'advanced_aesthetics',
   'Advanced laser treatments for skin rejuvenation, scar reduction, and pigmentation correction.', 40),

  ('Microneedling', 'microneedling', 'advanced_aesthetics',
   'Collagen induction therapy using micro-fine needles to improve skin texture, reduce scars, and enhance product absorption.', 50),

  -- Regenerative Wellness
  ('IV Nutrient Therapy', 'iv-therapy', 'regenerative_wellness',
   'Customized IV vitamin and mineral infusions for energy, immunity, hydration, and recovery.', 60),

  ('Bioidentical Hormones', 'bioidentical-hormones', 'regenerative_wellness',
   'Hormone replacement therapy using bioidentical hormones to restore balance and vitality.', 70),

  ('Body Contouring (NuEra Tight)', 'body-contouring', 'regenerative_wellness',
   'Non-invasive radiofrequency body contouring for skin tightening, fat reduction, and cellulite improvement.', 80),

  -- Bespoke Treatments
  ('Signature Protocol', 'signature-protocol', 'bespoke_treatments',
   'Le Med Spa''s bespoke multi-modality treatment combining injectables, skin refinement, and wellness for comprehensive rejuvenation.', 90),

  ('Executive Wellness', 'executive-wellness', 'bespoke_treatments',
   'Comprehensive wellness assessment and treatment plan designed for busy professionals.', 100);

-- =============================================================================
-- SEED DATA: Default automation sequences (pre/post treatment)
-- =============================================================================

-- These are global (service_id = null) defaults. Service-specific overrides can be added.

INSERT INTO public.automation_sequences (name, trigger_event, timing_offset, channel, template_type, sort_order) VALUES
  -- Pre-appointment sequence
  ('Booking Confirmation',   'booking_confirmed',  '0 seconds',  'both',  'confirmation',      10),
  ('Pre-Treatment Guide',    'pre_appointment',    '-7 days',    'email', 'pre_instructions',  20),
  ('Prep Reminder',          'pre_appointment',    '-3 days',    'both',  'reminder',          30),
  ('What to Expect',         'pre_appointment',    '-3 days',    'email', 'pre_instructions',  35),
  ('Day-Before Reminder',    'pre_appointment',    '-1 day',     'sms',   'reminder',          40),
  ('See You Soon',           'pre_appointment',    '-2 hours',   'sms',   'reminder',          50),

  -- Post-treatment sequence
  ('Post-Care Instructions', 'post_treatment',     '0 seconds',  'both',  'post_care',         60),
  ('Day 1 Check-In',        'post_treatment',     '+1 day',     'sms',   'check_in',          70),
  ('Recovery Update',        'post_treatment',     '+3 days',    'sms',   'post_care',         80),
  ('Week 1 Follow-Up',      'post_treatment',     '+7 days',    'email', 'check_in',          90),
  ('Results Check-In',      'post_treatment',     '+14 days',   'sms',   'check_in',          100),
  ('Rebooking Prompt',      'rebooking',          '+30 days',   'email', 'rebooking',         110),

  -- No-show handling
  ('No-Show Follow-Up',     'no_show',            '+2 hours',   'sms',   'custom',            120),

  -- Consent reminder
  ('Consent Form Reminder',  'consent_reminder',   '-1 day',     'sms',   'consent_request',   130);
