-- Read-only follow-up for the four community tables omitted from the main audit.
-- Run all of this file in Supabase SQL Editor. It returns one result grid.
-- No application rows or raw SQL definitions are returned.

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '3s';

WITH expected(name) AS (VALUES
  ('community_consents'), ('community_blocks'),
  ('community_hidden_reports'), ('community_flags')
),
tables AS (
  SELECT c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity
  FROM pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  JOIN expected AS e ON e.name = c.relname
  WHERE n.nspname = 'zeladf_private' AND c.relkind IN ('r', 'p')
),
audit AS (
  SELECT 'object_presence'::text AS section, jsonb_build_object(
    'table_schema', 'zeladf_private', 'table_name', e.name,
    'present', t.oid IS NOT NULL
  ) AS item
  FROM expected AS e LEFT JOIN tables AS t ON t.relname = e.name

  UNION ALL
  SELECT 'rls', jsonb_build_object(
    'table_schema', 'zeladf_private', 'table_name', relname,
    'rls_enabled', relrowsecurity, 'rls_forced', relforcerowsecurity
  ) FROM tables

  UNION ALL
  SELECT 'column', to_jsonb(x) FROM (
    SELECT t.relname AS table_name, a.attname AS column_name,
      format_type(a.atttypid, a.atttypmod) AS data_type,
      a.attnotnull AS not_null,
      ad.oid IS NOT NULL AS has_default,
      md5(pg_get_expr(ad.adbin, ad.adrelid)) AS default_fingerprint
    FROM tables AS t
    JOIN pg_attribute AS a ON a.attrelid = t.oid
    LEFT JOIN pg_attrdef AS ad ON ad.adrelid = t.oid AND ad.adnum = a.attnum
    WHERE a.attnum > 0 AND NOT a.attisdropped
  ) AS x

  UNION ALL
  SELECT 'constraint', to_jsonb(x) FROM (
    SELECT t.relname AS table_name, k.conname AS constraint_name,
      k.contype AS constraint_type, k.convalidated AS validated,
      md5(pg_get_constraintdef(k.oid, true)) AS definition_fingerprint
    FROM tables AS t JOIN pg_constraint AS k ON k.conrelid = t.oid
  ) AS x

  UNION ALL
  SELECT 'index', to_jsonb(x) FROM (
    SELECT t.relname AS table_name, i.relname AS index_name,
      idx.indisunique AS unique_index, idx.indisvalid AS valid,
      md5(pg_get_indexdef(i.oid)) AS definition_fingerprint
    FROM tables AS t
    JOIN pg_index AS idx ON idx.indrelid = t.oid
    JOIN pg_class AS i ON i.oid = idx.indexrelid
  ) AS x

  UNION ALL
  SELECT 'policy', to_jsonb(x) FROM (
    SELECT p.tablename AS table_name, p.policyname AS policy_name,
      p.permissive, p.roles, p.cmd,
      md5(p.qual) AS using_fingerprint,
      md5(p.with_check) AS check_fingerprint
    FROM pg_policies AS p
    JOIN expected AS e ON e.name = p.tablename
    WHERE p.schemaname = 'zeladf_private'
  ) AS x

  UNION ALL
  SELECT 'table_privilege', to_jsonb(x) FROM (
    SELECT t.relname AS table_name, r.rolname AS role_name,
      privilege.name AS privilege,
      has_table_privilege(r.oid, t.oid, privilege.name) AS allowed
    FROM tables AS t
    CROSS JOIN pg_roles AS r
    CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
      ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) AS privilege(name)
    WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
  ) AS x
)
SELECT section, item FROM audit ORDER BY section, item::text;

ROLLBACK;
