// Isolated PostgreSQL tests; never calls external Auth/Storage or real accounts.
import {PGlite} from '../.tools/sql-validation/node_modules/@electric-sql/pglite/dist/index.js';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const db=new PGlite();
const owner='70000000-0000-0000-0000-000000000001',other='70000000-0000-0000-0000-000000000002';
let checks=0,failed=false;
async function check(sql,expected){assert.deepEqual(Object.values((await db.query(sql)).rows[0])[0],expected);checks++}
async function denied(sql,code='42501'){await assert.rejects(()=>db.exec(sql),err=>err.code===code);checks++}
async function actor(id){await db.exec(`RESET ROLE;SELECT set_config('request.jwt.claim.sub','${id??''}',false);SET ROLE ${id?'authenticated':'anon'};`)}
async function create(title){return (await db.query(`INSERT INTO public.reports(category,title,ra,address,lat,lng) VALUES('buraco',$1,'Plano Piloto','Endereco de teste',-15.8,-47.9) RETURNING id`,[title])).rows[0].id}
try {
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    GRANT USAGE ON SCHEMA auth TO anon,authenticated;
    INSERT INTO auth.users VALUES('${owner}'),('${other}');
    CREATE SCHEMA storage;GRANT USAGE ON SCHEMA storage TO anon,authenticated;
    CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text,owner_id text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT SELECT,INSERT,DELETE ON storage.objects TO authenticated;
    CREATE POLICY insert_own ON storage.objects FOR INSERT TO authenticated WITH CHECK(owner_id=auth.uid()::text);
  `);
  const base=read('supabase-schema.sql');
  await db.exec(base.slice(0,base.indexOf('-- 5. Dados')));
  await db.exec(read('supabase-auth-migration.sql'));
  await db.exec('GRANT ALL ON reports,votes TO anon,authenticated');
  await db.exec(read('supabase/repairs/20260910_restore_report_flow.sql'));
  await db.exec(read('supabase/migrations/20260913000100_community_safety.sql'));
  await actor(owner);
  await denied("INSERT INTO reports(category,title,ra,address,lat,lng) VALUES('buraco','Sem termos','Plano Piloto','Endereco',-15.8,-47.9)");
  await denied(`INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES('report-photos','test.jpg','${owner}')`);
  await denied("SELECT accept_community_terms('old-version')",'22023');
  await db.exec("SELECT accept_community_terms('2026-09-13');SELECT accept_community_terms('2026-09-13')");
  await check('SELECT community_terms_accepted()',true);
  await db.exec(`INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES('report-photos','test.jpg','${owner}')`);
  const own=await create('Aviso da primeira conta');
  await db.exec(`RESET ROLE;DELETE FROM zeladf_private.community_consents WHERE user_id='${owner}'`);
  await actor(owner);
  await denied(`UPDATE reports SET title='Edicao sem aceite' WHERE id='${own}'`);
  await db.exec("SELECT accept_community_terms('2026-09-13')");
  await db.exec(`UPDATE reports SET title='Edicao com aceite' WHERE id='${own}'`);
  await check(`SELECT title FROM reports WHERE id='${own}'`,'Edicao com aceite');
  await actor(other);
  await check('SELECT community_terms_accepted()',false);
  await db.exec("SELECT accept_community_terms('2026-09-13')");
  const report=await create('Aviso da segunda conta');
  const second=await create('Segundo aviso da segunda conta');
  await actor(owner);
  const flag=(await db.query(`SELECT flag_report('${report}','report','privacy','Detalhes sinteticos') AS id`)).rows[0].id;
  await check(`SELECT flag_report('${report}','report','privacy','Repeticao')`,flag);
  await denied('SELECT * FROM zeladf_private.community_flags');
  await denied('SELECT * FROM zeladf_private.community_blocks');
  await denied(`SELECT zeladf_private.review_community_flag('${flag}','hidden','Motivo de teste completo')`);
  await denied(`SELECT flag_report('${report}','bad-target','privacy','')`,'22023');
  await denied(`SELECT block_report_author('${own}')`,'22023');
  await db.exec(`SELECT block_report_author('${report}')`);
  await check(`SELECT count(*)::int FROM reports WHERE id IN ('${report}','${second}')`,0);
  await denied(`SELECT set_report_vote('${report}',true,'device')`,'P0002');
  await denied(`SELECT zeladf_private.set_report_vote('${report}',true,'device')`);
  await db.exec('SELECT clear_my_community_blocks()');
  await check(`SELECT count(*)::int FROM reports WHERE id IN ('${report}','${second}')`,2);
  await db.exec(`SELECT set_report_vote('${report}',true,'device')`);
  await db.exec(`RESET ROLE;SELECT zeladf_private.review_community_flag('${flag}','hidden','Decisao administrativa sintetica')`);
  await actor(owner);
  await check(`SELECT count(*)::int FROM reports WHERE id='${report}'`,0);
  await actor(null);
  await check(`SELECT count(*)::int FROM reports WHERE id='${report}'`,0);
  await denied("SELECT accept_community_terms('2026-09-13')");
  await denied(`SELECT flag_report('${second}','report','spam','')`);
  await actor(other);
  await check(`SELECT count(*)::int FROM reports WHERE id='${report}'`,1);
  await db.exec(`DELETE FROM reports WHERE id='${report}'`);
  await check(`SELECT count(*)::int FROM reports WHERE id='${report}'`,0);
  await db.exec('RESET ROLE');
  await check('SELECT count(*)::int FROM zeladf_private.community_hidden_reports',0);
  await check('SELECT count(*)::int FROM zeladf_private.community_flags',0);
  console.log(checks+' verificacoes SQL aprovadas: termos, upload, denuncias, bloqueios, moderacao e privacidade.');
} catch(error){failed=true;console.error('Falha SQL de comunidade:',error.code??'',error.message)}
finally{await db.close()}
if(failed)process.exitCode=1;
