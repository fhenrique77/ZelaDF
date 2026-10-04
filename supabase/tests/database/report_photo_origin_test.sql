-- ZDF-05: direct PostgREST writes cannot store tracking image URLs.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(12);

INSERT INTO auth.users(id,email) VALUES
('71000000-0000-0000-0000-000000000001','photo-owner@example.invalid');
INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES
('report-photos',
 '71000000-0000-0000-0000-000000000001/72000000-0000-0000-0000-000000000001.png',
 '71000000-0000-0000-0000-000000000001');

SELECT set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000001',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claims',
  '{"iss":"https://staging.invalid/auth/v1"}',true);
SET LOCAL ROLE authenticated;
SELECT public.accept_community_terms('2026-09-13');

SELECT lives_ok($$INSERT INTO public.reports(category,title,ra,address,lat,lng,photo_url)
  VALUES('buraco','No photo','Plano Piloto','Synthetic',-15.79,-47.88,'')$$,
  'photo remains optional');
SELECT throws_ok($$INSERT INTO public.reports(category,title,ra,address,lat,lng,photo_url)
  VALUES('buraco','Tracking pixel','Plano Piloto','Synthetic',-15.79,-47.88,
    'https://attacker.supabase.co/pixel?viewer=unique')$$,
  '22023',null,'direct insert rejects external tracking URL');
SELECT throws_ok($$INSERT INTO public.reports(category,title,ra,address,lat,lng,photo_url)
  VALUES('buraco','Wrong project','Plano Piloto','Synthetic',-15.79,-47.88,
    'https://attacker.supabase.co/storage/v1/object/public/report-photos/71000000-0000-0000-0000-000000000001/72000000-0000-0000-0000-000000000001.png')$$,
  '22023',null,'owned path at another host is not canonical');
SELECT throws_ok($$INSERT INTO public.reports(category,title,ra,address,lat,lng,photo_url)
  VALUES('buraco','Query suffix','Plano Piloto','Synthetic',-15.79,-47.88,
    'https://staging.invalid/storage/v1/object/public/report-photos/71000000-0000-0000-0000-000000000001/72000000-0000-0000-0000-000000000001.png?tag=visitor')$$,
  '22023',null,'tracking query suffix is rejected');
SELECT throws_ok($$INSERT INTO public.reports(category,title,ra,address,lat,lng,photo_url)
  VALUES('buraco','Render alias','Plano Piloto','Synthetic',-15.79,-47.88,
    'https://staging.invalid/storage/v1/render/image/public/report-photos/71000000-0000-0000-0000-000000000001/72000000-0000-0000-0000-000000000001.png')$$,
  '22023',null,'render alias is rejected');
SELECT throws_ok($$INSERT INTO public.reports(category,title,ra,address,lat,lng,photo_url)
  VALUES('buraco','Encoded path','Plano Piloto','Synthetic',-15.79,-47.88,
    'https://staging.invalid/storage/v1/object/public/report-photos/%371000000-0000-0000-0000-000000000001/72000000-0000-0000-0000-000000000001.png')$$,
  '22023',null,'encoded managed path is rejected');
SELECT lives_ok($$INSERT INTO public.reports(category,title,ra,address,lat,lng,photo_url)
  VALUES('buraco','Owned photo','Plano Piloto','Synthetic',-15.79,-47.88,
    'https://staging.invalid/storage/v1/object/public/report-photos/71000000-0000-0000-0000-000000000001/72000000-0000-0000-0000-000000000001.png')$$,
  'own canonical Storage photo remains attachable');
SELECT results_eq($$SELECT photo_url FROM public.reports WHERE title='Owned photo'$$,
  ARRAY['https://staging.invalid/storage/v1/object/public/report-photos/71000000-0000-0000-0000-000000000001/72000000-0000-0000-0000-000000000001.png'],
  'canonical URL is stored unchanged');
SELECT throws_ok($$UPDATE public.reports SET photo_url='https://attacker.invalid/pixel'
  WHERE title='Owned photo'$$,'22023',null,'direct update rejects external URL');
SELECT lives_ok($$UPDATE public.reports SET photo_url='' WHERE title='Owned photo'$$,
  'photo can be removed');
RESET ROLE;
SELECT set_config('request.jwt.claim.role','service_role',true);

-- A legacy external value may remain until reviewed, but cannot be newly set.
INSERT INTO public.reports(id,category,title,ra,address,lat,lng,photo_url,author_id)
VALUES('73000000-0000-0000-0000-000000000001','buraco','Legacy external',
  'Plano Piloto','Synthetic',-15.79,-47.88,'https://old.invalid/photo',
  '71000000-0000-0000-0000-000000000001');
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$UPDATE public.reports SET title='Legacy text edit'
  WHERE id='73000000-0000-0000-0000-000000000001'$$,
  'text edits of a legacy report remain possible');
SELECT throws_ok($$UPDATE public.reports SET photo_url='https://attacker.invalid/again'
  WHERE id='73000000-0000-0000-0000-000000000001'$$,
  '22023',null,'legacy row cannot acquire another external URL');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
