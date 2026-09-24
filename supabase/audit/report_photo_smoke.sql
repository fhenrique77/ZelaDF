-- Apenas metadados sinteticos, sem enviar/remover objetos reais. Tudo revertido.
BEGIN;
SET LOCAL statement_timeout = '30s';
CREATE TEMP TABLE photo_fixture(owner_id uuid, other_id uuid);
INSERT INTO photo_fixture VALUES(gen_random_uuid(),gen_random_uuid());
GRANT SELECT ON photo_fixture TO authenticated;
INSERT INTO auth.users(id) SELECT owner_id FROM photo_fixture UNION ALL SELECT other_id FROM photo_fixture;
DO $$ BEGIN PERFORM set_config('request.jwt.claim.sub',(SELECT owner_id::text FROM photo_fixture),true); END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE mine text := (SELECT owner_id::text FROM photo_fixture); other text := (SELECT other_id::text FROM photo_fixture); BEGIN
  INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES('report-photos',mine || '/smoke.jpg',mine);
  ASSERT (SELECT count(*)=1 FROM storage.objects WHERE bucket_id='report-photos' AND name=mine || '/smoke.jpg'), 'Own photo read failed';
  BEGIN
    INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES('report-photos',other || '/forbidden.jpg',mine);
    RAISE EXCEPTION 'Upload into another folder allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES('report-photos',mine || '/forged.jpg',other);
    RAISE EXCEPTION 'Forged photo owner allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN PERFORM set_config('request.jwt.claim.sub',(SELECT other_id::text FROM photo_fixture),true); END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT (SELECT count(*)=0 FROM storage.objects WHERE owner_id=(SELECT owner_id::text FROM photo_fixture)), 'Other photo metadata exposed';
END $$;
RESET ROLE;
DO $$ BEGIN PERFORM set_config('request.jwt.claim.sub',(SELECT owner_id::text FROM photo_fixture),true); END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  -- Supabase bloqueia DELETE SQL ate para fixtures; remocao real exige Storage API.
  -- Verifica grant e igualdade do predicado de exclusao com a leitura ja testada.
  ASSERT has_table_privilege('authenticated','storage.objects','DELETE'), 'Delete grant absent';
  ASSERT (SELECT d.qual=s.qual AND d.roles=s.roles FROM pg_policies d CROSS JOIN pg_policies s
    WHERE d.schemaname='storage' AND s.schemaname='storage'
      AND d.tablename='objects' AND s.tablename='objects'
      AND d.policyname='report_photos_delete_own' AND s.policyname='report_photos_select_own'), 'Delete policy differs from tested ownership';
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'Upload/leitura RLS e predicado de exclusao aprovados; remocao pela Storage API ainda precisa de teste. Nenhum arquivo alterado.' AS resultado;
