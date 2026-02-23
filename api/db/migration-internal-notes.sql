-- Migration: Add is_internal_note column to messages table
-- Internal notes are staff-only records that appear in threads but are never sent via SMS

ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_internal_note BOOLEAN DEFAULT false;

-- Partial index for efficient queries filtering notes
CREATE INDEX IF NOT EXISTS idx_messages_internal_notes
  ON messages (conversation_id, created_at)
  WHERE is_internal_note = true;

COMMENT ON COLUMN messages.is_internal_note IS 'Staff-only note — never sent via SMS, shown inline in thread';
