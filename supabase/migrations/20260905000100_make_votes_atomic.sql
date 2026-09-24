-- Makes votes the canonical source for confirmations.
-- Audit the remote baseline before applying: this migration reconciles counters
-- and replaces the known legacy vote policies.

ALTER TABLE public.reports
  ALTER COLUMN confirmations SET DEFAULT 0;

UPDATE public.reports AS report
SET confirmations = (
  SELECT count(*)::INTEGER
  FROM public.votes AS vote
  WHERE vote.report_id = report.id
);

ALTER TABLE public.reports
  ALTER COLUMN confirmations SET NOT NULL;

ALTER TABLE public.reports
  ADD CONSTRAINT reports_confirmations_nonnegative
  CHECK (confirmations >= 0);

ALTER TABLE public.votes
  DROP CONSTRAINT IF EXISTS votes_report_id_device_id_key;

DROP POLICY IF EXISTS votes_select ON public.votes;
DROP POLICY IF EXISTS votes_insert ON public.votes;
DROP POLICY IF EXISTS votes_delete ON public.votes;
DROP POLICY IF EXISTS votes_select_own ON public.votes;

REVOKE ALL ON TABLE public.votes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.votes TO authenticated;

CREATE POLICY votes_select_own
  ON public.votes
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION zeladf_private.protect_report_confirmations()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.confirmations := 0;
    RETURN NEW;
  END IF;

  IF NEW.confirmations IS NOT DISTINCT FROM OLD.confirmations THEN
    RETURN NEW;
  END IF;

  IF pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'Report confirmations are maintained from votes'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION zeladf_private.protect_report_confirmations()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER protect_initial_report_confirmations
  BEFORE INSERT ON public.reports
  FOR EACH ROW
  EXECUTE FUNCTION zeladf_private.protect_report_confirmations();

CREATE TRIGGER protect_report_confirmation_updates
  BEFORE UPDATE OF confirmations ON public.reports
  FOR EACH ROW
  EXECUTE FUNCTION zeladf_private.protect_report_confirmations();

CREATE OR REPLACE FUNCTION zeladf_private.sync_report_confirmation_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.reports
    SET confirmations = confirmations + 1
    WHERE id = NEW.report_id;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    UPDATE public.reports
    SET confirmations = greatest(confirmations - 1, 0)
    WHERE id = OLD.report_id;

    RETURN OLD;
  END IF;

  IF NEW.report_id IS DISTINCT FROM OLD.report_id THEN
    UPDATE public.reports
    SET confirmations = greatest(confirmations - 1, 0)
    WHERE id = OLD.report_id;

    UPDATE public.reports
    SET confirmations = confirmations + 1
    WHERE id = NEW.report_id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION zeladf_private.sync_report_confirmation_count()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER sync_report_confirmation_count_after_insert
  AFTER INSERT ON public.votes
  FOR EACH ROW
  EXECUTE FUNCTION zeladf_private.sync_report_confirmation_count();

CREATE TRIGGER sync_report_confirmation_count_after_delete
  AFTER DELETE ON public.votes
  FOR EACH ROW
  EXECUTE FUNCTION zeladf_private.sync_report_confirmation_count();

CREATE TRIGGER sync_report_confirmation_count_after_report_change
  AFTER UPDATE OF report_id ON public.votes
  FOR EACH ROW
  EXECUTE FUNCTION zeladf_private.sync_report_confirmation_count();

CREATE OR REPLACE FUNCTION public.set_report_vote(
  p_report_id UUID,
  p_voted BOOLEAN,
  p_device_id TEXT
)
RETURNS TABLE (
  voted BOOLEAN,
  confirmations INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := (SELECT auth.uid());
  normalized_device_id TEXT := btrim(p_device_id);
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to vote'
      USING ERRCODE = '42501';
  END IF;

  IF p_voted IS NULL THEN
    RAISE EXCEPTION 'Vote state is required'
      USING ERRCODE = '22023';
  END IF;

  IF normalized_device_id IS NULL
    OR char_length(normalized_device_id) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'Invalid device identifier'
      USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.reports
  WHERE id = p_report_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF p_voted THEN
    INSERT INTO public.votes (report_id, device_id, user_id)
    VALUES (p_report_id, normalized_device_id, actor_id)
    ON CONFLICT (report_id, user_id) WHERE user_id IS NOT NULL
    DO NOTHING;
  ELSE
    DELETE FROM public.votes
    WHERE report_id = p_report_id
      AND user_id = actor_id;
  END IF;

  RETURN QUERY
  SELECT
    EXISTS (
      SELECT 1
      FROM public.votes AS vote
      WHERE vote.report_id = p_report_id
        AND vote.user_id = actor_id
    ),
    report.confirmations
  FROM public.reports AS report
  WHERE report.id = p_report_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_report_vote(UUID, BOOLEAN, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_report_vote(UUID, BOOLEAN, TEXT)
  TO authenticated;

COMMENT ON FUNCTION public.set_report_vote(UUID, BOOLEAN, TEXT) IS
  'Idempotently sets the authenticated user vote and returns the materialized canonical count.';
