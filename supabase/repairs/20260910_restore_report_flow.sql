-- ZelaDF: reparo pontual do fluxo de avisos/votos, baseado na auditoria fornecida.
-- Aplicacao administrativa SOMENTE apos revisao, backup e autorizacao.
-- Nao executar db push/migration repair para este arquivo.
-- Preserva linhas e autoria historica. Recalcula confirmations a partir de votes.
-- Nao altera Storage, Auth users, push, operadores ou historico de migrations.
-- Fontes: 20260905000100 (votos) e trecho reports/votes de 20260905000200.
-- Aborta se a estrutura divergir da auditoria ou se ja foi aplicado.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
LOCK TABLE public.reports, public.votes IN ACCESS EXCLUSIVE MODE;
DO $preflight$
DECLARE actual jsonb;
BEGIN
  IF to_regnamespace('zeladf_private') IS NOT NULL OR EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('set_report_vote','get_my_report_ids','get_my_reports')
  ) THEN RAISE EXCEPTION 'Estrutura mudou ou reparo ja aplicado; comparar novamente antes de continuar'; END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid IN ('public.reports'::regclass,'public.votes'::regclass) AND NOT tgisinternal)
  THEN RAISE EXCEPTION 'Triggers nao auditados encontrados'; END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE oid IN ('public.reports'::regclass,'public.votes'::regclass) AND (NOT relrowsecurity OR relforcerowsecurity))
  THEN RAISE EXCEPTION 'Estado RLS diverge da auditoria'; END IF;
  IF EXISTS (SELECT 1 FROM pg_index WHERE indrelid IN ('public.reports'::regclass,'public.votes'::regclass) AND (NOT indisvalid OR NOT indisready))
  THEN RAISE EXCEPTION 'Indice invalido encontrado'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO actual FROM (SELECT table_name, column_name, udt_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('reports','votes')) t;
  IF NOT (actual @> '[{"table_name":"reports","column_name":"id","udt_name":"uuid","is_nullable":"NO"},{"table_name":"reports","column_name":"category","udt_name":"text","is_nullable":"NO"},{"table_name":"reports","column_name":"title","udt_name":"text","is_nullable":"NO"},{"table_name":"reports","column_name":"description","udt_name":"text","is_nullable":"YES"},{"table_name":"reports","column_name":"ra","udt_name":"text","is_nullable":"NO"},{"table_name":"reports","column_name":"address","udt_name":"text","is_nullable":"NO"},{"table_name":"reports","column_name":"lat","udt_name":"float8","is_nullable":"NO"},{"table_name":"reports","column_name":"lng","udt_name":"float8","is_nullable":"NO"},{"table_name":"reports","column_name":"photo_url","udt_name":"text","is_nullable":"YES"},{"table_name":"reports","column_name":"status","udt_name":"text","is_nullable":"YES"},{"table_name":"reports","column_name":"confirmations","udt_name":"int4","is_nullable":"YES"},{"table_name":"reports","column_name":"created_at","udt_name":"timestamptz","is_nullable":"YES"},{"table_name":"reports","column_name":"author_id","udt_name":"uuid","is_nullable":"YES"},{"table_name":"reports","column_name":"author_name","udt_name":"text","is_nullable":"YES"},{"table_name":"votes","column_name":"id","udt_name":"uuid","is_nullable":"NO"},{"table_name":"votes","column_name":"report_id","udt_name":"uuid","is_nullable":"NO"},{"table_name":"votes","column_name":"device_id","udt_name":"text","is_nullable":"NO"},{"table_name":"votes","column_name":"created_at","udt_name":"timestamptz","is_nullable":"YES"},{"table_name":"votes","column_name":"user_id","udt_name":"uuid","is_nullable":"YES"}]'::jsonb AND actual <@ '[{"table_name":"reports","column_name":"id","udt_name":"uuid","is_nullable":"NO"},{"table_name":"reports","column_name":"category","udt_name":"text","is_nullable":"NO"},{"table_name":"reports","column_name":"title","udt_name":"text","is_nullable":"NO"},{"table_name":"reports","column_name":"description","udt_name":"text","is_nullable":"YES"},{"table_name":"reports","column_name":"ra","udt_name":"text","is_nullable":"NO"},{"table_name":"reports","column_name":"address","udt_name":"text","is_nullable":"NO"},{"table_name":"reports","column_name":"lat","udt_name":"float8","is_nullable":"NO"},{"table_name":"reports","column_name":"lng","udt_name":"float8","is_nullable":"NO"},{"table_name":"reports","column_name":"photo_url","udt_name":"text","is_nullable":"YES"},{"table_name":"reports","column_name":"status","udt_name":"text","is_nullable":"YES"},{"table_name":"reports","column_name":"confirmations","udt_name":"int4","is_nullable":"YES"},{"table_name":"reports","column_name":"created_at","udt_name":"timestamptz","is_nullable":"YES"},{"table_name":"reports","column_name":"author_id","udt_name":"uuid","is_nullable":"YES"},{"table_name":"reports","column_name":"author_name","udt_name":"text","is_nullable":"YES"},{"table_name":"votes","column_name":"id","udt_name":"uuid","is_nullable":"NO"},{"table_name":"votes","column_name":"report_id","udt_name":"uuid","is_nullable":"NO"},{"table_name":"votes","column_name":"device_id","udt_name":"text","is_nullable":"NO"},{"table_name":"votes","column_name":"created_at","udt_name":"timestamptz","is_nullable":"YES"},{"table_name":"votes","column_name":"user_id","udt_name":"uuid","is_nullable":"YES"}]'::jsonb) THEN RAISE EXCEPTION 'Auditoria divergente: columns'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO actual FROM (SELECT indexdef, indexname, tablename FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('reports','votes')) t;
  IF NOT (actual @> '[{"indexdef":"CREATE INDEX idx_reports_category ON public.reports USING btree (category)","indexname":"idx_reports_category","tablename":"reports"},{"indexdef":"CREATE INDEX idx_reports_created_at ON public.reports USING btree (created_at DESC)","indexname":"idx_reports_created_at","tablename":"reports"},{"indexdef":"CREATE INDEX idx_reports_status ON public.reports USING btree (status)","indexname":"idx_reports_status","tablename":"reports"},{"indexdef":"CREATE UNIQUE INDEX reports_pkey ON public.reports USING btree (id)","indexname":"reports_pkey","tablename":"reports"},{"indexdef":"CREATE INDEX idx_votes_device_id ON public.votes USING btree (device_id)","indexname":"idx_votes_device_id","tablename":"votes"},{"indexdef":"CREATE INDEX idx_votes_report_id ON public.votes USING btree (report_id)","indexname":"idx_votes_report_id","tablename":"votes"},{"indexdef":"CREATE INDEX idx_votes_user_id ON public.votes USING btree (user_id)","indexname":"idx_votes_user_id","tablename":"votes"},{"indexdef":"CREATE UNIQUE INDEX idx_votes_user_report ON public.votes USING btree (report_id, user_id) WHERE (user_id IS NOT NULL)","indexname":"idx_votes_user_report","tablename":"votes"},{"indexdef":"CREATE UNIQUE INDEX votes_pkey ON public.votes USING btree (id)","indexname":"votes_pkey","tablename":"votes"},{"indexdef":"CREATE UNIQUE INDEX votes_report_id_device_id_key ON public.votes USING btree (report_id, device_id)","indexname":"votes_report_id_device_id_key","tablename":"votes"}]'::jsonb AND actual <@ '[{"indexdef":"CREATE INDEX idx_reports_category ON public.reports USING btree (category)","indexname":"idx_reports_category","tablename":"reports"},{"indexdef":"CREATE INDEX idx_reports_created_at ON public.reports USING btree (created_at DESC)","indexname":"idx_reports_created_at","tablename":"reports"},{"indexdef":"CREATE INDEX idx_reports_status ON public.reports USING btree (status)","indexname":"idx_reports_status","tablename":"reports"},{"indexdef":"CREATE UNIQUE INDEX reports_pkey ON public.reports USING btree (id)","indexname":"reports_pkey","tablename":"reports"},{"indexdef":"CREATE INDEX idx_votes_device_id ON public.votes USING btree (device_id)","indexname":"idx_votes_device_id","tablename":"votes"},{"indexdef":"CREATE INDEX idx_votes_report_id ON public.votes USING btree (report_id)","indexname":"idx_votes_report_id","tablename":"votes"},{"indexdef":"CREATE INDEX idx_votes_user_id ON public.votes USING btree (user_id)","indexname":"idx_votes_user_id","tablename":"votes"},{"indexdef":"CREATE UNIQUE INDEX idx_votes_user_report ON public.votes USING btree (report_id, user_id) WHERE (user_id IS NOT NULL)","indexname":"idx_votes_user_report","tablename":"votes"},{"indexdef":"CREATE UNIQUE INDEX votes_pkey ON public.votes USING btree (id)","indexname":"votes_pkey","tablename":"votes"},{"indexdef":"CREATE UNIQUE INDEX votes_report_id_device_id_key ON public.votes USING btree (report_id, device_id)","indexname":"votes_report_id_device_id_key","tablename":"votes"}]'::jsonb) THEN RAISE EXCEPTION 'Auditoria divergente: indexes'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO actual FROM (SELECT c.conname, c.contype::text AS contype, pg_get_constraintdef(c.oid) AS definition, r.relname AS table_name, c.convalidated FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public' AND r.relname IN ('reports','votes')) t;
  IF NOT (actual @> '[{"conname":"reports_pkey","contype":"p","definition":"PRIMARY KEY (id)","table_name":"reports","convalidated":true},{"conname":"reports_status_check","contype":"c","definition":"CHECK ((status = ANY (ARRAY[''aberto''::text, ''andamento''::text, ''resolvido''::text])))","table_name":"reports","convalidated":true},{"conname":"votes_pkey","contype":"p","definition":"PRIMARY KEY (id)","table_name":"votes","convalidated":true},{"conname":"votes_report_id_device_id_key","contype":"u","definition":"UNIQUE (report_id, device_id)","table_name":"votes","convalidated":true},{"conname":"votes_report_id_fkey","contype":"f","definition":"FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE","table_name":"votes","convalidated":true}]'::jsonb AND actual <@ '[{"conname":"reports_pkey","contype":"p","definition":"PRIMARY KEY (id)","table_name":"reports","convalidated":true},{"conname":"reports_status_check","contype":"c","definition":"CHECK ((status = ANY (ARRAY[''aberto''::text, ''andamento''::text, ''resolvido''::text])))","table_name":"reports","convalidated":true},{"conname":"votes_pkey","contype":"p","definition":"PRIMARY KEY (id)","table_name":"votes","convalidated":true},{"conname":"votes_report_id_device_id_key","contype":"u","definition":"UNIQUE (report_id, device_id)","table_name":"votes","convalidated":true},{"conname":"votes_report_id_fkey","contype":"f","definition":"FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE","table_name":"votes","convalidated":true}]'::jsonb) THEN RAISE EXCEPTION 'Auditoria divergente: constraints'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO actual FROM (SELECT cmd, qual, roles, tablename, permissive, policyname, with_check FROM pg_policies WHERE schemaname='public' AND tablename IN ('reports','votes')) t;
  IF NOT (actual @> '[{"cmd":"INSERT","qual":null,"roles":["public"],"tablename":"reports","permissive":"PERMISSIVE","policyname":"reports_insert","with_check":"true"},{"cmd":"SELECT","qual":"true","roles":["public"],"tablename":"reports","permissive":"PERMISSIVE","policyname":"reports_select","with_check":null},{"cmd":"UPDATE","qual":"true","roles":["public"],"tablename":"reports","permissive":"PERMISSIVE","policyname":"reports_update","with_check":null},{"cmd":"DELETE","qual":"true","roles":["public"],"tablename":"votes","permissive":"PERMISSIVE","policyname":"votes_delete","with_check":null},{"cmd":"INSERT","qual":null,"roles":["public"],"tablename":"votes","permissive":"PERMISSIVE","policyname":"votes_insert","with_check":"true"},{"cmd":"SELECT","qual":"true","roles":["public"],"tablename":"votes","permissive":"PERMISSIVE","policyname":"votes_select","with_check":null}]'::jsonb AND actual <@ '[{"cmd":"INSERT","qual":null,"roles":["public"],"tablename":"reports","permissive":"PERMISSIVE","policyname":"reports_insert","with_check":"true"},{"cmd":"SELECT","qual":"true","roles":["public"],"tablename":"reports","permissive":"PERMISSIVE","policyname":"reports_select","with_check":null},{"cmd":"UPDATE","qual":"true","roles":["public"],"tablename":"reports","permissive":"PERMISSIVE","policyname":"reports_update","with_check":null},{"cmd":"DELETE","qual":"true","roles":["public"],"tablename":"votes","permissive":"PERMISSIVE","policyname":"votes_delete","with_check":null},{"cmd":"INSERT","qual":null,"roles":["public"],"tablename":"votes","permissive":"PERMISSIVE","policyname":"votes_insert","with_check":"true"},{"cmd":"SELECT","qual":"true","roles":["public"],"tablename":"votes","permissive":"PERMISSIVE","policyname":"votes_select","with_check":null}]'::jsonb) THEN RAISE EXCEPTION 'Auditoria divergente: policies'; END IF;
END;
$preflight$;

CREATE SCHEMA zeladf_private;
REVOKE ALL ON SCHEMA zeladf_private FROM PUBLIC, anon, authenticated;

-- Remove tambem grants por coluna, que sobrevivem a REVOKE de tabela.
DO $grants$
DECLARE t record;
BEGIN
  FOR t IN SELECT table_name, string_agg(quote_ident(column_name), ',') AS cols
    FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('reports','votes') GROUP BY table_name
  LOOP
    EXECUTE format('REVOKE SELECT (%s), INSERT (%s), UPDATE (%s), REFERENCES (%s) ON public.%I FROM PUBLIC, anon, authenticated', t.cols,t.cols,t.cols,t.cols,t.table_name);
  END LOOP;
END;
$grants$;

-- Defaults conhecidos do contrato; nao reescreve linhas historicas.
ALTER TABLE public.reports ALTER COLUMN id SET DEFAULT gen_random_uuid(), ALTER COLUMN created_at SET DEFAULT now(), ALTER COLUMN status SET DEFAULT 'aberto';
ALTER TABLE public.votes ALTER COLUMN id SET DEFAULT gen_random_uuid(), ALTER COLUMN created_at SET DEFAULT now();

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

-- Enforces the ZelaDF authorization model at the database boundary.
-- Audit the remote baseline and existing Storage policies before applying.

ALTER TABLE public.reports
  ADD CONSTRAINT reports_author_id_fkey
  FOREIGN KEY (author_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE
  NOT VALID;

ALTER TABLE public.votes
  ADD CONSTRAINT votes_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE
  NOT VALID;

COMMENT ON CONSTRAINT reports_author_id_fkey ON public.reports IS
  'Enforced for new writes. Validate only after auditing historical author identifiers.';

COMMENT ON CONSTRAINT votes_user_id_fkey ON public.votes IS
  'Enforced for new writes. Validate only after auditing historical vote identifiers.';

CREATE OR REPLACE FUNCTION zeladf_private.assign_report_author()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := (SELECT auth.uid());
BEGIN
  IF actor_id IS NULL THEN
    IF current_user IN ('anon', 'authenticated') THEN
      RAISE EXCEPTION 'Authentication is required to create a report'
        USING ERRCODE = '42501';
    END IF;

    -- Allows trusted maintenance and the local demonstration seed to keep
    -- author_id null. Client roles are rejected above.
    NEW.author_name := 'Cidadão';
    RETURN NEW;
  END IF;

  NEW.author_id := actor_id;
  NEW.author_name := 'Cidadão';
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION zeladf_private.assign_report_author()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER assign_report_author
  BEFORE INSERT ON public.reports
  FOR EACH ROW
  EXECUTE FUNCTION zeladf_private.assign_report_author();

-- A policy is permissive by default and policies are combined with OR. Remove
-- every earlier policy from these application-owned tables before rebuilding
-- the exact contract below.
DO $$
DECLARE
  existing_policy RECORD;
BEGIN
  FOR existing_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'reports'
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON public.reports',
      existing_policy.policyname
    );
  END LOOP;

  FOR existing_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'votes'
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON public.votes',
      existing_policy.policyname
    );
  END LOOP;
