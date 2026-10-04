-- Synthetic metadata only; changes roll back. HTTP/CDN checks require Storage staging.
BEGIN;
SET LOCAL storage.allow_delete_query='true';
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(23);
SELECT is((SELECT public FROM storage.buckets WHERE id='report-photos'),false,
  'managed report bucket is private');
SELECT ok(EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage'
  AND tablename='objects' AND policyname='report_photos_visibility_gate'
  AND permissive='RESTRICTIVE'), 'restrictive Storage read gate exists');
INSERT INTO auth.users(id,email) VALUES
('61000000-0000-0000-0000-000000000001','photo-owner@example.invalid'),
('61000000-0000-0000-0000-000000000002','photo-other@example.invalid');
INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES
('report-photos','61000000-0000-0000-0000-000000000001/62000000-0000-0000-0000-000000000001.png','61000000-0000-0000-0000-000000000001'),
('report-photos','61000000-0000-0000-0000-000000000001/62000000-0000-0000-0000-000000000002.png','61000000-0000-0000-0000-000000000001'),
('report-photos','61000000-0000-0000-0000-000000000001/62000000-0000-0000-0000-000000000003.png','61000000-0000-0000-0000-000000000001');
INSERT INTO public.reports(id,category,title,ra,address,lat,lng,photo_url,author_id) VALUES
('63000000-0000-0000-0000-000000000001','buraco','Visible photo','Plano Piloto','Synthetic',-15.79,-47.88,
 'https://staging.invalid/storage/v1/object/public/report-photos/61000000-0000-0000-0000-000000000001/62000000-0000-0000-0000-000000000001.png','61000000-0000-0000-0000-000000000001'),
('63000000-0000-0000-0000-000000000002','buraco','Shared photo','Plano Piloto','Synthetic',-15.79,-47.88,
 'https://staging.invalid/storage/v1/object/public/report-photos/61000000-0000-0000-0000-000000000001/62000000-0000-0000-0000-000000000001.png','61000000-0000-0000-0000-000000000001'),
('63000000-0000-0000-0000-000000000003','buraco','Unrelated photo','Plano Piloto','Synthetic',-15.79,-47.88,
 'https://staging.invalid/storage/v1/object/public/report-photos/61000000-0000-0000-0000-000000000001/62000000-0000-0000-0000-000000000002.png','61000000-0000-0000-0000-000000000001');
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claim.role','anon',true);
SET LOCAL ROLE anon;
SELECT is(public.report_photo_downloadable('61000000-0000-0000-0000-000000000001/62000000-0000-0000-0000-000000000001.png','61000000-0000-0000-0000-000000000001'),true,
  'visitor may fetch the visible linked photo');
SELECT is(public.report_photo_downloadable('61000000-0000-0000-0000-000000000001/62000000-0000-0000-0000-000000000003.png','61000000-0000-0000-0000-000000000001'),false,
  'visitor cannot fetch an unlinked upload');
SELECT is(public.report_photo_downloadable('61000000-0000-0000-0000-000000000001/62000000-0000-0000-0000-000000000001.png','61000000-0000-0000-0000-000000000002'),false,
  'visitor cannot substitute another owner');
SELECT set_config('storage.operation','storage.object.get_authenticated',true);
SELECT results_eq($$SELECT count(*) FROM storage.objects WHERE bucket_id='report-photos' AND name LIKE '%0001.png'$$,
  ARRAY[1::bigint], 'Storage permits a visitor download of a visible photo');
SELECT results_eq($$SELECT count(*) FROM storage.objects WHERE bucket_id='report-photos' AND name LIKE '%0003.png'$$,
  ARRAY[0::bigint], 'Storage denies visitor download of an unlinked upload');
SELECT set_config('storage.operation','',true);
SELECT is(public.report_photo_downloadable('61000000-0000-0000-0000-000000000001/legacy.png','61000000-0000-0000-0000-000000000001'),false,
  'noncanonical legacy path cannot bypass durable moderation');
