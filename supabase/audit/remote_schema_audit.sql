-- Read-only metadata audit for the linked/remote ZelaDF project.
-- Run in the Supabase SQL Editor or with a read-only database session.
-- The queries inspect structure only; they do not read application rows or secrets.

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '3s';

SELECT current_setting('server_version') AS postgres_version;
SELECT current_setting('transaction_read_only') AS read_only;

SELECT expected.object_name, to_regclass(expected.object_name) IS NOT NULL AS present
FROM (VALUES
  ('public.reports'), ('public.votes'), ('public.push_tokens'),
  ('public.operator_users'), ('public.report_status_history'), ('public.account_deletion_requests'),
  ('storage.objects'), ('storage.buckets'), ('auth.users'),
  ('supabase_migrations.schema_migrations')
) AS expected(object_name)
ORDER BY expected.object_name;

SELECT
  table_schema,
  table_name,
  column_name,
  ordinal_position,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE (table_schema = 'public'
  AND table_name IN ('reports', 'votes', 'push_tokens', 'operator_users', 'report_status_history', 'account_deletion_requests'))
  OR (table_schema = 'storage' AND table_name IN ('objects', 'buckets'))
ORDER BY table_schema, table_name, ordinal_position;

SELECT
  tc.table_schema,
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  ccu.table_schema AS referenced_schema,
  ccu.table_name AS referenced_table,
  ccu.column_name AS referenced_column
FROM information_schema.table_constraints AS tc
LEFT JOIN information_schema.key_column_usage AS kcu
  ON kcu.constraint_catalog = tc.constraint_catalog
  AND kcu.constraint_schema = tc.constraint_schema
  AND kcu.constraint_name = tc.constraint_name
LEFT JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_catalog = tc.constraint_catalog
  AND ccu.constraint_schema = tc.constraint_schema
  AND ccu.constraint_name = tc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name IN ('reports', 'votes', 'push_tokens', 'operator_users', 'report_status_history', 'account_deletion_requests')
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name, kcu.ordinal_position;

SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE (schemaname = 'public'
  AND tablename IN ('reports', 'votes', 'push_tokens', 'operator_users', 'report_status_history', 'account_deletion_requests'))
  OR (schemaname = 'storage' AND tablename IN ('objects', 'buckets'))
ORDER BY schemaname, tablename, indexname;

SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE (schemaname = 'public' AND tablename IN ('reports', 'votes', 'push_tokens', 'operator_users', 'report_status_history', 'account_deletion_requests'))
   OR (schemaname = 'storage' AND tablename IN ('objects', 'buckets'))
ORDER BY schemaname, tablename, policyname;

SELECT
  n.nspname AS table_schema,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('reports', 'votes', 'push_tokens', 'operator_users', 'report_status_history', 'account_deletion_requests')
  AND c.relkind = 'r'
ORDER BY c.relname;

SELECT
  grantor,
  grantee,
  table_schema,
  table_name,
  privilege_type,
  is_grantable
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('reports', 'votes', 'push_tokens', 'operator_users', 'report_status_history', 'account_deletion_requests')
  AND grantee IN ('anon', 'authenticated')
ORDER BY table_name, grantee, privilege_type;

SELECT
  grantor,
  grantee,
  table_schema,
  table_name,
  column_name,
  privilege_type,
  is_grantable
FROM information_schema.role_column_grants
WHERE table_schema = 'public'
  AND table_name IN ('reports', 'votes')
  AND grantee IN ('anon', 'authenticated')
ORDER BY table_name, grantee, column_name, privilege_type;

SELECT
  n.nspname AS table_schema, c.relname AS table_name,
  t.tgname AS trigger_name, t.tgenabled AS enabled, t.tgtype AS type_mask,
  pn.nspname AS function_schema, p.proname AS function_name,
  -- Raw webhook arguments can contain secrets. Never return them.
  md5(encode(t.tgargs, 'hex')) AS arguments_fingerprint,
  md5(coalesce(t.tgqual::text, '')) AS condition_fingerprint
