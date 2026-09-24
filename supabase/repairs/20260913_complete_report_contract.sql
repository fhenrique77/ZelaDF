-- Complemento do reparo de avisos, apos auditoria de 2026-09-13.
-- Instala contratos ja existentes no frontend; nao cria operadores.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ BEGIN
  IF to_regprocedure('public.set_report_vote(uuid,boolean,text)') IS NULL
    OR to_regclass('public.operator_users') IS NOT NULL
    OR to_regclass('public.report_status_history') IS NOT NULL
    OR to_regprocedure('public.current_user_is_operator()') IS NOT NULL
    OR to_regprocedure('public.change_report_status(uuid,text,text)') IS NOT NULL
    OR EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.reports'::regclass AND conname='reports_category_allowed')
  THEN RAISE EXCEPTION 'Estrutura divergiu da auditoria; revisar complemento'; END IF;
  IF EXISTS (SELECT 1 FROM public.reports r WHERE author_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id=r.author_id))
    OR EXISTS (SELECT 1 FROM public.votes v WHERE user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id=v.user_id))
  THEN RAISE EXCEPTION 'Referencias historicas Auth invalidas; nenhuma linha alterada'; END IF;
END $$;
ALTER TABLE public.reports VALIDATE CONSTRAINT reports_author_id_fkey;
ALTER TABLE public.votes VALIDATE CONSTRAINT votes_user_id_fkey;

-- Supports viewport, filter and author queries introduced in the web client.
-- Apply only after confirming the remote schema matches the documented baseline.

CREATE INDEX IF NOT EXISTS idx_reports_lat
  ON public.reports (lat);

CREATE INDEX IF NOT EXISTS idx_reports_lng
  ON public.reports (lng);

CREATE INDEX IF NOT EXISTS idx_reports_category_status_created_at
  ON public.reports (category, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reports_author_created_at
  ON public.reports (author_id, created_at DESC)
  WHERE author_id IS NOT NULL;

-- Adds server-side validation for reports and narrows report photo writes.
-- Apply only after auditing the remote schema and existing Storage policies.

ALTER TABLE public.reports
  ADD CONSTRAINT reports_category_allowed
  CHECK (category IN ('agua', 'buraco', 'poste', 'lixo', 'semaforo', 'outro'))
  NOT VALID;

ALTER TABLE public.reports
  ADD CONSTRAINT reports_title_length
  CHECK (char_length(btrim(title)) >= 5 AND char_length(title) <= 120)
  NOT VALID;

ALTER TABLE public.reports
  ADD CONSTRAINT reports_description_length
  CHECK (char_length(coalesce(description, '')) <= 2000)
  NOT VALID;

ALTER TABLE public.reports
  ADD CONSTRAINT reports_ra_length
  CHECK (char_length(btrim(ra)) >= 2 AND char_length(ra) <= 80)
  NOT VALID;

ALTER TABLE public.reports
  ADD CONSTRAINT reports_address_length
  CHECK (char_length(btrim(address)) >= 3 AND char_length(address) <= 200)
  NOT VALID;

ALTER TABLE public.reports
  ADD CONSTRAINT reports_coordinates_valid
  CHECK (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180)
  NOT VALID;

ALTER TABLE public.reports
  ADD CONSTRAINT reports_status_allowed
  CHECK (status IN ('aberto', 'andamento', 'resolvido'))
  NOT VALID;


-- Defines the internal ZelaDF operator role and an auditable status workflow.
-- No operator is provisioned by this migration. Audit the remote baseline first.

CREATE TABLE public.operator_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.operator_users IS
  'Internal ZelaDF operators. Membership does not represent a government role or partnership.';

CREATE TABLE public.report_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  from_status TEXT NOT NULL CHECK (from_status IN ('aberto', 'andamento', 'resolvido')),
  to_status TEXT NOT NULL CHECK (to_status IN ('aberto', 'andamento', 'resolvido')),
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 10 AND 500),
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_status <> to_status)
);

CREATE INDEX idx_report_status_history_report_changed_at
  ON public.report_status_history (report_id, changed_at DESC);

