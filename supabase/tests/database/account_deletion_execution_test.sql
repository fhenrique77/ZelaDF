-- Run only against a disposable Supabase database. This transaction rolls back
-- synthetic accounts; Storage API deletion and Auth Admin API need staging tests.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(19);

SELECT has_table('zeladf_private', 'account_deletion_jobs', 'private execution ledger exists');
SELECT ok(has_function_privilege('service_role',
  'public.begin_account_deletion(uuid,uuid,text)', 'EXECUTE'),
  'only the administrative role can start a deletion');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.begin_account_deletion(uuid,uuid,text)', 'EXECUTE'),
  'citizens cannot start administrative deletion');
SELECT ok(NOT has_function_privilege('anon',
  'public.finish_account_deletion(uuid,uuid)', 'EXECUTE'),
  'visitors cannot finish deletion');

INSERT INTO auth.users(id,email) VALUES
  ('40000000-0000-0000-0000-000000000001','delete-fixture@example.invalid'),
  ('40000000-0000-0000-0000-000000000002','other-fixture@example.invalid');
INSERT INTO public.reports
  (id,category,title,description,ra,address,lat,lng,author_id,author_name)
VALUES
  ('41000000-0000-0000-0000-000000000001','buraco','Target report','Fixture','Plano Piloto','Test',-15.79,-47.88,'40000000-0000-0000-0000-000000000001','Cidadão'),
  ('41000000-0000-0000-0000-000000000002','buraco','Other report','Fixture','Plano Piloto','Test',-15.79,-47.88,'40000000-0000-0000-0000-000000000002','Cidadão');
INSERT INTO public.votes(report_id,device_id,user_id) VALUES
  ('41000000-0000-0000-0000-000000000002','target-device','40000000-0000-0000-0000-000000000001');
INSERT INTO public.push_tokens(user_id,token,platform) VALUES
  ('40000000-0000-0000-0000-000000000001','synthetic-delete-token-not-real','android');

SELECT set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT public.accept_community_terms('2026-09-13');
SELECT results_eq($$SELECT count(*) FROM public.request_account_deletion()$$,
  ARRAY[1::bigint], 'target account creates its own request');
RESET ROLE;
SELECT set_config('zeladf.test.request_id',
  (SELECT id::text FROM public.account_deletion_requests
   WHERE user_id='40000000-0000-0000-0000-000000000001'),true);
SELECT set_config('request.jwt.claim.role','service_role',true);
SET LOCAL ROLE service_role;
SELECT throws_ok($$SELECT public.begin_account_deletion(
  current_setting('zeladf.test.request_id')::uuid,
  '40000000-0000-0000-0000-000000000002'::uuid,
  repeat('a',64))$$,'22023',null,'mismatched target cannot start');
SELECT is((public.begin_account_deletion(
  current_setting('zeladf.test.request_id')::uuid,
  '40000000-0000-0000-0000-000000000001'::uuid,
  repeat('a',64))->>'stage'),'frozen','verified request freezes writes');
RESET ROLE;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$INSERT INTO public.reports
  (category,title,description,ra,address,lat,lng)
  VALUES ('buraco','Blocked write','Fixture','Plano Piloto','Test',-15.79,-47.88)$$,
  '42501',null,'target cannot publish after freeze');
SELECT throws_ok($$INSERT INTO storage.objects(bucket_id,name,owner_id)
  VALUES ('report-photos','40000000-0000-0000-0000-000000000001/new.jpg',
          '40000000-0000-0000-0000-000000000001')$$,
  '42501',null,'target cannot upload with an existing JWT');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000002',true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.accept_community_terms('2026-09-13')$$,
  'another account can still write');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claim.role','service_role',true);
SET LOCAL ROLE service_role;
SELECT is((public.account_deletion_photo_batch(
  current_setting('zeladf.test.request_id')::uuid,
  '40000000-0000-0000-0000-000000000001'::uuid)->'paths')::text,'[]',
  'empty Storage inventory is explicit');
SELECT is((public.purge_account_deletion_data(
  current_setting('zeladf.test.request_id')::uuid,
  '40000000-0000-0000-0000-000000000001'::uuid)->>'stage'),
  'database_done','database purge commits one stage');
RESET ROLE;
SELECT results_eq($$SELECT count(*) FROM public.reports
  WHERE author_id='40000000-0000-0000-0000-000000000001'$$,
  ARRAY[0::bigint],'target reports removed');
SELECT results_eq($$SELECT count(*) FROM public.reports
  WHERE author_id='40000000-0000-0000-0000-000000000002'$$,
  ARRAY[1::bigint],'other reports remain');
SELECT results_eq($$SELECT count(*) FROM public.votes
  WHERE user_id='40000000-0000-0000-0000-000000000001'$$,
  ARRAY[0::bigint],'target votes removed');
SELECT results_eq($$SELECT count(*) FROM public.push_tokens
  WHERE user_id='40000000-0000-0000-0000-000000000001'$$,
  ARRAY[0::bigint],'target push tokens removed');
SET LOCAL ROLE service_role;
SELECT throws_ok($$SELECT public.finish_account_deletion(
  current_setting('zeladf.test.request_id')::uuid,
  '40000000-0000-0000-0000-000000000001'::uuid)$$,
  '22023',null,'cannot finish while Auth user exists');
RESET ROLE;
DELETE FROM auth.users WHERE id='40000000-0000-0000-0000-000000000001';
SET LOCAL ROLE service_role;
SELECT is((public.finish_account_deletion(
  current_setting('zeladf.test.request_id')::uuid,
  '40000000-0000-0000-0000-000000000001'::uuid)->>'stage'),
  'completed','finishes only after Auth and related data disappear');
SELECT is((public.begin_account_deletion(
  current_setting('zeladf.test.request_id')::uuid,
  '40000000-0000-0000-0000-000000000001'::uuid,
  repeat('a',64))->>'stage'),'completed','second execution is idempotent');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