RESET ROLE;
INSERT INTO zeladf_private.community_hidden_reports(report_id,reason)
VALUES('63000000-0000-0000-0000-000000000001','Synthetic moderation decision');
SELECT ok(EXISTS(SELECT 1 FROM zeladf_private.report_photo_cleanup_claims
  WHERE photo_path='61000000-0000-0000-0000-000000000001/62000000-0000-0000-0000-000000000001.png'),
  'moderation creates durable photo tombstone');
SET LOCAL ROLE anon;
SELECT is(public.report_photo_downloadable('61000000-0000-0000-0000-000000000001/62000000-0000-0000-0000-000000000001.png','61000000-0000-0000-0000-000000000001'),false,
  'hidden photo denied despite a second visible reference');
SELECT is(public.report_photo_downloadable('61000000-0000-0000-0000-000000000001/62000000-0000-0000-0000-000000000002.png','61000000-0000-0000-0000-000000000001'),true,
  'unrelated visible photo remains available');
SELECT set_config('storage.operation','storage.object.get_authenticated',true);
SELECT results_eq($$SELECT count(*) FROM storage.objects WHERE bucket_id='report-photos' AND name LIKE '%0001.png'$$,
  ARRAY[0::bigint], 'Storage denies visitor download after moderation');
SELECT set_config('storage.operation','',true);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','61000000-0000-0000-0000-000000000001',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
SELECT is(public.report_photo_downloadable('61000000-0000-0000-0000-000000000001/62000000-0000-0000-0000-000000000001.png','61000000-0000-0000-0000-000000000001'),false,
  'owner does not make moderated photo publicly downloadable');
SELECT set_config('storage.operation','storage.object.sign',true);
SELECT results_eq($$SELECT count(*) FROM storage.objects WHERE bucket_id='report-photos' AND name LIKE '%0001.png'$$,
  ARRAY[0::bigint], 'owner cannot sign a moderated photo');
SELECT set_config('storage.operation','',true);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claim.role','',true);
-- Simulate a pre-ownership-guard report that points at another account's photo.
ALTER TABLE public.reports DISABLE TRIGGER guard_photo_cleanup;
INSERT INTO public.reports(id,category,title,ra,address,lat,lng,photo_url,author_id)
VALUES('63000000-0000-0000-0000-000000000004','buraco','Legacy foreign link',
  'Plano Piloto','Synthetic',-15.79,-47.88,
  'https://staging.invalid/storage/v1/object/public/report-photos/61000000-0000-0000-0000-000000000001/62000000-0000-0000-0000-000000000002.png',
  '61000000-0000-0000-0000-000000000002');
ALTER TABLE public.reports ENABLE TRIGGER guard_photo_cleanup;
INSERT INTO zeladf_private.community_hidden_reports(report_id,reason)
VALUES('63000000-0000-0000-0000-000000000004','Legacy foreign link hidden');
SELECT ok(NOT EXISTS(SELECT 1 FROM zeladf_private.report_photo_cleanup_claims
  WHERE photo_path='61000000-0000-0000-0000-000000000001/62000000-0000-0000-0000-000000000002.png'),
  'foreign hidden report cannot tombstone owner photo');
SET LOCAL ROLE anon;
SELECT is(public.report_photo_downloadable('61000000-0000-0000-0000-000000000001/62000000-0000-0000-0000-000000000002.png','61000000-0000-0000-0000-000000000001'),true,
  'owner visible report keeps the shared photo available');
RESET ROLE;
-- Noncanonical legacy paths are denied even after a hidden report is deleted.
INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES
('report-photos','61000000-0000-0000-0000-000000000001/legacy.png','61000000-0000-0000-0000-000000000001');
ALTER TABLE public.reports DISABLE TRIGGER guard_photo_cleanup;
INSERT INTO public.reports(id,category,title,ra,address,lat,lng,photo_url,author_id) VALUES
('63000000-0000-0000-0000-000000000005','buraco','Legacy hidden path','Plano Piloto','Synthetic',-15.79,-47.88,
 'https://staging.invalid/storage/v1/object/public/report-photos/61000000-0000-0000-0000-000000000001/legacy.png','61000000-0000-0000-0000-000000000001'),
