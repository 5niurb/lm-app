-- =============================================================================
-- LM App — Phase 1A Database Schema
-- Supabase (PostgreSQL) — Full production schema
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- TRIGGER FUNCTION: update_updated_at
-- Automatically sets updated_at = now() on row update
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- TABLE: profiles
-- Extends Supabase auth.users with app-specific fields
-- =============================================================================

CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  full_name   TEXT,
  role        TEXT NOT NULL DEFAULT 'staff'
              CHECK (role IN ('admin', 'staff')),
  phone       TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.profiles IS 'User profiles extending Supabase auth.users';

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- =============================================================================
-- TABLE: trusted_devices
-- Adaptive MFA — remember trusted devices to skip repeated challenges
-- =============================================================================

CREATE TABLE public.trusted_devices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  ip_address  TEXT,
  user_agent  TEXT,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked     BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.trusted_devices IS 'Devices trusted for adaptive MFA skip';

-- =============================================================================
-- TABLE: phone_extensions
-- Staff phone extensions for the clinic phone system
-- =============================================================================

CREATE TABLE public.phone_extensions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  extension               TEXT NOT NULL UNIQUE,
  forward_number          TEXT,
  ring_timeout            INTEGER DEFAULT 20,
  voicemail_enabled       BOOLEAN DEFAULT true,
  voicemail_greeting_url  TEXT,
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.phone_extensions IS 'Staff phone extensions for Twilio-based phone system';

CREATE TRIGGER phone_extensions_updated_at
  BEFORE UPDATE ON public.phone_extensions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- =============================================================================
-- TABLE: call_routing_rules
-- Time-based call routing configuration
-- =============================================================================

CREATE TABLE public.call_routing_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  priority        INTEGER NOT NULL DEFAULT 0,
  day_of_week     INTEGER[],  -- 0=Sunday, 1=Monday, ..., 6=Saturday
  start_time      TIME,
  end_time        TIME,
  action_type     TEXT NOT NULL
                  CHECK (action_type IN ('ring_extension', 'ring_group', 'voicemail', 'auto_attendant', 'forward')),
  action_target   TEXT,  -- extension ID or phone number
  fallback_action TEXT DEFAULT 'voicemail',
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.call_routing_rules IS 'Time-based call routing rules for inbound calls';

CREATE TRIGGER call_routing_rules_updated_at
  BEFORE UPDATE ON public.call_routing_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- =============================================================================
-- TABLE: call_logs
-- Record of all inbound and outbound calls
-- =============================================================================
-- TABLE: contacts
-- Unified contact list synced from Google Sheet + other sources
-- =============================================================================

CREATE TABLE public.contacts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name        TEXT,
  last_name         TEXT,
  full_name         TEXT,
  phone             TEXT,
  phone_normalized  TEXT,               -- digits only for fast matching
  email             TEXT,
  source            TEXT
                    CHECK (source IN ('aesthetic_record', 'gohighlevel', 'textmagic', 'manual', 'google_sheet', 'inbound_call')),
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

-- =============================================================================

CREATE TABLE public.call_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  twilio_sid          TEXT UNIQUE,
  direction           TEXT NOT NULL
                      CHECK (direction IN ('inbound', 'outbound')),
  from_number         TEXT NOT NULL,
  to_number           TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'initiated'
                      CHECK (status IN ('initiated', 'ringing', 'in-progress', 'completed', 'busy', 'no-answer', 'failed', 'canceled')),
  duration            INTEGER DEFAULT 0,
  disposition         TEXT
                      CHECK (disposition IN ('answered', 'missed', 'voicemail', 'abandoned')),
  caller_name         TEXT,               -- from Twilio CNAM or contact match
  contact_id          UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  handled_by          UUID REFERENCES public.profiles(id),
  recording_url       TEXT,
  recording_duration  INTEGER,
  tags                TEXT[] DEFAULT '{}',
  notes               TEXT,
  metadata            JSONB DEFAULT '{}',
  started_at          TIMESTAMPTZ DEFAULT now(),
  ended_at            TIMESTAMPTZ
);

