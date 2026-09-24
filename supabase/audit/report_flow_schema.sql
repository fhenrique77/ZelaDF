-- Executar inteiro no SQL Editor do MESMO projeto usado no diagnóstico anterior.
-- Somente metadados de reports/votes; nenhuma linha de usuário é consultada.
-- Retorna um único JSON para evitar perder resultados entre abas do SQL Editor.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '15s';

WITH target_tables AS (
  SELECT c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname IN ('reports', 'votes')
), sections AS (
  SELECT 'tables' AS section, coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) AS details
  FROM (SELECT relname, relrowsecurity, relforcerowsecurity FROM target_tables) t
  UNION ALL
  SELECT 'columns', coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
  FROM (
    SELECT table_name, column_name, data_type, udt_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name IN ('reports', 'votes')
    ORDER BY table_name, ordinal_position
  ) t
  UNION ALL
  SELECT 'constraints', coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
  FROM (
    SELECT r.relname AS table_name, c.conname, c.contype, c.convalidated,
      pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c JOIN target_tables r ON r.oid = c.conrelid
    ORDER BY r.relname, c.conname
  ) t
  UNION ALL
  SELECT 'indexes', coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
  FROM (
    SELECT tablename, indexname, indexdef FROM pg_indexes
    WHERE schemaname = 'public' AND tablename IN ('reports', 'votes')
    ORDER BY tablename, indexname
  ) t
  UNION ALL
  SELECT 'policies', coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
  FROM (
    SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('reports', 'votes')
    ORDER BY tablename, policyname
  ) t
  UNION ALL
  SELECT 'triggers', coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
  FROM (
    SELECT r.relname AS table_name, tr.tgname, tr.tgenabled, tr.tgtype,
      tr.tgfoid::regprocedure::text AS function_signature,
      p.prosecdef AS security_definer, md5(p.prosrc) AS body_fingerprint
    FROM pg_trigger tr JOIN target_tables r ON r.oid = tr.tgrelid
    JOIN pg_proc p ON p.oid = tr.tgfoid
    WHERE NOT tr.tgisinternal
    ORDER BY r.relname, tr.tgname
  ) t
  UNION ALL
  SELECT 'effective_column_privileges', coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
  FROM (
    SELECT roles.role_name, r.relname AS table_name, a.attname AS column_name,
      has_column_privilege(roles.role_name, r.oid, a.attnum, 'SELECT') AS can_select,
      has_column_privilege(roles.role_name, r.oid, a.attnum, 'INSERT') AS can_insert,
      has_column_privilege(roles.role_name, r.oid, a.attnum, 'UPDATE') AS can_update
    FROM target_tables r JOIN pg_attribute a ON a.attrelid = r.oid
    CROSS JOIN (VALUES ('anon'), ('authenticated')) roles(role_name)
    WHERE a.attnum > 0 AND NOT a.attisdropped
    ORDER BY roles.role_name, r.relname, a.attnum
  ) t
  UNION ALL
  SELECT 'functions', coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
  FROM (
    SELECT p.oid::regprocedure::text AS signature, p.proargnames,
      p.prosecdef, md5(p.prosrc) AS body_fingerprint
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE (n.nspname = 'zeladf_private') OR
      (n.nspname = 'public' AND p.proname IN
        ('set_report_vote', 'get_my_report_ids', 'get_my_reports'))
    ORDER BY p.oid::regprocedure::text
  ) t
)
SELECT jsonb_pretty(jsonb_build_object(
  'postgres_version', current_setting('server_version'),
  'private_schema_exists', to_regnamespace('zeladf_private') IS NOT NULL,
  'metadata', (SELECT jsonb_object_agg(section, details) FROM sections)
)) AS report_flow_schema;

ROLLBACK;
