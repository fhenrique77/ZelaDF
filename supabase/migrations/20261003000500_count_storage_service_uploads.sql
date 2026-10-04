-- ZDF-07 follow-up: Storage performs object inserts with a service context,
-- so the SQL request role is not the uploaded account's role. Charge the
-- owner recorded by Storage and constrained by the existing path/owner policy.
-- This also counts administrative uploads attributed to a user. Rollback
-- requires a new migration, as the old role check silently skipped HTTP uploads.
BEGIN;
SET LOCAL lock_timeout='5s';

CREATE OR REPLACE FUNCTION zeladf_private.quota_report_photo_uploads()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid; v_now timestamptz;
BEGIN
  IF NEW.bucket_id<>'report-photos' THEN RETURN NEW; END IF;
  IF NEW.owner_id IS NULL OR NEW.owner_id !~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR pg_catalog.split_part(NEW.name,'/',1) IS DISTINCT FROM NEW.owner_id THEN
    RAISE EXCEPTION 'Report photo owner is invalid' USING ERRCODE='42501';
  END IF;
  v_actor:=NEW.owner_id::uuid;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v_actor) THEN
    RAISE EXCEPTION 'Report photo owner is invalid' USING ERRCODE='42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('report-photo-quota:'||v_actor::text,20261003));
  v_now:=pg_catalog.clock_timestamp();
  DELETE FROM zeladf_private.report_photo_upload_quota_events
    WHERE user_id=v_actor AND created_at<v_now-interval '24 hours';
  IF (SELECT count(*) FROM zeladf_private.report_photo_upload_quota_events
      WHERE user_id=v_actor AND created_at>=v_now-interval '24 hours')>=30
    OR (SELECT count(*) FROM storage.objects o
      WHERE o.bucket_id='report-photos' AND o.owner_id=v_actor::text)>=40 THEN
    RAISE SQLSTATE 'PT429' USING MESSAGE='Report photo upload quota exceeded';
  END IF;
  INSERT INTO zeladf_private.report_photo_upload_quota_events(user_id,created_at)
    VALUES(v_actor,v_now);
  RETURN NEW;
END $$;
COMMIT;
