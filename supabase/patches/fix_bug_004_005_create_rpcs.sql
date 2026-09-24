-- ZelaDF: Patch cirúrgico para BUG-004 e BUG-005 (Opção A)
-- Instala as 3 RPCs necessárias e suas dependências mínimas:
--   1. set_report_vote(uuid, boolean, text)
--   2. get_my_report_ids(uuid[])
--   3. get_my_reports(double precision, double precision, double precision, double precision, text[], text, integer)
--   + schema zeladf_private, triggers de contagem de confirmações e gatilho de autoria.
-- NÃO altera as políticas (policies) existentes da tabela reports.
-- Executar no SQL Editor do Supabase como Administrador.

BEGIN;

-- Descontinuado: preservava autorizacao publica insegura em reports.
-- Mantido como referencia; nunca aplicar as instrucoes abaixo isoladamente.
DO $retired$
BEGIN
  RAISE EXCEPTION 'Patch descontinuado. Use supabase/repairs/20260910_restore_report_flow.sql apos comparar a estrutura atual. Se este patch antigo ja foi aplicado, reaudite o banco antes do reparo.';
END;
$retired$;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- 1. Bloqueio para garantir atomicidade durante a instalação
LOCK TABLE public.reports, public.votes IN ACCESS EXCLUSIVE MODE;

-- 2. Preflight de verificação mínima das tabelas e colunas
DO $preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'reports'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'votes'
  ) THEN
    RAISE EXCEPTION 'Tabelas reports ou votes não encontradas no schema public';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'reports' AND column_name = 'author_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'votes' AND column_name = 'user_id'
  ) THEN
    RAISE EXCEPTION 'Colunas author_id em reports ou user_id em votes não encontradas';
  END IF;
END;
$preflight$;

-- 3. Schema privado para lógica protegida
CREATE SCHEMA IF NOT EXISTS zeladf_private;
REVOKE ALL ON SCHEMA zeladf_private FROM PUBLIC, anon, authenticated;

-- 4. Garantir remoção de unicidade legada por device_id e garantir unicidade por usuário/aviso
ALTER TABLE public.votes
  DROP CONSTRAINT IF EXISTS votes_report_id_device_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_votes_user_report
  ON public.votes (report_id, user_id)
  WHERE (user_id IS NOT NULL);

-- 5. Reconciliação do contador de confirmações a partir de votes
ALTER TABLE public.reports
  ALTER COLUMN confirmations SET DEFAULT 0;

UPDATE public.reports AS report
SET confirmations = (
  SELECT count(*)::INTEGER
  FROM public.votes AS vote
  WHERE vote.report_id = report.id
);

-- 6. Trigger para atribuir autor autenticado na criação de novos avisos
CREATE OR REPLACE FUNCTION zeladf_private.assign_report_author()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := (SELECT auth.uid());
BEGIN
  IF actor_id IS NOT NULL THEN
    NEW.author_id := actor_id;
  END IF;
  NEW.author_name := 'Cidadão';
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION zeladf_private.assign_report_author()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS assign_report_author ON public.reports;
CREATE TRIGGER assign_report_author
  BEFORE INSERT ON public.reports
  FOR EACH ROW
  EXECUTE FUNCTION zeladf_private.assign_report_author();

-- 7. Triggers de proteção e sincronização do contador de confirmações
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

DROP TRIGGER IF EXISTS protect_initial_report_confirmations ON public.reports;
CREATE TRIGGER protect_initial_report_confirmations
  BEFORE INSERT ON public.reports
  FOR EACH ROW
  EXECUTE FUNCTION zeladf_private.protect_report_confirmations();

DROP TRIGGER IF EXISTS protect_report_confirmation_updates ON public.reports;
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

DROP TRIGGER IF EXISTS sync_report_confirmation_count_after_insert ON public.votes;
CREATE TRIGGER sync_report_confirmation_count_after_insert
  AFTER INSERT ON public.votes
  FOR EACH ROW
  EXECUTE FUNCTION zeladf_private.sync_report_confirmation_count();

DROP TRIGGER IF EXISTS sync_report_confirmation_count_after_delete ON public.votes;
CREATE TRIGGER sync_report_confirmation_count_after_delete
  AFTER DELETE ON public.votes
  FOR EACH ROW
  EXECUTE FUNCTION zeladf_private.sync_report_confirmation_count();

DROP TRIGGER IF EXISTS sync_report_confirmation_count_after_report_change ON public.votes;
CREATE TRIGGER sync_report_confirmation_count_after_report_change
  AFTER UPDATE OF report_id ON public.votes
  FOR EACH ROW
  EXECUTE FUNCTION zeladf_private.sync_report_confirmation_count();