FROM pg_trigger AS t
JOIN pg_class AS c ON c.oid = t.tgrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
JOIN pg_proc AS p ON p.oid = t.tgfoid
JOIN pg_namespace AS pn ON pn.oid = p.pronamespace
WHERE NOT t.tgisinternal AND (
  (n.nspname = 'public' AND c.relname IN (
    'reports', 'votes', 'push_tokens', 'operator_users', 'report_status_history', 'account_deletion_requests'
  )) OR (n.nspname = 'storage' AND c.relname IN ('objects', 'buckets'))
)
ORDER BY n.nspname, c.relname, t.tgname;

SELECT
  n.nspname AS function_schema,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid) AS result_type,
  p.prosecdef AS security_definer,
  pg_get_userbyid(p.proowner) AS owner,
  p.provolatile AS volatility,
  ARRAY(SELECT setting FROM unnest(p.proconfig) AS setting
    WHERE setting LIKE 'search_path=%') AS search_path,
  -- Fingerprints detect drift; they do not establish semantic equivalence.
  md5(pg_get_functiondef(p.oid)) AS definition_fingerprint,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'zeladf_private') AND p.prokind IN ('f', 'p')
ORDER BY n.nspname, p.proname, arguments;

SELECT
  extname AS extension_name,
  extversion AS extension_version
FROM pg_extension
ORDER BY extname;

SELECT
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
FROM storage.buckets
WHERE id = 'report-photos';

-- Definitions and validation state are needed to distinguish NOT VALID FKs.
SELECT n.nspname AS table_schema, c.relname AS table_name,
  k.conname AS constraint_name, k.contype AS constraint_type,
  k.convalidated AS validated, k.condeferrable AS deferrable,
  pg_get_constraintdef(k.oid, true) AS definition
FROM pg_constraint AS k
JOIN pg_class AS c ON c.oid = k.conrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE (n.nspname = 'public' AND c.relname IN (
  'reports', 'votes', 'push_tokens', 'operator_users', 'report_status_history', 'account_deletion_requests'
)) OR (n.nspname = 'storage' AND c.relname IN ('objects', 'buckets'))
ORDER BY n.nspname, c.relname, k.conname;

-- Effective privileges include grants inherited from roles and PUBLIC.
SELECT n.nspname AS table_schema, c.relname AS table_name,
  r.rolname AS role_name, privilege.name AS privilege,
  has_table_privilege(r.oid, c.oid, privilege.name) AS allowed
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
CROSS JOIN pg_roles AS r
CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
  ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) AS privilege(name)
WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
  AND c.relkind IN ('r', 'p') AND (
    (n.nspname = 'public' AND c.relname IN (
      'reports', 'votes', 'push_tokens', 'operator_users', 'report_status_history', 'account_deletion_requests'
    )) OR (n.nspname = 'storage' AND c.relname IN ('objects', 'buckets'))
  )
ORDER BY n.nspname, c.relname, r.rolname, privilege.name;

SELECT n.nspname AS table_schema, c.relname AS table_name,
  a.attname AS column_name, r.rolname AS role_name, privilege.name AS privilege,
  has_column_privilege(r.oid, c.oid, a.attnum, privilege.name) AS allowed
FROM pg_attribute AS a
JOIN pg_class AS c ON c.oid = a.attrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
CROSS JOIN pg_roles AS r
CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')) AS privilege(name)
WHERE a.attnum > 0 AND NOT a.attisdropped
  AND r.rolname IN ('anon', 'authenticated')
  AND c.relkind IN ('r', 'p') AND (
    (n.nspname = 'public' AND c.relname IN (
      'reports', 'votes', 'push_tokens', 'operator_users', 'report_status_history', 'account_deletion_requests'
    )) OR (n.nspname = 'storage' AND c.relname = 'objects')
  )
ORDER BY n.nspname, c.relname, a.attnum, r.rolname, privilege.name;

SELECT r.rolname AS role_name, r.rolsuper AS superuser,
  r.rolbypassrls AS bypass_rls, n.nspname AS schema_name,
  has_schema_privilege(r.oid, n.oid, 'USAGE') AS usage_allowed,
  has_schema_privilege(r.oid, n.oid, 'CREATE') AS create_allowed
FROM pg_roles AS r CROSS JOIN pg_namespace AS n
WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
  AND n.nspname IN ('public', 'zeladf_private', 'auth', 'storage')
ORDER BY r.rolname, n.nspname;

SELECT n.nspname AS table_schema, c.relname AS table_name,
  c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'storage' AND c.relname IN ('objects', 'buckets');

ROLLBACK;
