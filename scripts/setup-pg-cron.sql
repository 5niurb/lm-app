-- =============================================================================
-- pg_cron + pg_net: Automated processing of scheduled automation entries
-- 
-- Run this in the Supabase SQL Editor after setting up:
-- 1. CRON_SECRET env var on Render
-- 2. app.cron_secret in Supabase vault or database settings
--
-- Prerequisites: pg_cron and pg_net extensions must be enabled in Supabase
-- dashboard under Settings > Extensions
-- =============================================================================

-- Enable extensions (may already be enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule automation processing every 5 minutes
SELECT cron.schedule(
  'process-automation-queue',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://lm-app-api.onrender.com/api/cron/process',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_secret', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Verify the job was created
-- SELECT * FROM cron.job;
