-- Synthetic metadata only; all changes roll back. Real files use Storage API.
BEGIN;
SET LOCAL storage.allow_delete_query='true';
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(23);
INSERT INTO auth.users(id,email) VALUES
('50000000-0000-0000-0000-000000000001','cleanup-one@example.invalid'),
('50000000-0000-0000-0000-000000000002','cleanup-two@example.invalid');
INSERT INTO storage.objects(bucket_id,name,owner_id,created_at) VALUES
('report-photos','50000000-0000-0000-0000-000000000001/51000000-0000-0000-0000-000000000001.png','50000000-0000-0000-0000-000000000001',now()-interval '2 days'),
('report-photos','50000000-0000-0000-0000-000000000001/51000000-0000-0000-0000-000000000002.png','50000000-0000-0000-0000-000000000001',now()),
('report-photos','50000000-0000-0000-0000-000000000001/51000000-0000-0000-0000-000000000003.png','50000000-0000-0000-0000-000000000001',now()-interval '2 days'),
('report-photos','50000000-0000-0000-0000-000000000001/51000000-0000-0000-0000-000000000004.png','50000000-0000-0000-0000-000000000001',now()-interval '2 days');
INSERT INTO public.reports(id,category,title,ra,address,lat,lng,photo_url,author_id)
VALUES('52000000-0000-0000-0000-000000000001','buraco','Linked image','Plano Piloto','Synthetic',-15.79,-47.88,
'https://staging.invalid/storage/v1/object/public/report-photos/50000000-0000-0000-0000-000000000001/51000000-0000-0000-0000-000000000003.png','50000000-0000-0000-0000-000000000001');
-- Exercise the same INSERT/UPDATE grants used by direct PostgREST writes.
SELECT set_config('request.jwt.claims','{"iss":"https://staging.invalid/auth/v1"}',true);
SELECT set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000002',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
SELECT public.accept_community_terms('2026-09-13');
SELECT throws_ok($$INSERT INTO public.reports(category,title,ra,address,lat,lng,photo_url)
  VALUES('buraco','Foreign insert','Plano Piloto','Synthetic',-15.79,-47.88,
  'https://staging.invalid/storage/v1/object/public/report-photos/50000000-0000-0000-0000-000000000001/51000000-0000-0000-0000-000000000001.png')$$,
  '22023',null,'direct insert cannot link another account photo');
SELECT lives_ok($$INSERT INTO public.reports(category,title,ra,address,lat,lng,photo_url)
  VALUES('buraco','Attacker report','Plano Piloto','Synthetic',-15.79,-47.88,'')$$,
  'a report without a photo remains valid');
SELECT throws_ok($$UPDATE public.reports SET photo_url=
  'https://staging.invalid/storage/v1/object/public/report-photos/50000000-0000-0000-0000-000000000001/51000000-0000-0000-0000-000000000001.png'
  WHERE title='Attacker report'$$,
  '22023',null,'direct update cannot link another account photo');
SELECT throws_ok($$UPDATE public.reports SET photo_url=
  'https://staging.invalid/storage/v1/object/public/report-photos/50000000-0000-0000-0000-000000000001/51000000-0000-0000-0000-000000000001.png?download=1'
  WHERE title='Attacker report'$$,
  '22023',null,'URL suffix cannot disguise another account photo');
SELECT throws_ok($$UPDATE public.reports SET photo_url=
  'https://staging.invalid/storage/v1/render/image/public/report-photos/50000000-0000-0000-0000-000000000001/51000000-0000-0000-0000-000000000001.png?width=200'
  WHERE title='Attacker report'$$,
  '22023',null,'render URL cannot link another account photo');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT public.accept_community_terms('2026-09-13');
SELECT lives_ok($$INSERT INTO public.reports(category,title,ra,address,lat,lng,photo_url)
  VALUES('buraco','Own photo report','Plano Piloto','Synthetic',-15.79,-47.88,
  'https://staging.invalid/storage/v1/object/public/report-photos/50000000-0000-0000-0000-000000000001/51000000-0000-0000-0000-000000000003.png')$$,
  'the owner can still link an existing photo');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claim.role','',true);
-- Simulate a row created before the ownership guard, without disabling RLS globally.
ALTER TABLE public.reports DISABLE TRIGGER guard_photo_cleanup;
INSERT INTO public.reports(id,category,title,ra,address,lat,lng,photo_url,author_id)
VALUES('52000000-0000-0000-0000-000000000002','buraco','Legacy foreign photo',
  'Plano Piloto','Synthetic',-15.79,-47.88,
  'https://staging.invalid/storage/v1/object/public/report-photos/50000000-0000-0000-0000-000000000001/51000000-0000-0000-0000-000000000001.png',
  '50000000-0000-0000-0000-000000000002');
