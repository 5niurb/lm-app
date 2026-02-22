-- Migration: Scheduled message delivery enhancements
-- Adds retry_count column, 'processing' status for claim-before-send, and polling index

ALTER TABLE public.scheduled_messages
  ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;

COMMENT ON COLUMN public.scheduled_messages.retry_count
  IS 'Number of send attempts. After 3 failures, status is set to failed permanently.';

-- Add 'processing' to status CHECK constraint (claim-before-send pattern)
ALTER TABLE public.scheduled_messages
  DROP CONSTRAINT IF EXISTS scheduled_messages_status_check;

ALTER TABLE public.scheduled_messages
  ADD CONSTRAINT scheduled_messages_status_check
  CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled'));

-- Index for the background job polling query
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_pending_due
  ON public.scheduled_messages (status, scheduled_at, retry_count)
  WHERE status IN ('pending', 'processing');
