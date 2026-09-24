// Regression: the retired patch must abort before changing the database.
// Never connects to Supabase. Functional/security coverage: reportFlowRepair.mjs.
import { PGlite } from '../.tools/sql-validation/node_modules/@electric-sql/pglite/dist/index.js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const db = new PGlite();
try {
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY)');
  const base = read('supabase-schema.sql');
  await db.exec(base.slice(0, base.indexOf('-- 5. Dados')));
  await db.exec(read('supabase-auth-migration.sql'));
  await db.exec("INSERT INTO reports(category,title,ra,address,lat,lng,confirmations) VALUES ('buraco','Historico','Teste','Rua',-15.8,-47.9,99)");
  const policies = "SELECT * FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname";
  const before = await db.query(policies);
  await assert.rejects(() => db.exec(read('supabase/patches/fix_bug_004_005_create_rpcs.sql')),
    error => error.code === 'P0001' && error.message.includes('Patch descontinuado'));
  await db.exec('ROLLBACK');
  assert.deepEqual((await db.query(policies)).rows, before.rows);
  assert.deepEqual((await db.query('SELECT confirmations FROM reports')).rows, [{ confirmations:99 }]);
  assert.equal((await db.query("SELECT to_regnamespace('zeladf_private') AS schema")).rows[0].schema, null);
  console.log('4 verificacoes aprovadas: patch inseguro bloqueado, policies/dados/schema preservados.');
} finally { await db.close(); }
