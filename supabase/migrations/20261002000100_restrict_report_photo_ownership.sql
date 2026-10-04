-- ZDF-01: a managed photo can be linked only by its Storage owner.
-- Legacy links from other authors must not block the owner's cleanup.
-- Reconcile the remote schema before applying; stop cleanup workers during rollout.
-- Rollback: restore the previous functions in a new migration. Existing claims remain.
-- Normalize URL suffixes before locking; reject encoded paths to avoid alternate spellings.
BEGIN;
CREATE OR REPLACE FUNCTION zeladf_private.guard_photo_cleanup() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_photo_path text;
BEGIN
  IF TG_TABLE_SCHEMA='storage' THEN
    IF NEW.bucket_id <> 'report-photos' THEN RETURN NEW; END IF;
    v_photo_path := NEW.name;
  ELSE
    IF TG_OP='UPDATE' AND NEW.photo_url IS NOT DISTINCT FROM OLD.photo_url THEN RETURN NEW; END IF;
    v_photo_path := substring(NEW.photo_url FROM '/storage/v1/object/public/report-photos/(.+)$');
    IF v_photo_path IS NULL THEN
      IF position('/storage/v1/render/image/public/report-photos/' IN NEW.photo_url)>0 THEN
        RAISE EXCEPTION 'Invalid report photo' USING ERRCODE='22023';
      END IF;
      RETURN NEW;
    END IF;
    v_photo_path := split_part(split_part(v_photo_path,'?',1),'#',1);
  END IF;
  IF position('%' IN v_photo_path)>0 THEN
    RAISE EXCEPTION 'Encoded managed photo paths are not supported' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_photo_path,240925));
  IF EXISTS(SELECT 1 FROM zeladf_private.report_photo_cleanup_claims c WHERE c.photo_path=v_photo_path) THEN
    RAISE EXCEPTION 'Photo is being removed; upload a new object' USING ERRCODE='22023';
  END IF;
  IF TG_TABLE_SCHEMA='public' THEN
    IF NEW.author_id IS NULL
      OR v_photo_path !~ ('^' || NEW.author_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$')
      OR NOT EXISTS(SELECT 1 FROM storage.objects o
        WHERE o.bucket_id='report-photos' AND o.name=v_photo_path
          AND o.owner_id=NEW.author_id::text) THEN
      RAISE EXCEPTION 'Invalid report photo' USING ERRCODE='22023';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Reconcile interrupted completion after successful Storage API removal.
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
        WHERE (r.author_id=o.owner_id::uuid OR r.author_id IS NULL)
          AND position('/storage/v1/object/public/report-photos/'||o.name IN r.photo_url)>0)
    ORDER BY o.created_at,o.name LIMIT p_limit
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(candidate.name,240925));
    -- Recheck after the lock; the attachment transaction may have just committed.
    IF EXISTS(SELECT 1 FROM public.reports r
      WHERE (r.author_id=candidate.owner_id::uuid OR r.author_id IS NULL)
        AND position('/storage/v1/object/public/report-photos/'||candidate.name IN r.photo_url)>0) THEN CONTINUE; END IF;
    INSERT INTO zeladf_private.report_photo_cleanup_claims(photo_path,user_id)
      VALUES(candidate.name,candidate.owner_id::uuid) ON CONFLICT DO NOTHING;
    UPDATE zeladf_private.report_photo_cleanup_jobs j
      SET attempts=attempts+1,last_attempt_at=now() WHERE j.photo_path=candidate.name;
    photo_path:=candidate.name; RETURN NEXT;
  END LOOP;
END $$;
COMMIT;
