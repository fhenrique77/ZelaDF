-- Reconcile interrupted completion after successful Storage API removal.
BEGIN;
CREATE OR REPLACE FUNCTION public.claim_report_photo_cleanup(p_photo_path text DEFAULT NULL,p_limit integer DEFAULT 100)
RETURNS TABLE(photo_path text) LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); administrative boolean:=coalesce(auth.role()='service_role',false);
  candidate record;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Invalid batch size' USING ERRCODE='22023';
  END IF;
  IF NOT administrative AND (actor IS NULL OR p_photo_path IS NULL OR
    split_part(p_photo_path,'/',1)<>actor::text) THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE='42501';
  END IF;
  -- Resume a crash after Storage deletion but before the completion RPC.
  UPDATE zeladf_private.report_photo_cleanup_claims c SET completed_at=now()
    WHERE c.completed_at IS NULL AND (administrative OR c.user_id=actor)
      AND NOT EXISTS(SELECT 1 FROM storage.objects o
        WHERE o.bucket_id='report-photos' AND o.name=c.photo_path);
  UPDATE zeladf_private.report_photo_cleanup_jobs j SET completed_at=now()
    WHERE j.completed_at IS NULL AND (administrative OR j.user_id=actor)
      AND NOT EXISTS(SELECT 1 FROM storage.objects o
        WHERE o.bucket_id='report-photos' AND o.name=j.photo_path);
  FOR candidate IN
    SELECT o.name,o.owner_id FROM storage.objects o
    WHERE o.bucket_id='report-photos'
      AND o.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
      AND split_part(o.name,'/',1)=o.owner_id
      AND EXISTS(SELECT 1 FROM auth.users u WHERE u.id::text=o.owner_id)
      AND (p_photo_path IS NULL OR o.name=p_photo_path)
      AND (administrative OR o.owner_id=actor::text)
      AND (NOT administrative OR o.created_at < now()-interval '24 hours'
        OR EXISTS(SELECT 1 FROM zeladf_private.report_photo_cleanup_claims c WHERE c.photo_path=o.name))
      AND NOT EXISTS(SELECT 1 FROM public.reports r
        WHERE position('/storage/v1/object/public/report-photos/'||o.name IN r.photo_url)>0)
    ORDER BY o.created_at,o.name LIMIT p_limit
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(candidate.name,240925));
    -- Recheck after the lock; the attachment transaction may have just committed.
    IF EXISTS(SELECT 1 FROM public.reports r
      WHERE position('/storage/v1/object/public/report-photos/'||candidate.name IN r.photo_url)>0) THEN CONTINUE; END IF;
    INSERT INTO zeladf_private.report_photo_cleanup_claims(photo_path,user_id)
      VALUES(candidate.name,candidate.owner_id::uuid) ON CONFLICT DO NOTHING;
    UPDATE zeladf_private.report_photo_cleanup_jobs j
      SET attempts=attempts+1,last_attempt_at=now() WHERE j.photo_path=candidate.name;
    photo_path:=candidate.name; RETURN NEXT;
  END LOOP;
END $$;
COMMIT;
