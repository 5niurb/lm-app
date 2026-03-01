-- Migration: device_push_tokens table for mobile VoIP push notifications
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS device_push_tokens (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, platform)
);

-- RLS: only authenticated users can see their own tokens
ALTER TABLE device_push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own device tokens"
  ON device_push_tokens
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role bypasses RLS for server-side operations (register-device endpoint)