COMMENT ON TABLE public.call_logs IS 'Complete call records from Twilio';
COMMENT ON COLUMN public.call_logs.caller_name IS 'Caller name from Twilio CNAM lookup or contact match';

-- =============================================================================
-- TABLE: voicemails
-- Voicemail recordings and transcriptions
-- =============================================================================

CREATE TABLE public.voicemails (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_log_id           UUID REFERENCES public.call_logs(id) ON DELETE SET NULL,
  from_number           TEXT NOT NULL,
  to_extension          UUID REFERENCES public.phone_extensions(id),
  recording_url         TEXT NOT NULL,
  recording_sid         TEXT,
  duration              INTEGER DEFAULT 0,
  transcription         TEXT,
  transcription_status  TEXT DEFAULT NULL
                        CHECK (transcription_status IN ('pending', 'completed', 'failed')),
  mailbox               TEXT
                        CHECK (mailbox IN ('lea', 'clinical_md', 'accounts', 'care_team', 'operator')),
  is_new                BOOLEAN DEFAULT true,
  assigned_to           UUID REFERENCES public.profiles(id),
  preserved             BOOLEAN DEFAULT false,
  storage_path          TEXT,
  created_at            TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.voicemails IS 'Voicemail recordings with transcription status';

-- =============================================================================
-- TABLE: call_events
-- IVR menu navigation and call flow events (logged by Twilio Studio webhooks)
-- =============================================================================

CREATE TABLE public.call_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_log_id UUID REFERENCES public.call_logs(id) ON DELETE SET NULL,
  twilio_sid  TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  event_data  JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.call_events IS 'IVR menu navigation and call flow events';

-- =============================================================================
-- TABLE: conversations
-- SMS/RCS message threads grouped by phone number
-- =============================================================================

CREATE TABLE public.conversations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id    UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  phone_number  TEXT NOT NULL UNIQUE,      -- remote party phone (E.164)
  display_name  TEXT,                       -- cached contact name or CNAM
  last_message  TEXT,                       -- preview text
  last_at       TIMESTAMPTZ DEFAULT now(),  -- timestamp of last message
  unread_count  INTEGER DEFAULT 0,
  status        TEXT DEFAULT 'active'
                CHECK (status IN ('active', 'archived')),
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.conversations IS 'SMS/RCS conversation threads grouped by phone number';

CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- =============================================================================
-- TABLE: messages
-- Individual SMS/RCS messages within a conversation
-- =============================================================================

CREATE TABLE public.messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  direction       TEXT NOT NULL
                  CHECK (direction IN ('inbound', 'outbound')),
  body            TEXT NOT NULL DEFAULT '',
  from_number     TEXT NOT NULL,
  to_number       TEXT NOT NULL,
  twilio_sid      TEXT,
  status          TEXT DEFAULT 'sent'
                  CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'received', 'read')),
  media_urls      TEXT[],
  sent_by         UUID REFERENCES public.profiles(id),  -- null for inbound/auto
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.messages IS 'Individual SMS/RCS messages within a conversation';

-- conversations indexes
CREATE INDEX idx_conversations_phone      ON public.conversations (phone_number);
CREATE INDEX idx_conversations_contact    ON public.conversations (contact_id);
CREATE INDEX idx_conversations_last_at    ON public.conversations (last_at DESC);
CREATE INDEX idx_conversations_status     ON public.conversations (status);

-- messages indexes
CREATE INDEX idx_messages_conversation    ON public.messages (conversation_id);
CREATE INDEX idx_messages_twilio_sid      ON public.messages (twilio_sid);
CREATE INDEX idx_messages_created_at      ON public.messages (created_at);
CREATE INDEX idx_messages_direction       ON public.messages (direction);

-- RLS for conversations
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read conversations"
  ON public.conversations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update conversations"
  ON public.conversations FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS for messages
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read messages"
  ON public.messages FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert messages"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- =============================================================================
