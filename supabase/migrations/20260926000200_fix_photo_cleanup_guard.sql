-- Fix the cleanup guard identified by real Storage uploads in staging.
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
    IF v_photo_path IS NULL THEN RETURN NEW; END IF;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_photo_path,240925));
  IF EXISTS(SELECT 1 FROM zeladf_private.report_photo_cleanup_claims c WHERE c.photo_path=v_photo_path) THEN
    RAISE EXCEPTION 'Photo is being removed; upload a new object' USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END $$;
COMMIT;
