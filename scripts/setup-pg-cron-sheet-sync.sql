-- =============================================================================
-- pg_cron + pg_net: Automated Google Sheet → Contacts → TextMagic sync
--
-- Monitors the AR patients Google Sheet for new entries every 15 minutes.
-- New contacts are inserted into the contacts table and synced to TextMagic.
--
-- Prerequisites:
-- 1. pg_cron and pg_net extensions enabled in Supabase (Settings > Extensions)
-- 2. SYNC_SECRET env var set on Render
-- 3. app.sync_secret set in Supabase: ALTER DATABASE postgres SET app.sync_secret = '<value>';
-- 4. GOOGLE_SHEET_CSV_URL env var set on Render
-- =============================================================================

-- Enable extensions (may already be enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule sheet sync every 15 minutes
SELECT cron.schedule(
  'sync-ar-sheet',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://lm-app-api.onrender.com/api/sync/sheet',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-key', current_setting('app.sync_secret', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Verify the job was created
-- SELECT * FROM cron.job;

-- To remove the job later:
-- SELECT cron.unschedule('sync-ar-sheet');