-- TABLE: audit_log
-- Immutable security and activity log
-- =============================================================================

CREATE TABLE public.audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,
  resource_type TEXT,
  resource_id   TEXT,
  ip_address    TEXT,
  user_agent    TEXT,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.audit_log IS 'Immutable security and activity audit trail';

-- =============================================================================
-- TABLE: settings
-- Key-value application configuration
-- =============================================================================

CREATE TABLE public.settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  updated_by  UUID REFERENCES public.profiles(id)
);

COMMENT ON TABLE public.settings IS 'Application-wide key-value configuration';

CREATE TRIGGER settings_updated_at
  BEFORE UPDATE ON public.settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- =============================================================================
-- TRIGGER: Auto-create profile on auth.users insert
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- VIEWS
-- =============================================================================

-- Daily call statistics aggregation
CREATE OR REPLACE VIEW public.call_stats_daily AS
SELECT
  DATE(started_at) AS call_date,
  COUNT(*)::INTEGER AS total_calls,
  COUNT(*) FILTER (WHERE disposition = 'answered')::INTEGER AS answered,
  COUNT(*) FILTER (WHERE disposition = 'missed')::INTEGER AS missed,
  COUNT(*) FILTER (WHERE disposition = 'voicemail')::INTEGER AS voicemail,
  ROUND(AVG(duration) FILTER (WHERE duration > 0))::INTEGER AS avg_duration_seconds
FROM public.call_logs
GROUP BY DATE(started_at)
ORDER BY call_date DESC;

COMMENT ON VIEW public.call_stats_daily IS 'Aggregated daily call statistics';

-- Unheard voicemails with caller info
CREATE OR REPLACE VIEW public.unheard_voicemails AS
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
  cl.caller_name,
  pe.extension AS to_extension_number,
  c.full_name AS contact_name,
  c.email AS contact_email
FROM public.voicemails v
LEFT JOIN public.call_logs cl ON cl.id = v.call_log_id
LEFT JOIN public.phone_extensions pe ON pe.id = v.to_extension
LEFT JOIN public.contacts c ON c.id = cl.contact_id
WHERE v.is_new = true
ORDER BY v.created_at DESC;

COMMENT ON VIEW public.unheard_voicemails IS 'All unheard voicemails with associated call and extension info';

-- =============================================================================
-- INDEXES
-- =============================================================================

-- call_logs indexes
-- contacts indexes
CREATE INDEX idx_contacts_phone_normalized ON public.contacts (phone_normalized);
CREATE INDEX idx_contacts_phone            ON public.contacts (phone);
CREATE INDEX idx_contacts_email            ON public.contacts (email);
CREATE INDEX idx_contacts_full_name        ON public.contacts (full_name);
CREATE INDEX idx_contacts_source           ON public.contacts (source);

-- call_logs indexes
CREATE INDEX idx_call_logs_twilio_sid    ON public.call_logs (twilio_sid);
CREATE INDEX idx_call_logs_direction     ON public.call_logs (direction);
CREATE INDEX idx_call_logs_status        ON public.call_logs (status);
CREATE INDEX idx_call_logs_started_at    ON public.call_logs (started_at);
CREATE INDEX idx_call_logs_from_number   ON public.call_logs (from_number);
CREATE INDEX idx_call_logs_handled_by    ON public.call_logs (handled_by);
CREATE INDEX idx_call_logs_contact_id    ON public.call_logs (contact_id);
CREATE INDEX idx_call_logs_caller_name   ON public.call_logs (caller_name);

-- voicemails indexes
CREATE INDEX idx_voicemails_is_new       ON public.voicemails (is_new);
CREATE INDEX idx_voicemails_from_number  ON public.voicemails (from_number);
CREATE INDEX idx_voicemails_created_at   ON public.voicemails (created_at);
CREATE INDEX idx_voicemails_assigned_to  ON public.voicemails (assigned_to);
CREATE INDEX idx_voicemails_mailbox      ON public.voicemails (mailbox);

