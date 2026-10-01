-- Read-only structural audit. Run all of this file in Supabase SQL Editor.
-- One SELECT returns every section in one exportable result grid (section, item).
-- It reads no application rows or credentials. Function bodies, trigger arguments,
-- policy expressions and other definitions are represented by fingerprints only.
-- Keep exports in supabase/audit/results/ (ignored by Git).

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '3s';

WITH audit AS (
  SELECT 'runtime'::text AS section, jsonb_build_object(
    'postgres_version', current_setting('server_version'),
    'read_only', current_setting('transaction_read_only')
  ) AS item

  UNION ALL
  SELECT 'object_presence', to_jsonb(x) FROM (
    SELECT expected.object_name,
      to_regclass(expected.object_name) IS NOT NULL AS present
    FROM (VALUES
      ('public.reports'), ('public.votes'), ('public.push_tokens'),
      ('public.operator_users'), ('public.report_status_history'),
      ('public.account_deletion_requests'), ('storage.objects'),
      ('storage.buckets'), ('auth.users'),
      ('supabase_migrations.schema_migrations')
    ) AS expected(object_name)
  ) AS x

  UNION ALL
  SELECT 'column', to_jsonb(x) FROM (
    SELECT table_schema, table_name, column_name, ordinal_position,
      data_type, is_nullable, column_default IS NOT NULL AS has_default,
      md5(column_default) AS default_fingerprint
    FROM information_schema.columns
    WHERE (table_schema = 'public' AND table_name IN (
      'reports', 'votes', 'push_tokens', 'operator_users',
      'report_status_history', 'account_deletion_requests'
    )) OR (table_schema = 'storage' AND table_name IN ('objects', 'buckets'))
  ) AS x

  UNION ALL
  SELECT 'constraint', to_jsonb(x) FROM (
    SELECT n.nspname AS table_schema, c.relname AS table_name,
      k.conname AS constraint_name, k.contype AS constraint_type,
      k.convalidated AS validated, k.condeferrable AS deferrable,
      md5(pg_get_constraintdef(k.oid, true)) AS definition_fingerprint
    FROM pg_constraint AS k
    JOIN pg_class AS c ON c.oid = k.conrelid
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE (n.nspname = 'public' AND c.relname IN (
      'reports', 'votes', 'push_tokens', 'operator_users',
      'report_status_history', 'account_deletion_requests'
    )) OR (n.nspname = 'storage' AND c.relname IN ('objects', 'buckets'))
  ) AS x

  UNION ALL
  SELECT 'index', to_jsonb(x) FROM (
    SELECT n.nspname AS table_schema, c.relname AS table_name,
      i.relname AS index_name, idx.indisunique AS unique_index,
      idx.indisprimary AS primary_index, idx.indisvalid AS valid,
      md5(pg_get_indexdef(i.oid)) AS definition_fingerprint
    FROM pg_index AS idx
    JOIN pg_class AS c ON c.oid = idx.indrelid
    JOIN pg_class AS i ON i.oid = idx.indexrelid
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE (n.nspname = 'public' AND c.relname IN (
      'reports', 'votes', 'push_tokens', 'operator_users',
      'report_status_history', 'account_deletion_requests'
    )) OR (n.nspname = 'storage' AND c.relname IN ('objects', 'buckets'))
  ) AS x

  UNION ALL
  SELECT 'policy', to_jsonb(x) FROM (
    SELECT schemaname AS table_schema, tablename AS table_name,
      policyname AS policy_name, permissive, roles, cmd,
      qual IS NOT NULL AS has_using, with_check IS NOT NULL AS has_check,
      md5(qual) AS using_fingerprint, md5(with_check) AS check_fingerprint
    FROM pg_policies
    WHERE (schemaname = 'public' AND tablename IN (
      'reports', 'votes', 'push_tokens', 'operator_users',
      'report_status_history', 'account_deletion_requests'
    )) OR (schemaname = 'storage' AND tablename IN ('objects', 'buckets'))
  ) AS x

  UNION ALL
  SELECT 'rls', to_jsonb(x) FROM (
    SELECT n.nspname AS table_schema, c.relname AS table_name,
      c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p') AND (
      (n.nspname = 'public' AND c.relname IN (
        'reports', 'votes', 'push_tokens', 'operator_users',
        'report_status_history', 'account_deletion_requests'
      )) OR (n.nspname = 'storage' AND c.relname IN ('objects', 'buckets'))
    )
  ) AS x

  UNION ALL
  SELECT 'table_privilege', to_jsonb(x) FROM (
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
          'reports', 'votes', 'push_tokens', 'operator_users',
          'report_status_history', 'account_deletion_requests'
        )) OR (n.nspname = 'storage' AND c.relname IN ('objects', 'buckets'))
      )
  ) AS x

  UNION ALL
  SELECT 'column_privilege', to_jsonb(x) FROM (
    SELECT n.nspname AS table_schema, c.relname AS table_name,
      a.attname AS column_name, r.rolname AS role_name,
      privilege.name AS privilege,
      has_column_privilege(r.oid, c.oid, a.attnum, privilege.name) AS allowed
    FROM pg_attribute AS a
    JOIN pg_class AS c ON c.oid = a.attrelid
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    CROSS JOIN pg_roles AS r
    CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'),
      ('REFERENCES')) AS privilege(name)
    WHERE a.attnum > 0 AND NOT a.attisdropped
      AND r.rolname IN ('anon', 'authenticated')
      AND c.relkind IN ('r', 'p') AND (
        (n.nspname = 'public' AND c.relname IN (
          'reports', 'votes', 'push_tokens', 'operator_users',
          'report_status_history', 'account_deletion_requests'
        )) OR (n.nspname = 'storage' AND c.relname = 'objects')
      )
  ) AS x

  UNION ALL
  SELECT 'trigger', to_jsonb(x) FROM (
    SELECT n.nspname AS table_schema, c.relname AS table_name,
      t.tgname AS trigger_name, t.tgenabled AS enabled,
      t.tgtype AS type_mask, pn.nspname AS function_schema,
      p.proname AS function_name,
      md5(encode(t.tgargs, 'hex')) AS arguments_fingerprint,
      md5(coalesce(t.tgqual::text, '')) AS condition_fingerprint
    FROM pg_trigger AS t
    JOIN pg_class AS c ON c.oid = t.tgrelid
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    JOIN pg_proc AS p ON p.oid = t.tgfoid
    JOIN pg_namespace AS pn ON pn.oid = p.pronamespace
    WHERE NOT t.tgisinternal AND (
      (n.nspname = 'public' AND c.relname IN (
        'reports', 'votes', 'push_tokens', 'operator_users',
        'report_status_history', 'account_deletion_requests'
      )) OR (n.nspname = 'storage' AND c.relname IN ('objects', 'buckets'))
    )
  ) AS x

  UNION ALL
  SELECT 'function', to_jsonb(x) FROM (
    SELECT n.nspname AS function_schema, p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS arguments,
      pg_get_function_result(p.oid) AS result_type,
      p.prosecdef AS security_definer, pg_get_userbyid(p.proowner) AS owner,
      p.provolatile AS volatility,
      ARRAY(SELECT setting FROM unnest(p.proconfig) AS setting
        WHERE setting LIKE 'search_path=%') AS search_path,
      md5(pg_get_functiondef(p.oid)) AS definition_fingerprint,
      has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'zeladf_private') AND p.prokind IN ('f', 'p')
  ) AS x

  UNION ALL
  SELECT 'extension', to_jsonb(x) FROM (
    SELECT extname AS extension_name, extversion AS extension_version
    FROM pg_extension
  ) AS x

  UNION ALL
  SELECT 'bucket', to_jsonb(x) FROM (
    SELECT id, name, public, file_size_limit, allowed_mime_types
    FROM storage.buckets WHERE id = 'report-photos'
  ) AS x

  UNION ALL
  SELECT 'schema_privilege', to_jsonb(x) FROM (
    SELECT r.rolname AS role_name, r.rolsuper AS superuser,
      r.rolbypassrls AS bypass_rls, n.nspname AS schema_name,
      has_schema_privilege(r.oid, n.oid, 'USAGE') AS usage_allowed,
      has_schema_privilege(r.oid, n.oid, 'CREATE') AS create_allowed
    FROM pg_roles AS r CROSS JOIN pg_namespace AS n
    WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
      AND n.nspname IN ('public', 'zeladf_private', 'auth', 'storage')
  ) AS x
)
SELECT section, item FROM audit ORDER BY section, item::text;

ROLLBACK;
