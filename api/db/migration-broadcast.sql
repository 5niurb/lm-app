-- Migration: Create broadcasts table for bulk SMS messaging
-- Broadcasts send one message to many contacts using templates with merge tags

CREATE TABLE IF NOT EXISTS broadcasts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  body             TEXT NOT NULL,
  template_id      UUID REFERENCES sms_templates(id) ON DELETE SET NULL,
  status           TEXT CHECK (status IN ('draft', 'sending', 'sent', 'failed')) DEFAULT 'draft',
  recipient_filter JSONB DEFAULT '{}',
  recipient_count  INTEGER DEFAULT 0,
  sent_count       INTEGER DEFAULT 0,
  failed_count     INTEGER DEFAULT 0,
  from_number      TEXT,
  created_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  metadata         JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_broadcasts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS broadcasts_updated_at ON broadcasts;
CREATE TRIGGER broadcasts_updated_at
  BEFORE UPDATE ON broadcasts
  FOR EACH ROW EXECUTE FUNCTION update_broadcasts_updated_at();

-- RLS
ALTER TABLE broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage broadcasts"
  ON broadcasts FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_broadcasts_status ON broadcasts(status);
CREATE INDEX IF NOT EXISTS idx_broadcasts_created_at ON broadcasts(created_at DESC);

COMMENT ON TABLE broadcasts IS 'Bulk SMS campaigns — one message to many contacts via templates + merge tags';