END
$$;

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.reports FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.votes FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id,
  category,
  title,
  description,
  ra,
  address,
  lat,
  lng,
  photo_url,
  status,
  confirmations,
  created_at
) ON public.reports TO anon, authenticated;

GRANT INSERT (
  category,
  title,
  description,
  ra,
  address,
  lat,
  lng,
  photo_url
) ON public.reports TO authenticated;

GRANT UPDATE (
  category,
  title,
  description,
  photo_url
) ON public.reports TO authenticated;

GRANT DELETE ON TABLE public.reports TO authenticated;
GRANT SELECT (report_id) ON public.votes TO authenticated;

CREATE POLICY reports_read_public
  ON public.reports
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY reports_insert_authenticated
  ON public.reports
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND author_id = (SELECT auth.uid())
  );

CREATE POLICY reports_update_own
  ON public.reports
  FOR UPDATE
  TO authenticated
  USING (author_id = (SELECT auth.uid()))
  WITH CHECK (author_id = (SELECT auth.uid()));

CREATE POLICY reports_delete_own
  ON public.reports
  FOR DELETE
  TO authenticated
  USING (author_id = (SELECT auth.uid()));

CREATE POLICY votes_select_own
  ON public.votes
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

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

COMMENT ON FUNCTION public.get_my_report_ids(UUID[]) IS
  'Returns only report IDs owned by the authenticated account.';

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


