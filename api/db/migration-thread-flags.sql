-- Migration: Star/Resolve flags for any conversation thread item
-- Supports Feature 3 (star/resolve) and future filtering

CREATE TABLE IF NOT EXISTS public.thread_item_flags (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  item_type       TEXT NOT NULL CHECK (item_type IN ('message', 'call', 'voicemail', 'email')),
  item_id         UUID NOT NULL,
  is_starred      BOOLEAN DEFAULT false,
  is_resolved     BOOLEAN DEFAULT false,
  starred_by      UUID REFERENCES public.profiles(id),
  resolved_by     UUID REFERENCES public.profiles(id),
  starred_at      TIMESTAMPTZ,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- One flag row per item
CREATE UNIQUE INDEX IF NOT EXISTS idx_thread_item_flags_unique
  ON public.thread_item_flags (item_type, item_id);

-- Fast lookups by conversation
CREATE INDEX IF NOT EXISTS idx_thread_item_flags_conversation
  ON public.thread_item_flags (conversation_id);

-- Filter starred across all conversations
CREATE INDEX IF NOT EXISTS idx_thread_item_flags_starred
  ON public.thread_item_flags (is_starred) WHERE is_starred = true;

-- RLS
ALTER TABLE public.thread_item_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage thread item flags"
  ON public.thread_item_flags FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
