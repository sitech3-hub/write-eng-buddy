
CREATE TABLE public.threads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'New practice',
  level TEXT NOT NULL DEFAULT 'middle3',
  exercise_type TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_threads_user_updated ON public.threads(user_id, updated_at DESC);

ALTER TABLE public.threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "threads_select_own" ON public.threads FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "threads_insert_own" ON public.threads FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "threads_update_own" ON public.threads FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "threads_delete_own" ON public.threads FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL,
  parts JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_thread_created ON public.messages(thread_id, created_at ASC);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages_select_own" ON public.messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "messages_insert_own" ON public.messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "messages_delete_own" ON public.messages FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_thread_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.threads SET updated_at = now() WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_messages_touch_thread
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.touch_thread_updated_at();
