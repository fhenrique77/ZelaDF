-- RECONSTRUCTED EVOLUTION: derived from supabase-auth-migration.sql.
-- No FK to auth.users is added because the historical SQL did not define one.

ALTER TABLE public.reports
  ADD COLUMN author_id UUID,
  ADD COLUMN author_name TEXT DEFAULT 'Cidadão anônimo';

ALTER TABLE public.votes
  ADD COLUMN user_id UUID;

CREATE INDEX idx_votes_user_id ON public.votes (user_id);

CREATE UNIQUE INDEX idx_votes_user_report
  ON public.votes (report_id, user_id)
  WHERE user_id IS NOT NULL;
