-- ZDF-02 follow-up: Storage checks object.get_authenticated_info before
-- serving bytes. That operation is also used for anonymous downloads, so
-- allowing owners to read it bypasses moderation while a get-only visitor
-- policy blocks visible photos. The visibility predicate must guard both.
-- Deploy with clients that use authenticated Storage downloads for managed
-- photos. Rollback by restoring these two policies, never by making the
-- bucket public (which would expose moderated photos).
BEGIN;
SET LOCAL lock_timeout='5s';

DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM storage.buckets
    WHERE id='report-photos' AND public=false) THEN
    RAISE EXCEPTION 'private report-photos bucket required';
  END IF;
  IF pg_catalog.to_regprocedure('public.report_photo_downloadable(text,text)') IS NULL THEN
    RAISE EXCEPTION 'report-photo visibility predicate required';
  END IF;
END $$;

ALTER POLICY report_photos_visibility_gate ON storage.objects
  USING (
    bucket_id<>'report-photos'
    OR (owner_id=(SELECT auth.uid()::text)
      AND storage.allow_any_operation(ARRAY[
        'object.list','object.list_v2','object.delete','object.delete_many'
      ]))
    OR public.report_photo_downloadable(name,owner_id)
  );
ALTER POLICY report_photos_download_visible ON storage.objects
  USING (
    bucket_id='report-photos'
    AND public.report_photo_downloadable(name,owner_id)
  );

COMMIT;