ALTER TABLE public.operator_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_status_history ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.operator_users FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.report_status_history FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.current_user_is_operator()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.operator_users
      WHERE user_id = (SELECT auth.uid())
    );
$$;

REVOKE ALL ON FUNCTION public.current_user_is_operator() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_is_operator() TO authenticated;

GRANT SELECT ON TABLE public.report_status_history TO authenticated;

CREATE POLICY "Operators can read report status history"
  ON public.report_status_history
  FOR SELECT
  TO authenticated
  USING ((SELECT public.current_user_is_operator()));

CREATE OR REPLACE FUNCTION zeladf_private.enforce_initial_report_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'aberto' THEN
    RAISE EXCEPTION 'New reports must start open'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION zeladf_private.enforce_initial_report_status()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER enforce_initial_report_status
  BEFORE INSERT ON public.reports
  FOR EACH ROW
  EXECUTE FUNCTION zeladf_private.enforce_initial_report_status();

CREATE OR REPLACE FUNCTION zeladf_private.enforce_report_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := (SELECT auth.uid());
  change_reason TEXT := btrim(current_setting('zeladf.status_reason', true));
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF actor_id IS NULL OR NOT (SELECT public.current_user_is_operator()) THEN
    RAISE EXCEPTION 'Only an internal operator can change report status'
      USING ERRCODE = '42501';
  END IF;

  IF change_reason IS NULL OR char_length(change_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'A status reason between 10 and 500 characters is required'
      USING ERRCODE = '22023';
  END IF;

  IF NOT (
    (OLD.status = 'aberto' AND NEW.status IN ('andamento', 'resolvido'))
    OR (OLD.status = 'andamento' AND NEW.status IN ('aberto', 'resolvido'))
    OR (OLD.status = 'resolvido' AND NEW.status = 'aberto')
  ) THEN
    RAISE EXCEPTION 'Invalid report status transition'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.report_status_history (
    report_id,
    from_status,
    to_status,
    reason,
    changed_by
  ) VALUES (
    OLD.id,
    OLD.status,
    NEW.status,
    change_reason,
    actor_id
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION zeladf_private.enforce_report_status_transition()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER enforce_report_status_transition
  BEFORE UPDATE OF status ON public.reports
  FOR EACH ROW
  EXECUTE FUNCTION zeladf_private.enforce_report_status_transition();

CREATE OR REPLACE FUNCTION public.change_report_status(
  p_report_id UUID,
  p_new_status TEXT,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_reason TEXT := btrim(p_reason);
  current_report_status TEXT;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT (SELECT public.current_user_is_operator()) THEN
    RAISE EXCEPTION 'Only an internal operator can change report status'
      USING ERRCODE = '42501';
  END IF;

  IF normalized_reason IS NULL
    OR char_length(normalized_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'A status reason between 10 and 500 characters is required'
      USING ERRCODE = '22023';
  END IF;

  IF p_new_status IS NULL
    OR p_new_status NOT IN ('aberto', 'andamento', 'resolvido') THEN
    RAISE EXCEPTION 'Invalid report status'
      USING ERRCODE = '22023';
  END IF;

  SELECT status
  INTO current_report_status
  FROM public.reports
  WHERE id = p_report_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    (current_report_status = 'aberto' AND p_new_status IN ('andamento', 'resolvido'))
    OR (current_report_status = 'andamento' AND p_new_status IN ('aberto', 'resolvido'))
    OR (current_report_status = 'resolvido' AND p_new_status = 'aberto')
  ) THEN
    RAISE EXCEPTION 'Invalid report status transition'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('zeladf.status_reason', normalized_reason, true);

  UPDATE public.reports
  SET status = p_new_status
  WHERE id = p_report_id;
END;
$$;

REVOKE ALL ON FUNCTION public.change_report_status(UUID, TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_report_status(UUID, TEXT, TEXT)
  TO authenticated;

COMMENT ON FUNCTION public.change_report_status(UUID, TEXT, TEXT) IS
  'Atomic operator-only transition. The trigger validates and records actor, reason and timestamp.';

NOTIFY pgrst, 'reload schema';
COMMIT;
SELECT 'Validacao, indices e fluxo de status instalados; nenhum operador criado.' AS resultado;