-- call_events indexes
CREATE INDEX idx_call_events_twilio_sid  ON public.call_events (twilio_sid);
CREATE INDEX idx_call_events_call_log_id ON public.call_events (call_log_id);
CREATE INDEX idx_call_events_created_at  ON public.call_events (created_at);

-- audit_log indexes
CREATE INDEX idx_audit_log_user_id       ON public.audit_log (user_id);
CREATE INDEX idx_audit_log_action        ON public.audit_log (action);
CREATE INDEX idx_audit_log_created_at    ON public.audit_log (created_at);

-- trusted_devices indexes
CREATE INDEX idx_trusted_devices_user_id     ON public.trusted_devices (user_id);
CREATE INDEX idx_trusted_devices_token_hash  ON public.trusted_devices (token_hash);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Helper function: check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- -------------------------
-- profiles
-- -------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can update any profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- -------------------------
-- trusted_devices
-- -------------------------
ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own trusted devices"
  ON public.trusted_devices FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own trusted devices"
  ON public.trusted_devices FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Inserts handled by service role (API middleware) — no INSERT policy needed

-- -------------------------
-- phone_extensions
-- -------------------------
ALTER TABLE public.phone_extensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read phone extensions"
  ON public.phone_extensions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert phone extensions"
  ON public.phone_extensions FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update phone extensions"
  ON public.phone_extensions FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete phone extensions"
  ON public.phone_extensions FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- -------------------------
-- call_routing_rules
-- -------------------------
ALTER TABLE public.call_routing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read call routing rules"
  ON public.call_routing_rules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert call routing rules"
  ON public.call_routing_rules FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update call routing rules"
  ON public.call_routing_rules FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete call routing rules"
  ON public.call_routing_rules FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- -------------------------
-- call_logs
-- -------------------------
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read call logs"
  ON public.call_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert call logs"
  ON public.call_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can update call logs"
  ON public.call_logs FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete call logs"
  ON public.call_logs FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- -------------------------
-- voicemails
-- -------------------------
ALTER TABLE public.voicemails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read voicemails"
  ON public.voicemails FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update voicemail status"
  ON public.voicemails FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins can delete voicemails"
  ON public.voicemails FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- -------------------------
-- call_events
-- -------------------------
ALTER TABLE public.call_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read call events"
  ON public.call_events FOR SELECT
  TO authenticated
  USING (true);

-- Inserts handled by service role (webhook handler) — no INSERT policy needed

-- -------------------------
-- contacts
-- -------------------------
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read contacts"
  ON public.contacts FOR SELECT
  TO authenticated
  USING (true);

-- Inserts/updates handled by service role (sync job) — no INSERT/UPDATE policy needed

-- -------------------------
-- audit_log
-- -------------------------
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read audit log"
  ON public.audit_log FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Inserts handled by service role (API middleware) — no INSERT policy needed

-- -------------------------
-- settings
-- -------------------------
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read settings"
  ON public.settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert settings"
  ON public.settings FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update settings"
  ON public.settings FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =============================================================================
-- DEFAULT SETTINGS
-- =============================================================================

INSERT INTO public.settings (key, value, description) VALUES
  ('business_hours', '{"monday":{"open":"09:00","close":"18:00"},"tuesday":{"open":"09:00","close":"18:00"},"wednesday":{"open":"09:00","close":"18:00"},"thursday":{"open":"09:00","close":"18:00"},"friday":{"open":"09:00","close":"18:00"},"saturday":{"open":"09:00","close":"17:00"},"sunday":null}', 'Business hours by day (null = closed)'),
  ('allowed_ips', '[]', 'IP whitelist for geo-restriction (empty = disabled)'),
  ('mfa_trust_duration_days', '30', 'How long a device stays trusted after MFA'),
  ('clinic_timezone', '"America/Los_Angeles"', 'Clinic timezone for business hours'),
  ('clinic_phone', '""', 'Main clinic phone number (Twilio)');
