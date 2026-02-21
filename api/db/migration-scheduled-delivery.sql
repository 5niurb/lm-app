-- Migration: Add retry_count to scheduled_messages for automatic retry with backoff
-- Existing rows get retry_count=0 (default), so no data issues

ALTER TABLE scheduled_messages ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0;

COMMENT ON COLUMN scheduled_messages.retry_count IS 'Number of send attempts. After 3 failures, status is set to failed permanently.';
