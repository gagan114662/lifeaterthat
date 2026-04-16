-- Afterlife — Supabase schema and RLS policies.
--
-- Apply to a fresh Supabase project with:
--   supabase db reset < infra/supabase/seed.sql
-- or via the SQL editor in the Supabase dashboard.
--
-- Every user-scoped table enables Row Level Security and gates ALL
-- operations on `user_id = auth.uid()`. The FastAPI handlers assume
-- the request's JWT is forwarded to the database session, so RLS
-- silently filters out rows the caller does not own — a cross-user
-- SELECT returns zero rows and the API maps that to 404.

BEGIN;

-- ─── memories ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.memories (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    name        text NOT NULL,
    photo_url   text,
    voice_url   text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memories_user_id_idx ON public.memories (user_id);

ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memories FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "memories owner read"   ON public.memories;
DROP POLICY IF EXISTS "memories owner insert" ON public.memories;
DROP POLICY IF EXISTS "memories owner update" ON public.memories;
DROP POLICY IF EXISTS "memories owner delete" ON public.memories;

CREATE POLICY "memories owner read"
    ON public.memories FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "memories owner insert"
    ON public.memories FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "memories owner update"
    ON public.memories FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "memories owner delete"
    ON public.memories FOR DELETE
    USING (user_id = auth.uid());

-- ─── messages ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.messages (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    memory_id   uuid NOT NULL REFERENCES public.memories (id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    role        text NOT NULL CHECK (role IN ('user', 'assistant')),
    content     text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_memory_id_idx ON public.messages (memory_id);
CREATE INDEX IF NOT EXISTS messages_user_id_idx   ON public.messages (user_id);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages owner read"   ON public.messages;
DROP POLICY IF EXISTS "messages owner insert" ON public.messages;

CREATE POLICY "messages owner read"
    ON public.messages FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "messages owner insert"
    ON public.messages FOR INSERT
    WITH CHECK (user_id = auth.uid());

COMMIT;
