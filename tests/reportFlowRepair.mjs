// Run: node tests/reportFlowRepair.mjs
// Isolated dependency: npm install --prefix .tools/sql-validation @electric-sql/pglite@0.3.14
// PostgreSQL engine in memory; Auth is a minimal fixture, not real Supabase Auth.
import { PGlite } from '../.tools/sql-validation/node_modules/@electric-sql/pglite/dist/index.js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const repair = read('supabase/repairs/20260910_restore_report_flow.sql');
const historical = read('supabase-schema.sql');
const base = historical.slice(0, historical.indexOf('-- 5. Dados'));
const owner = '10000000-0000-0000-0000-000000000001';
const other = '10000000-0000-0000-0000-000000000002';
const legacy = '20000000-0000-0000-0000-000000000001';
let checks = 0;
function check(actual, expected) { assert.deepEqual(actual, expected); checks++; }
async function denied(db, sql, code = '42501') {
  await assert.rejects(() => db.exec(sql), error => error.code === code);
  checks++;
}
async function fixture() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
    INSERT INTO auth.users VALUES ('${owner}'),('${other}');
  `);
  await db.exec(base);
  await db.exec(read('supabase-auth-migration.sql'));
  await db.exec(`
    GRANT ALL ON public.reports, public.votes TO anon, authenticated;
    INSERT INTO reports(id,category,title,ra,address,lat,lng,confirmations)
      VALUES ('${legacy}','buraco','Aviso historico','Teste','Rua',-15.8,-47.9,99);
    INSERT INTO votes(report_id,device_id) VALUES ('${legacy}','legacy-device');
  `);
  return db;
}
async function actor(db, id = null) {
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub','${id ?? ''}',false); SET ROLE ${id ? 'authenticated' : 'anon'};`);
}
async function scalar(db, sql) { return Object.values((await db.query(sql)).rows[0])[0]; }

async function run() {
  const db = await fixture();
  try {
    await db.exec(repair);
    check(await scalar(db, `SELECT confirmations FROM reports WHERE id='${legacy}'`), 1);
    check(await scalar(db, `SELECT author_id FROM reports WHERE id='${legacy}'`), null);
    check(await scalar(db, 'SELECT count(*)::int FROM votes'), 1);
    await actor(db);
    check(await scalar(db, 'SELECT count(id)::int FROM reports'), 1);
    await denied(db, 'SELECT author_id FROM reports');
    await denied(db, 'SELECT author_name FROM reports');
    await denied(db, `INSERT INTO reports(category,title,ra,address,lat,lng) VALUES ('buraco','Proibido','Teste','Rua',-15.8,-47.9)`);
    await denied(db, `SELECT * FROM set_report_vote('${legacy}',true,'device')`);
    await actor(db, owner);
    const created = (await db.query(`INSERT INTO reports(category,title,ra,address,lat,lng) VALUES ('buraco','Novo aviso','Teste','Rua',-15.8,-47.9) RETURNING id,status,confirmations`)).rows[0];
    check(created.status, 'aberto');
    check(created.confirmations, 0);
    await db.exec('RESET ROLE');
    check(await scalar(db, `SELECT author_id FROM reports WHERE id='${created.id}'`), owner);
    await actor(db, owner);
    check((await db.query(`SELECT * FROM set_report_vote('${created.id}',true,'shared-device')`)).rows, [{voted:true,confirmations:1}]);
    check((await db.query(`SELECT * FROM set_report_vote('${created.id}',true,'shared-device')`)).rows, [{voted:true,confirmations:1}]);
    check((await db.query(`SELECT * FROM get_my_report_ids(ARRAY['${created.id}','${legacy}']::uuid[])`)).rows, [{report_id:created.id}]);
    check((await db.query(`SELECT id FROM get_my_reports(-16,-48,-15,-47,NULL,NULL,200)`)).rows, [{id:created.id}]);
    await denied(db, 'SELECT author_id FROM reports');
    await denied(db, 'SELECT user_id FROM votes');
    await denied(db, `UPDATE reports SET confirmations=100 WHERE id='${created.id}'`);
    await denied(db, `UPDATE reports SET status='resolvido' WHERE id='${created.id}'`);
    await denied(db, `INSERT INTO votes(report_id,device_id) VALUES ('${created.id}','bad')`);
    await denied(db, `INSERT INTO reports(category,title,ra,address,lat,lng,author_id) VALUES ('buraco','Proibido','Teste','Rua',-15.8,-47.9,'${other}')`);
    await actor(db, other);
    check((await db.query(`SELECT * FROM get_my_report_ids(ARRAY['${created.id}']::uuid[])`)).rows, []);
    check((await db.query(`UPDATE reports SET title='Intruso' WHERE id='${created.id}' RETURNING id`)).rows, []);
    check((await db.query(`DELETE FROM reports WHERE id='${created.id}' RETURNING id`)).rows, []);
    check((await db.query(`SELECT * FROM set_report_vote('${created.id}',true,'shared-device')`)).rows, [{voted:true,confirmations:2}]);
    check((await db.query('SELECT report_id FROM votes')).rows, [{report_id:created.id}]);
    check((await db.query(`SELECT * FROM set_report_vote('${created.id}',false,'shared-device')`)).rows, [{voted:false,confirmations:1}]);
    check((await db.query(`SELECT * FROM set_report_vote('${created.id}',false,'shared-device')`)).rows, [{voted:false,confirmations:1}]);
    await actor(db, owner);
    check((await db.query(`DELETE FROM reports WHERE id='${created.id}' RETURNING id`)).rows, [{id:created.id}]);
    await db.exec('RESET ROLE');
    check(await scalar(db, `SELECT count(*)::int FROM votes WHERE report_id='${created.id}'`), 0);
    await denied(db, repair, 'P0001');
    await db.exec('ROLLBACK');
    check(await scalar(db, `SELECT confirmations FROM reports WHERE id='${legacy}'`), 1);
  } finally { await db.close(); }

  const drift = await fixture();
  try {
    await drift.exec('ALTER TABLE reports ADD COLUMN unaudited text');
    await denied(drift, repair, 'P0001');
    await drift.exec('ROLLBACK');
    check(await scalar(drift, "SELECT to_regnamespace('zeladf_private') IS NULL"), true);
    check(await scalar(drift, `SELECT confirmations FROM reports WHERE id='${legacy}'`), 99);
  } finally { await drift.close(); }
  const inherited = await fixture();
  try {
    await inherited.exec('CREATE ROLE unexpected_reader; GRANT SELECT ON reports TO unexpected_reader; GRANT unexpected_reader TO authenticated;');
    await denied(inherited, repair, 'P0001');
    await inherited.exec('ROLLBACK');
    check(await scalar(inherited, "SELECT to_regnamespace('zeladf_private') IS NULL"), true);
    check(await scalar(inherited, `SELECT confirmations FROM reports WHERE id='${legacy}'`), 99);
    check(await scalar(inherited, "SELECT to_regprocedure('public.set_report_vote(uuid,boolean,text)') IS NULL"), true);
  } finally { await inherited.close(); }
  console.log(`${checks} verificacoes SQL aprovadas: instalacao, autoria, RPCs, votos, RLS, preservacao e rejeicao de divergencia/reaplicacao.`);
}
run().catch(error => { console.error('Falha de validacao SQL:', error.code ?? '', error.message); process.exitCode=1; });
