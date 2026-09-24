-- RECONSTRUCTED BASELINE: derived from supabase-schema.sql, not pulled from remote.
-- It intentionally reproduces the permissive historical RLS state. Do not adopt
-- it in a remote migration history before completing the documented audit.

CREATE TABLE public.reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  ra TEXT NOT NULL,
  address TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  photo_url TEXT DEFAULT '',
  status TEXT DEFAULT 'aberto'
    CHECK (status IN ('aberto', 'andamento', 'resolvido')),
  confirmations INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (report_id, device_id)
);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY reports_select
ON public.reports
FOR SELECT
USING (true);

CREATE POLICY reports_insert
ON public.reports
FOR INSERT
WITH CHECK (true);

CREATE POLICY reports_update
ON public.reports
FOR UPDATE
USING (true);

CREATE POLICY votes_select
ON public.votes
FOR SELECT
USING (true);

CREATE POLICY votes_insert
ON public.votes
FOR INSERT
WITH CHECK (true);

CREATE POLICY votes_delete
ON public.votes
FOR DELETE
USING (true);

CREATE INDEX idx_reports_category ON public.reports (category);
CREATE INDEX idx_reports_status ON public.reports (status);
CREATE INDEX idx_reports_created_at ON public.reports (created_at DESC);
CREATE INDEX idx_votes_report_id ON public.votes (report_id);
CREATE INDEX idx_votes_device_id ON public.votes (device_id);
