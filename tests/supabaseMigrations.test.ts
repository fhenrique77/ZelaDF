import { createHash } from "node:crypto"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()
const read = (path: string) => readFileSync(resolve(root, path), "utf8")

const expectedMigrations = [
  "20260903000100_create_core_schema.sql",
  "20260903000200_add_authorship_and_vote_identity.sql",
  "20260903000300_create_report_photos_bucket.sql",
  "20260904000100_add_report_query_indexes.sql",
  "20260904000200_add_report_validation_and_photo_policies.sql",
  "20260904000300_minimize_public_author_identity.sql",
  "20260904000400_create_push_tokens.sql",
  "20260904000500_create_status_workflow.sql",
  "20260905000100_make_votes_atomic.sql",
  "20260905000200_secure_reports_votes_and_storage.sql",
  "20260905000300_create_account_deletion_requests.sql",
  "20260913000100_community_safety.sql",
]

describe("Supabase migration structure", () => {
  it("keeps migrations timestamped and in the expected order", () => {
    const migrations = readdirSync(resolve(root, "supabase/migrations"))
      .filter((name) => name.endsWith(".sql"))
      .sort()

    expect(migrations).toEqual(expectedMigrations)
    for (const migration of migrations) {
      expect(migration).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/)
    }
  })

  it("separates core schema, authorship and Storage evolution", () => {
    const core = read(`supabase/migrations/${expectedMigrations[0]}`)
    const authorship = read(`supabase/migrations/${expectedMigrations[1]}`)
    const storage = read(`supabase/migrations/${expectedMigrations[2]}`)

    expect(core).toContain("CREATE TABLE public.reports")
    expect(core).toContain("CREATE TABLE public.votes")
    expect(core).not.toContain("00000000-0000-0000-0000-000000000001")
    expect(authorship).toContain("ADD COLUMN author_id UUID")
    expect(authorship).toContain("ADD COLUMN user_id UUID")
    expect(storage).toContain("INSERT INTO storage.buckets")
  })

  it("removes account-derived public author names irreversibly", () => {
    const privacy = read(`supabase/migrations/${expectedMigrations[5]}`)

    expect(privacy).toContain("SET author_name = 'Cidadão'")
    expect(privacy).toContain("CHECK (author_name = 'Cidadão')")
    expect(privacy).not.toMatch(/auth\.users|raw_user_meta_data|user_metadata/i)
  })

  it("protects push tokens by account and prepares safe reassignment", () => {
    const push = read(`supabase/migrations/${expectedMigrations[6]}`)

    expect(push).toContain("CREATE TABLE public.push_tokens")
    expect(push).toContain("REFERENCES auth.users(id) ON DELETE CASCADE")
    expect(push).toContain("CONSTRAINT push_tokens_token_unique UNIQUE (token)")
    expect(push).toContain(
      "ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY",
    )
    expect(push).toContain(
      "REVOKE ALL ON TABLE public.push_tokens FROM anon, authenticated",
    )
    expect(push.match(/\(SELECT auth\.uid\(\)\) = user_id/g)).toHaveLength(5)
    expect(push).toContain(
      "CREATE OR REPLACE FUNCTION zeladf_private.reassign_push_token()",
    )
    expect(push).toContain("SECURITY DEFINER")
    expect(push).toContain("SET search_path = ''")
    expect(push).toContain(
      "REVOKE ALL ON FUNCTION zeladf_private.reassign_push_token() FROM PUBLIC",
    )
    expect(push).toContain(
      "REVOKE ALL ON SCHEMA zeladf_private FROM PUBLIC, anon, authenticated",
    )
  })

  it("protects operator membership and records controlled status transitions", () => {
    const workflow = read(`supabase/migrations/${expectedMigrations[7]}`)

    expect(workflow).toContain("CREATE TABLE public.operator_users")
    expect(workflow).toContain("CREATE TABLE public.report_status_history")
    expect(workflow).toContain(
      "ALTER TABLE public.operator_users ENABLE ROW LEVEL SECURITY",
    )
    expect(workflow).toContain(
      "ALTER TABLE public.report_status_history ENABLE ROW LEVEL SECURITY",
    )
    expect(workflow).toContain("public.current_user_is_operator()")
    expect(workflow).toContain("public.change_report_status(")
    expect(workflow).toContain("SECURITY DEFINER")
    expect(workflow).toContain("SET search_path = ''")
    expect(workflow).toContain("FOR UPDATE")
    expect(workflow).toContain("BEFORE UPDATE OF status ON public.reports")
    expect(workflow).toContain("NEW.status IS DISTINCT FROM 'aberto'")
    expect(workflow).toContain(
      "char_length(change_reason) NOT BETWEEN 10 AND 500",
    )
    expect(workflow).toContain("INSERT INTO public.report_status_history")
    expect(workflow).toContain("changed_by")
    expect(workflow).toContain("changed_at")
    expect(workflow).not.toMatch(/INSERT INTO public\.operator_users/i)
  })

  it("makes votes canonical and the materialized count atomic", () => {
    const votes = read(`supabase/migrations/${expectedMigrations[8]}`)

    expect(votes).toContain("ALTER COLUMN confirmations SET DEFAULT 0")
    expect(votes).toContain("SELECT count(*)::INTEGER")
    expect(votes).toContain(
      "DROP CONSTRAINT IF EXISTS votes_report_id_device_id_key",
    )
    expect(votes).toContain("REVOKE ALL ON TABLE public.votes")
    expect(votes).toContain("CREATE POLICY votes_select_own")
    expect(votes).toContain("user_id = (SELECT auth.uid())")
    expect(votes).toContain("zeladf_private.protect_report_confirmations()")
    expect(votes).toContain("NEW.confirmations := 0")
    expect(votes).toContain("pg_trigger_depth() < 2")
    expect(votes).toContain("zeladf_private.sync_report_confirmation_count()")
    expect(votes).toContain("confirmations = confirmations + 1")
    expect(votes).toContain("public.set_report_vote(")
    expect(votes).toContain("SECURITY DEFINER")
    expect(votes).toContain("SET search_path = ''")
    expect(votes).toContain("FOR UPDATE")
    expect(votes).toContain(
      "ON CONFLICT (report_id, user_id) WHERE user_id IS NOT NULL",
    )
  })

  it("enforces authorship, least privilege and owned Storage paths", () => {
    const authorization = read(`supabase/migrations/${expectedMigrations[9]}`)

    expect(authorization).toContain("reports_author_id_fkey")
    expect(authorization).toContain("votes_user_id_fkey")
    expect(authorization.match(/REFERENCES auth\.users\(id\)/g)).toHaveLength(2)
    expect(authorization.match(/ON DELETE CASCADE/g)).toHaveLength(2)
    expect(authorization.match(/NOT VALID/g)).toHaveLength(2)
    expect(authorization).toContain(
      "CREATE OR REPLACE FUNCTION zeladf_private.assign_report_author()",
    )
    expect(authorization).toContain("NEW.author_id := actor_id")
    expect(authorization).toContain(
      "REVOKE ALL ON TABLE public.reports FROM PUBLIC, anon, authenticated",
    )
    expect(authorization).toContain(
      "REVOKE ALL ON TABLE public.votes FROM PUBLIC, anon, authenticated",
    )
    expect(authorization).toContain("GRANT SELECT (")
    expect(authorization).toContain("ON public.reports TO anon, authenticated")
    expect(authorization).toContain("GRANT INSERT (")
    expect(authorization).toContain("GRANT UPDATE (")
    expect(authorization).toContain("CREATE POLICY reports_read_public")
    expect(authorization).toContain(
      "CREATE POLICY reports_insert_authenticated",
    )
    expect(authorization).toContain("CREATE POLICY reports_update_own")
    expect(authorization).toContain("CREATE POLICY reports_delete_own")
    expect(authorization).toContain("CREATE POLICY votes_select_own")
    expect(authorization).toContain("author_id = (SELECT auth.uid())")
    expect(authorization).toContain("user_id = (SELECT auth.uid())")
    expect(authorization).toContain("public.get_my_report_ids")
    expect(authorization).toContain("public.get_my_reports")
    expect(authorization).toContain("SECURITY DEFINER")
    expect(authorization).toContain("SET search_path = ''")
    expect(authorization).toContain('CREATE POLICY "report_photos_select_own"')
    expect(authorization).toContain(
      'CREATE POLICY "report_photos_insert_own_folder"',
    )
    expect(authorization).toContain('CREATE POLICY "report_photos_delete_own"')
    expect(authorization).toContain("(storage.foldername(name))[1]")
    expect(
      authorization.match(/owner_id = \(SELECT auth\.uid\(\)::text\)/g),
    ).toHaveLength(3)
  })

  it("covers the authorization matrix in the pgTAP contract", () => {
    const contract = read("supabase/tests/database/rls_contract_test.sql")

    expect(contract).toContain("select plan(68)")
    expect(contract).toContain("set local role anon")
    expect(contract).toContain("set local role authenticated")
    expect(contract).toContain("visitors cannot create reports")
    expect(contract).toContain("authors may edit an allowed field")
    expect(contract).toContain("authors cannot update another users report")
    expect(contract).toContain("operators do not receive implicit permission")
    expect(contract).toContain(
      "authenticated users cannot insert votes directly",
    )
    expect(contract).toContain(
      "authenticated users may upload into their own folder",
    )
    expect(contract).toContain("users cannot remove another users photo")
  })

  it("keeps demonstration rows only in the seed", () => {
    const seed = read("supabase/seed.sql")
    const migrationSql = expectedMigrations
      .map((name) => read(`supabase/migrations/${name}`))
      .join("\n")

    expect(seed).toContain("INSERT INTO public.reports")
    expect(seed).toContain("development and tests only")
    expect(seed).not.toMatch(/\b(CREATE|ALTER|DROP)\b/)
    expect(migrationSql).not.toContain("00000000-0000-0000-0000-000000000001")
  })

  it("configures local seed without remote identifiers or secrets", () => {
    const config = read("supabase/config.toml")

    expect(config).toContain('project_id = "zeladf-local"')
    expect(config).toContain('sql_paths = ["./seed.sql"]')
    expect(config).not.toMatch(/service_role|private_key|password\s*=/i)
  })

  it("detects silent changes to historical root SQL files", () => {
    const manifest = read("supabase/HISTORICAL_SQL.sha256")
    const expectedHashes = new Map(
      manifest
        .split(/\r?\n/)
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
          const [hash, path] = line.split(/\s+/, 2)
          return [path, hash]
        }),
    )

    for (const [path, expectedHash] of expectedHashes) {
      const actualHash = createHash("sha256").update(read(path)).digest("hex")
      expect(actualHash.toUpperCase()).toBe(expectedHash)
    }
  })

  it("keeps the remote audit script read-only", () => {
    const audit = read("supabase/audit/remote_schema_audit.sql").replace(
      /^\s*--.*$/gm,
      "",
    )

    expect(audit).toContain("SELECT current_setting")
    expect(audit).toContain(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    )
    expect(audit.trim()).toMatch(/ROLLBACK;$/)
    // Privilege names are data in catalog queries, not DML statements.
    const statements = audit.replace(/'(?:''|[^'])*'/g, "''")
    expect(statements).not.toMatch(
      /\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE|GRANT|REVOKE)\b/i,
    )
    expect(audit).not.toMatch(/\b(action_statement|pg_get_triggerdef)\b/i)
    expect(audit).toContain("md5(encode(t.tgargs, 'hex'))")
    expect(audit).toContain("md5(pg_get_functiondef(p.oid))")
    for (const object of [
      "operator_users",
      "report_status_history",
      "zeladf_private",
    ]) {
      expect(audit).toContain(object)
    }
    for (const check of [
      "convalidated",
      "has_table_privilege",
      "has_column_privilege",
      "has_function_privilege",
      "rolbypassrls",
    ]) {
      expect(audit).toContain(check)
    }
  })
})