('63000000-0000-0000-0000-000000000006','buraco','Legacy visible path','Plano Piloto','Synthetic',-15.79,-47.88,
 'https://staging.invalid/storage/v1/object/public/report-photos/61000000-0000-0000-0000-000000000001/legacy.png','61000000-0000-0000-0000-000000000001');
ALTER TABLE public.reports ENABLE TRIGGER guard_photo_cleanup;
INSERT INTO zeladf_private.community_hidden_reports(report_id,reason)
VALUES('63000000-0000-0000-0000-000000000005','Legacy path hidden');
DELETE FROM public.reports WHERE id='63000000-0000-0000-0000-000000000005';
SET LOCAL ROLE anon;
SELECT is(public.report_photo_downloadable('61000000-0000-0000-0000-000000000001/legacy.png','61000000-0000-0000-0000-000000000001'),false,
  'noncanonical shared path stays denied after hidden report deletion');
RESET ROLE;
DELETE FROM public.reports WHERE id='63000000-0000-0000-0000-000000000001';
SELECT ok(EXISTS(SELECT 1 FROM zeladf_private.report_photo_cleanup_claims
  WHERE photo_path='61000000-0000-0000-0000-000000000001/62000000-0000-0000-0000-000000000001.png'),
  'deleting moderated report preserves tombstone');
SET LOCAL ROLE anon;
SELECT is(public.report_photo_downloadable('61000000-0000-0000-0000-000000000001/62000000-0000-0000-0000-000000000001.png','61000000-0000-0000-0000-000000000001'),false,
  'deleted hidden report cannot revive shared photo');
RESET ROLE;
DELETE FROM storage.objects WHERE bucket_id='report-photos' AND name=
 '61000000-0000-0000-0000-000000000001/62000000-0000-0000-0000-000000000001.png';
SELECT throws_ok($$INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES
 ('report-photos','61000000-0000-0000-0000-000000000001/62000000-0000-0000-0000-000000000001.png','61000000-0000-0000-0000-000000000001')$$,
 '22023',null,'moderated path cannot be reuploaded');
SELECT ok(NOT has_table_privilege('anon','zeladf_private.report_photo_cleanup_claims','SELECT'),
  'visitors cannot read the tombstones');
-- Even a previously removed owner photo must not be revived at its old path.
ALTER TABLE public.reports DISABLE TRIGGER guard_photo_cleanup;
INSERT INTO public.reports(id,category,title,ra,address,lat,lng,photo_url,author_id)
VALUES('63000000-0000-0000-0000-000000000007','buraco','Removed owner photo',
 'Plano Piloto','Synthetic',-15.79,-47.88,
 'https://staging.invalid/storage/v1/object/public/report-photos/61000000-0000-0000-0000-000000000001/62000000-0000-0000-0000-000000000004.png',
 '61000000-0000-0000-0000-000000000001');
ALTER TABLE public.reports ENABLE TRIGGER guard_photo_cleanup;
INSERT INTO zeladf_private.community_hidden_reports(report_id,reason)
VALUES('63000000-0000-0000-0000-000000000007','Removed owner photo hidden');
SELECT ok(EXISTS(SELECT 1 FROM zeladf_private.report_photo_cleanup_claims
 WHERE photo_path='61000000-0000-0000-0000-000000000001/62000000-0000-0000-0000-000000000004.png'),
 'hiding owner report reserves a missing photo path');
SELECT throws_ok($$INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES
 ('report-photos','61000000-0000-0000-0000-000000000001/62000000-0000-0000-0000-000000000004.png','61000000-0000-0000-0000-000000000001')$$,
 '22023',null,'missing moderated path cannot be reuploaded');
SELECT * FROM finish();
ROLLBACK;
