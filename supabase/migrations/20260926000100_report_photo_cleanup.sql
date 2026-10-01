-- Rehearse on isolated Supabase before production. Requires module 4 tables.
-- Reserve an unlinked object before Storage API deletion. Persistent tombstones
-- prevent a retry/re-upload from resurrecting a path while deletion is in flight.
-- Rollback: stop workers; retain claims and guards until all pending work finishes.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE zeladf_private.report_photo_cleanup_claims (
  photo_path text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE zeladf_private.report_photo_cleanup_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON zeladf_private.report_photo_cleanup_claims FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION zeladf_private.guard_photo_cleanup() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE photo_path text;
BEGIN
  IF TG_TABLE_SCHEMA='storage' THEN
    IF NEW.bucket_id <> 'report-photos' THEN RETURN NEW; END IF;
    photo_path := NEW.name;
  ELSE
    IF TG_OP='UPDATE' AND NEW.photo_url IS NOT DISTINCT FROM OLD.photo_url THEN RETURN NEW; END IF;
    photo_path := substring(NEW.photo_url FROM '/storage/v1/object/public/report-photos/(.+)$');
    IF photo_path IS NULL THEN RETURN NEW; END IF;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(photo_path,240925));
  IF EXISTS(SELECT 1 FROM zeladf_private.report_photo_cleanup_claims c WHERE c.photo_path=photo_path) THEN
    RAISE EXCEPTION 'Photo is being removed; upload a new object' USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION zeladf_private.guard_photo_cleanup() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_photo_cleanup BEFORE INSERT OR UPDATE OF photo_url ON public.reports
FOR EACH ROW EXECUTE FUNCTION zeladf_private.guard_photo_cleanup();
CREATE TRIGGER guard_photo_cleanup BEFORE INSERT OR UPDATE ON storage.objects
FOR EACH ROW EXECUTE FUNCTION zeladf_private.guard_photo_cleanup();

CREATE FUNCTION public.claim_report_photo_cleanup(p_photo_path text DEFAULT NULL,p_limit integer DEFAULT 100)
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
REVOKE ALL ON FUNCTION public.claim_report_photo_cleanup(text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.claim_report_photo_cleanup(text,integer) TO authenticated,service_role;

CREATE FUNCTION public.finish_report_photo_cleanup(p_photo_path text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid();
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' AND (actor IS NULL OR
    NOT EXISTS(SELECT 1 FROM zeladf_private.report_photo_cleanup_claims c
      WHERE c.photo_path=p_photo_path AND c.user_id=actor)) THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE='42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_photo_path,240925));
  IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='report-photos' AND name=p_photo_path) THEN RETURN false; END IF;
  UPDATE zeladf_private.report_photo_cleanup_claims SET completed_at=coalesce(completed_at,now())
    WHERE photo_path=p_photo_path;
  UPDATE zeladf_private.report_photo_cleanup_jobs SET completed_at=coalesce(completed_at,now())
    WHERE photo_path=p_photo_path;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.finish_report_photo_cleanup(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finish_report_photo_cleanup(text) TO authenticated,service_role;
COMMIT;
