-- ZDF-07: synthetic users and metadata only; transaction rolls back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(22);
INSERT INTO auth.users(id,email) VALUES
('81000000-0000-0000-0000-000000000001','quota-one@example.invalid'),
('81000000-0000-0000-0000-000000000002','quota-two@example.invalid'),
('81000000-0000-0000-0000-000000000003','quota-three@example.invalid');

SELECT is((SELECT file_size_limit FROM storage.buckets WHERE id='report-photos'),
  5242880::bigint,'per-object 5 MiB limit remains set');
SELECT ok(NOT has_table_privilege('authenticated',
  'zeladf_private.report_creation_quota_events','SELECT,INSERT,UPDATE,DELETE'),
  'client cannot edit report quota events');
SELECT ok(NOT has_table_privilege('authenticated',
  'zeladf_private.report_photo_upload_quota_events','SELECT,INSERT,UPDATE,DELETE'),
  'client cannot edit photo quota events');

SELECT set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000001',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claims','{"iss":"https://staging.invalid/auth/v1"}',true);
SET LOCAL ROLE authenticated;
SELECT public.accept_community_terms('2026-09-13');
SELECT lives_ok($$INSERT INTO public.reports(category,title,ra,address,lat,lng,photo_url)
  SELECT 'buraco','Quota report '||g,'Plano Piloto','Synthetic',-15.79,-47.88,''
  FROM generate_series(1,20) AS g$$,
  'twenty reports are allowed via direct PostgREST insert');
SELECT throws_ok($$INSERT INTO public.reports(category,title,ra,address,lat,lng,photo_url)
  VALUES('buraco','Over quota','Plano Piloto','Synthetic',-15.79,-47.88,'')$$,
  'PT429',null,'twenty-first direct report is rejected');
SELECT lives_ok($$DELETE FROM public.reports WHERE title='Quota report 1'$$,
  'author can still delete own report');
SELECT throws_ok($$INSERT INTO public.reports(category,title,ra,address,lat,lng,photo_url)
  VALUES('buraco','Delete bypass','Plano Piloto','Synthetic',-15.79,-47.88,'')$$,
  'PT429',null,'deletion does not refund report quota');
RESET ROLE;
SELECT results_eq($$SELECT count(*) FROM zeladf_private.report_creation_quota_events
  WHERE user_id='81000000-0000-0000-0000-000000000001'$$,
  ARRAY[20::bigint],'quota event survives report deletion');
UPDATE zeladf_private.report_creation_quota_events
  SET created_at=pg_catalog.clock_timestamp()-interval '25 hours'
  WHERE user_id='81000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT lives_ok($$INSERT INTO public.reports(category,title,ra,address,lat,lng,photo_url)
  VALUES('buraco','Window renewed','Plano Piloto','Synthetic',-15.79,-47.88,'')$$,
  'a new report is allowed after the rolling window');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000002',true);
SET LOCAL ROLE authenticated;
SELECT public.accept_community_terms('2026-09-13');
SELECT lives_ok($$SELECT id FROM public.create_report_idempotent(
  '82000000-0000-0000-0000-000000000001',repeat('a',64),'buraco',
  'API report','Details','Plano Piloto','Synthetic',-15.79,-47.88,NULL,'')$$,
  'FastAPI RPC can create one report for another user');
SELECT lives_ok($$SELECT id FROM public.create_report_idempotent(
  '82000000-0000-0000-0000-000000000001',repeat('a',64),'buraco',
  'API report','Details','Plano Piloto','Synthetic',-15.79,-47.88,NULL,'')$$,
  'idempotent replay remains valid');
RESET ROLE;
SELECT results_eq($$SELECT count(*) FROM zeladf_private.report_creation_quota_events
  WHERE user_id='81000000-0000-0000-0000-000000000002'$$,
  ARRAY[1::bigint],'idempotent replay consumes one report allowance');

SELECT set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000002',true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$INSERT INTO storage.objects(bucket_id,name,owner_id)
  SELECT 'report-photos',
    '81000000-0000-0000-0000-000000000002/83000000-0000-0000-0000-'||
      lpad(g::text,12,'0')||'.jpg',
    '81000000-0000-0000-0000-000000000002'
  FROM generate_series(1,30) AS g$$,
  'thirty direct uploads are allowed');