-- Falha fechada se privilegios herdados ainda expuserem colunas internas.
DO $verify$
BEGIN
  IF has_column_privilege('anon','public.reports','author_id','SELECT')
    OR has_column_privilege('authenticated','public.reports','author_id','SELECT')
    OR has_column_privilege('anon','public.reports','author_name','SELECT')
    OR has_column_privilege('authenticated','public.reports','author_name','SELECT')
    OR has_column_privilege('authenticated','public.votes','user_id','SELECT')
    OR has_column_privilege('authenticated','public.reports','confirmations','UPDATE')
    OR has_column_privilege('anon','public.reports','title','INSERT')
    OR has_column_privilege('authenticated','public.votes','report_id','INSERT')
  THEN RAISE EXCEPTION 'Privilegios herdados inesperados; reparo cancelado'; END IF;
  IF NOT has_function_privilege('authenticated','public.set_report_vote(uuid,boolean,text)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.get_my_report_ids(uuid[])','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.get_my_reports(double precision,double precision,double precision,double precision,text[],text,integer)','EXECUTE')
  THEN RAISE EXCEPTION 'RPC indisponivel; reparo cancelado'; END IF;
END;
$verify$;
NOTIFY pgrst, 'reload schema';
COMMIT;

SELECT 'Reparo aplicado. Validar confirmacao e Meus avisos no aplicativo.' AS resultado;