INSERT INTO public.reports(id,category,title,ra,address,lat,lng,photo_url)
VALUES('52000000-0000-0000-0000-000000000003','buraco','Legacy unknown author',
  'Plano Piloto','Synthetic',-15.79,-47.88,
  'https://staging.invalid/storage/v1/object/public/report-photos/50000000-0000-0000-0000-000000000001/51000000-0000-0000-0000-000000000004.png');
ALTER TABLE public.reports ENABLE TRIGGER guard_photo_cleanup;
SELECT set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000002',true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$UPDATE public.reports SET title='Legacy text edit'
  WHERE id='52000000-0000-0000-0000-000000000002'$$,
  'ordinary text edits of legacy reports remain possible');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claim.role','',true);
SELECT ok(NOT has_function_privilege('anon','public.claim_report_photo_cleanup(text,integer)','EXECUTE'),'anonymous cleanup forbidden');
SELECT set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000002',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT * FROM public.claim_report_photo_cleanup('50000000-0000-0000-0000-000000000001/51000000-0000-0000-0000-000000000001.png',1)$$,'42501',null,'another account cannot claim the photo');
SELECT throws_ok($$SELECT * FROM public.claim_report_photo_cleanup()$$,'42501',null,'citizen cannot run global scan');
SELECT throws_ok($$SELECT * FROM zeladf_private.report_photo_cleanup_claims$$,'42501',null,'cleanup ledger stays private');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claim.role','service_role',true);
SET LOCAL ROLE service_role;
SELECT results_eq($$SELECT count(*) FROM public.claim_report_photo_cleanup()$$,ARRAY[1::bigint],'scan claims only old unlinked managed photo');
SELECT results_eq($$SELECT count(*) FROM public.claim_report_photo_cleanup()$$,ARRAY[1::bigint],'interrupted deletion can resume');
RESET ROLE;
SELECT results_eq($$SELECT count(*) FROM zeladf_private.report_photo_cleanup_claims WHERE photo_path LIKE '%0004.png'$$,ARRAY[0::bigint],'unknown legacy author still protects its photo');
SET LOCAL ROLE service_role;
SELECT is(public.finish_report_photo_cleanup('50000000-0000-0000-0000-000000000001/51000000-0000-0000-0000-000000000001.png'),false,'cannot finish while object exists');
RESET ROLE;
SELECT throws_ok($$UPDATE public.reports SET photo_url='https://staging.invalid/storage/v1/object/public/report-photos/50000000-0000-0000-0000-000000000001/51000000-0000-0000-0000-000000000001.png' WHERE id='52000000-0000-0000-0000-000000000001'$$,'22023',null,'cannot attach claimed photo');
SELECT throws_ok($$UPDATE storage.objects SET metadata='{}' WHERE name='50000000-0000-0000-0000-000000000001/51000000-0000-0000-0000-000000000001.png'$$,'22023',null,'cannot replace a claimed object');
SELECT throws_ok($$UPDATE public.reports SET photo_url='https://staging.invalid/storage/v1/object/public/report-photos/50000000-0000-0000-0000-000000000001/51000000-0000-0000-0000-000000000001.png?download=1' WHERE id='52000000-0000-0000-0000-000000000001'$$,'22023',null,'URL suffix cannot bypass cleanup claim');
SELECT throws_ok($$UPDATE public.reports SET photo_url='https://staging.invalid/storage/v1/object/public/report-photos/%350000000-0000-0000-0000-000000000001/51000000-0000-0000-0000-000000000001.png' WHERE id='52000000-0000-0000-0000-000000000001'$$,'22023',null,'encoded managed paths rejected');
DELETE FROM storage.objects WHERE name='50000000-0000-0000-0000-000000000001/51000000-0000-0000-0000-000000000001.png';
SET LOCAL ROLE service_role;
SELECT is(public.finish_report_photo_cleanup('50000000-0000-0000-0000-000000000001/51000000-0000-0000-0000-000000000001.png'),true,'finish checks absence');
SELECT results_eq($$SELECT count(*) FROM public.claim_report_photo_cleanup()$$,ARRAY[0::bigint],'recent and linked photos remain');
RESET ROLE;
SELECT throws_ok($$INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES('report-photos','50000000-0000-0000-0000-000000000001/51000000-0000-0000-0000-000000000001.png','50000000-0000-0000-0000-000000000001')$$,'22023',null,'completed path cannot be reused');
SELECT results_eq($$SELECT count(*) FROM storage.objects WHERE bucket_id='report-photos'$$,ARRAY[3::bigint],'unrelated photos preserved');
SELECT * FROM finish();
ROLLBACK;
