-- Reparo pontual baseado na auditoria remota de 2026-09-13.
-- Somente policies e configuracao; nao altera/remove metadados nem fotos.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$ BEGIN
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects') <> 1
    OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
      AND policyname='Permitir upload para usuários autenticados xo88xm_0'
      AND cmd='INSERT' AND roles=ARRAY['authenticated']::name[]
      AND with_check=$expr$(bucket_id = 'report-photos'::text)$expr$)
    OR NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='report-photos' AND public
      AND file_size_limit IS NULL AND allowed_mime_types IS NULL)
  THEN RAISE EXCEPTION 'Storage divergiu da auditoria; reavaliar antes do reparo'; END IF;
END $$;
DROP POLICY "Permitir upload para usuários autenticados xo88xm_0" ON storage.objects;
UPDATE storage.buckets SET file_size_limit=5242880,
  allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp'] WHERE id='report-photos';
CREATE POLICY report_photos_select_own ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='report-photos' AND owner_id=(SELECT auth.uid()::text));
CREATE POLICY report_photos_insert_own_folder ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='report-photos' AND owner_id=(SELECT auth.uid()::text)
    AND (storage.foldername(name))[1]=(SELECT auth.uid()::text));
CREATE POLICY report_photos_delete_own ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='report-photos' AND owner_id=(SELECT auth.uid()::text));
COMMIT;
SELECT 'Policies de fotos corrigidas; leitura publica do arquivo preservada; limite 5 MiB.' AS resultado;
