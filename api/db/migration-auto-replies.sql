-- Migration: auto_reply_rules table
-- Auto-reply rules for inbound SMS keyword matching

CREATE TABLE IF NOT EXISTS auto_reply_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_type      TEXT NOT NULL DEFAULT 'keyword' CHECK (trigger_type IN ('keyword', 'any')),
  trigger_keywords  TEXT[] DEFAULT '{}',
  response_body     TEXT NOT NULL,
  is_active         BOOLEAN DEFAULT true,
  priority          INTEGER DEFAULT 10,
  hours_restriction TEXT NOT NULL DEFAULT 'always' CHECK (hours_restriction IN ('always', 'after_hours', 'business_hours')),
  created_by        UUID REFERENCES profiles(id),
  metadata          JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- Index for active rules lookup (used on every inbound SMS)
CREATE INDEX IF NOT EXISTS idx_auto_reply_rules_active
  ON auto_reply_rules (is_active, priority)
  WHERE is_active = true;

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_auto_reply_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_reply_rules_updated_at ON auto_reply_rules;
CREATE TRIGGER trg_auto_reply_rules_updated_at
  BEFORE UPDATE ON auto_reply_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_auto_reply_rules_updated_at();

-- RLS
ALTER TABLE auto_reply_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read auto_reply_rules"
  ON auto_reply_rules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert auto_reply_rules"
  ON auto_reply_rules FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update auto_reply_rules"
  ON auto_reply_rules FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
