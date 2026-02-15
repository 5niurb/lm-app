-- =============================================================================
-- Migration: Twilio History Sync
-- Adds twilio_number tracking to conversations and call_logs
-- =============================================================================

-- Add twilio_number to conversations (which local Twilio number this thread uses)
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS twilio_number TEXT;

-- Drop old unique constraint on phone_number alone
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_phone_number_key;

-- Add composite unique: same remote number can have different conversations per Twilio number
-- COALESCE handles legacy rows where twilio_number is NULL
CREATE UNIQUE INDEX IF NOT EXISTS conversations_phone_twilio_uniq
  ON public.conversations (phone_number, COALESCE(twilio_number, ''));

-- Index for filtering by Twilio number
CREATE INDEX IF NOT EXISTS idx_conversations_twilio_number
  ON public.conversations (twilio_number);

-- Add twilio_number to call_logs for easier filtering
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS twilio_number TEXT;

-- Index for filtering calls by Twilio number
CREATE INDEX IF NOT EXISTS idx_call_logs_twilio_number
  ON public.call_logs (twilio_number);