-- 8. Política de leitura de votos próprios (para o cliente carregar status de voto)
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

-- 9. RPC 1: set_report_vote (Resolve BUG-005)
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

-- 10. RPC 2: get_my_report_ids (Suporte a identificação de autoria)
CREATE OR REPLACE FUNCTION public.get_my_report_ids(p_report_ids UUID[])
RETURNS TABLE (report_id UUID)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := (SELECT auth.uid());
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required'
      USING ERRCODE = '42501';
  END IF;

  IF p_report_ids IS NULL OR cardinality(p_report_ids) > 501 THEN
    RAISE EXCEPTION 'Invalid report identifier list'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT report.id
  FROM public.reports AS report
  WHERE report.author_id = actor_id
    AND report.id = ANY(p_report_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_report_ids(UUID[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_report_ids(UUID[])
  TO authenticated;

COMMENT ON FUNCTION public.get_my_report_ids(UUID[]) IS
  'Returns only report IDs owned by the authenticated account.';

-- 11. RPC 3: get_my_reports (Resolve BUG-004)
CREATE OR REPLACE FUNCTION public.get_my_reports(
  p_south DOUBLE PRECISION,
  p_west DOUBLE PRECISION,
  p_north DOUBLE PRECISION,
  p_east DOUBLE PRECISION,
  p_categories TEXT[],
  p_status TEXT,
  p_limit INTEGER
)
RETURNS TABLE (
  id UUID,
  category TEXT,
  title TEXT,
  description TEXT,
  ra TEXT,
  address TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  photo_url TEXT,
  status TEXT,
  confirmations INTEGER,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := (SELECT auth.uid());
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required'
      USING ERRCODE = '42501';
  END IF;

  IF p_south IS NULL
    OR p_west IS NULL
    OR p_north IS NULL
    OR p_east IS NULL
    OR p_south NOT BETWEEN -90 AND 90
    OR p_north NOT BETWEEN -90 AND 90
    OR p_west NOT BETWEEN -180 AND 180
    OR p_east NOT BETWEEN -180 AND 180
    OR p_south > p_north
    OR p_west > p_east THEN
    RAISE EXCEPTION 'Invalid report bounds'
      USING ERRCODE = '22023';
  END IF;

  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 501 THEN
    RAISE EXCEPTION 'Invalid report limit'
      USING ERRCODE = '22023';
  END IF;

  IF p_status IS NOT NULL
    AND p_status NOT IN ('aberto', 'andamento', 'resolvido') THEN
    RAISE EXCEPTION 'Invalid report status'
      USING ERRCODE = '22023';
  END IF;

  IF p_categories IS NOT NULL AND EXISTS (
    SELECT 1
    FROM unnest(p_categories) AS requested_category
    WHERE requested_category NOT IN (
      'agua',
      'buraco',
      'poste',
      'lixo',
      'semaforo',
      'outro'
    )
  ) THEN
    RAISE EXCEPTION 'Invalid report category'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    report.id,
    report.category,
    report.title,
    report.description,
    report.ra,
    report.address,
    report.lat,
    report.lng,
    report.photo_url,
    report.status,
    report.confirmations,
    report.created_at
  FROM public.reports AS report
  WHERE report.author_id = actor_id
    AND report.lat BETWEEN p_south AND p_north
    AND report.lng BETWEEN p_west AND p_east
    AND (
      p_categories IS NULL
      OR cardinality(p_categories) = 0
      OR report.category = ANY(p_categories)
    )
    AND (p_status IS NULL OR report.status = p_status)
  ORDER BY report.created_at DESC
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_reports(
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  TEXT[],
  TEXT,
  INTEGER
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_my_reports(
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  TEXT[],
  TEXT,
  INTEGER
) TO authenticated;

COMMENT ON FUNCTION public.get_my_reports(
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  TEXT[],
  TEXT,
  INTEGER
) IS
  'Returns public report fields for the authenticated owner within validated filters.';

-- 12. Verificação final antes do commit
DO $verify$
BEGIN
  IF NOT has_function_privilege('authenticated','public.set_report_vote(uuid,boolean,text)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.get_my_report_ids(uuid[])','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.get_my_reports(double precision,double precision,double precision,double precision,text[],text,integer)','EXECUTE')
  THEN
    RAISE EXCEPTION 'RPC indisponível para authenticated; patch cancelado';
  END IF;
END;
$verify$;

-- 13. Notificar PostgREST para recarregar o schema imediatamente
NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'Patch cirúrgico aplicado com sucesso. RPCs set_report_vote, get_my_report_ids e get_my_reports instaladas.' AS resultado;