SELECT throws_ok($$INSERT INTO storage.objects(bucket_id,name,owner_id)
  VALUES('report-photos',
    '81000000-0000-0000-0000-000000000002/83000000-0000-0000-0000-000000000031.jpg',
    '81000000-0000-0000-0000-000000000002')$$,
  'PT429',null,'thirty-first direct upload is rejected');
RESET ROLE;
SELECT results_eq($$SELECT count(*) FROM zeladf_private.report_photo_upload_quota_events
  WHERE user_id='81000000-0000-0000-0000-000000000002'$$,
  ARRAY[30::bigint],'uploads have durable quota events independent of object metadata');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$INSERT INTO storage.objects(bucket_id,name,owner_id)
  VALUES('report-photos',
    '81000000-0000-0000-0000-000000000002/83000000-0000-0000-0000-000000000032.jpg',
    '81000000-0000-0000-0000-000000000002')$$,
  'PT429',null,'thirty-first upload remains blocked; deletion refund requires Storage HTTP rehearsal');
RESET ROLE;
UPDATE zeladf_private.report_photo_upload_quota_events
  SET created_at=pg_catalog.clock_timestamp()-interval '25 hours'
  WHERE user_id='81000000-0000-0000-0000-000000000002';
SET LOCAL ROLE authenticated;
SELECT lives_ok($$INSERT INTO storage.objects(bucket_id,name,owner_id)
  VALUES('report-photos',
    '81000000-0000-0000-0000-000000000002/83000000-0000-0000-0000-000000000033.jpg',
    '81000000-0000-0000-0000-000000000002')$$,
  'a new photo is allowed after the rolling window');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$INSERT INTO storage.objects(bucket_id,name,owner_id)
  VALUES('report-photos',
    '81000000-0000-0000-0000-000000000001/85000000-0000-0000-0000-000000000001.jpg',
    '81000000-0000-0000-0000-000000000001')$$,
  'another account can still upload');
RESET ROLE;

-- Storage writes with a service context; owner_id and path still determine
-- the account charged. A service upload cannot bypass the per-user quota.
SELECT set_config('request.jwt.claim.role','service_role',true);
INSERT INTO storage.objects(bucket_id,name,owner_id)
  SELECT 'report-photos',
    '81000000-0000-0000-0000-000000000003/84000000-0000-0000-0000-'||
      lpad(g::text,12,'0')||'.jpg',
    '81000000-0000-0000-0000-000000000003'
  FROM generate_series(1,30) AS g;
SELECT results_eq($$SELECT count(*) FROM zeladf_private.report_photo_upload_quota_events
  WHERE user_id='81000000-0000-0000-0000-000000000003'$$,
  ARRAY[30::bigint],'service-context uploads charge the named owner');
SELECT throws_ok($$INSERT INTO storage.objects(bucket_id,name,owner_id)
  VALUES('report-photos',
    '81000000-0000-0000-0000-000000000003/84000000-0000-0000-0000-000000000031.jpg',
    '81000000-0000-0000-0000-000000000003')$$,
  'PT429',null,'service context cannot bypass thirty-upload quota');
UPDATE zeladf_private.report_photo_upload_quota_events
  SET created_at=pg_catalog.clock_timestamp()-interval '25 hours'
  WHERE user_id='81000000-0000-0000-0000-000000000003';
INSERT INTO storage.objects(bucket_id,name,owner_id)
  SELECT 'report-photos',
    '81000000-0000-0000-0000-000000000003/84000000-0000-0000-0000-'||
      lpad(g::text,12,'0')||'.jpg',
    '81000000-0000-0000-0000-000000000003'
  FROM generate_series(31,40) AS g;
SELECT set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000003',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
SELECT public.accept_community_terms('2026-09-13');
SELECT throws_ok($$INSERT INTO storage.objects(bucket_id,name,owner_id)
  VALUES('report-photos',
    '81000000-0000-0000-0000-000000000003/84000000-0000-0000-0000-000000000041.jpg',
    '81000000-0000-0000-0000-000000000003')$$,
  'PT429',null,'forty active objects block another upload');
RESET ROLE;
SELECT results_eq($$SELECT count(*) FROM zeladf_private.report_photo_upload_quota_events
  WHERE user_id='81000000-0000-0000-0000-000000000003' AND
    created_at>=pg_catalog.clock_timestamp()-interval '24 hours'$$,
  ARRAY[10::bigint],'active-object limit works independently of recent quota');SELECT * FROM finish();
ROLLBACK;
