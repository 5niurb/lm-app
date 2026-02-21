-- Migration: Add reactions column to messages table
-- Format: [{emoji: "👍", reacted_by: "user_id", created_at: "iso_string"}]

ALTER TABLE messages ADD COLUMN IF NOT EXISTS reactions jsonb DEFAULT '[]';

COMMENT ON COLUMN messages.reactions IS 'Array of emoji reactions: [{emoji, reacted_by, created_at}]';
