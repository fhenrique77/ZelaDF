// Restore the protected, scoped backup in isolated PostgreSQL memory.
// Never prints rows, identifiers, photo URLs or database exception details.
import { PGlite } from '../.tools/sql-validation/node_modules/@electric-sql/pglite/dist/index.js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const db = new PGlite();
try {
  const raw = read('.tools/backups/report-flow-20260913/data.json');
  const backup = JSON.parse(raw.slice(raw.indexOf('{'))).rows[0].report_flow_backup;
  assert.ok(Array.isArray(backup.reports) && Array.isArray(backup.votes));
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
  const historical = read('supabase-schema.sql');
  await db.exec(historical.slice(0,historical.indexOf('-- 5. Dados')));
  await db.exec(read('supabase-auth-migration.sql'));
  for (const table of ['reports','votes']) {
    await db.query(`INSERT INTO public.${table} SELECT * FROM jsonb_populate_recordset(NULL::public.${table}, $1::jsonb)`, [JSON.stringify(backup[table])]);
    const restored = (await db.query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) AS rows FROM public.${table} t`)).rows[0].rows;
    assert.deepEqual(restored, backup[table]);
  }
  await db.exec('GRANT ALL ON reports,votes TO anon,authenticated');
  await db.exec(read('supabase/repairs/20260910_restore_report_flow.sql'));
  const totals = (await db.query(`SELECT (SELECT count(*)::int FROM reports) AS reports, (SELECT count(*)::int FROM votes) AS votes,
    (SELECT count(*)::int FROM reports r WHERE confirmations IS DISTINCT FROM (SELECT count(*)::int FROM votes v WHERE v.report_id=r.id)) AS mismatches`)).rows[0];
  assert.deepEqual(totals, {reports:backup.reports.length,votes:backup.votes.length,mismatches:0});
  console.log('Backup restaurado integralmente e reparo validado na copia isolada: ' + JSON.stringify(totals));
} catch (error) {
  console.error('Validacao do backup falhou; detalhes de dados suprimidos. Codigo: ' + (error.code ?? 'ASSERTION'));
  process.exitCode=1;
} finally { await db.close(); }
