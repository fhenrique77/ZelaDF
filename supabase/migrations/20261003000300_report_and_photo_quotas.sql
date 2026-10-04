-- ZDF-07: quota is enforced for both PostgREST and FastAPI report inserts,
-- and for direct Storage uploads. Reconcile target schema and test Storage HTTP
-- before applying; this migration is not a remote deployment.
BEGIN;
SET LOCAL lock_timeout='5s';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='report-photos') THEN
    RAISE EXCEPTION 'report-photos bucket is required';
  END IF;
END $$;

-- The per-file limit and active object count bound a user's stored photo bytes
-- to 40 * 5 MiB. Existing objects count toward the active limit.
UPDATE storage.buckets SET file_size_limit=5242880 WHERE id='report-photos';

CREATE TABLE zeladf_private.report_creation_quota_events (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, report_id)
);
CREATE INDEX report_creation_quota_events_recent
  ON zeladf_private.report_creation_quota_events(user_id,created_at);
ALTER TABLE zeladf_private.report_creation_quota_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON zeladf_private.report_creation_quota_events
  FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE zeladf_private.report_photo_upload_quota_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL
);
CREATE INDEX report_photo_upload_quota_events_recent
  ON zeladf_private.report_photo_upload_quota_events(user_id,created_at);
ALTER TABLE zeladf_private.report_photo_upload_quota_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON zeladf_private.report_photo_upload_quota_events
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE zeladf_private.report_photo_upload_quota_events_id_seq
  FROM PUBLIC,anon,authenticated,service_role;

-- Count recent existing activity immediately after rollout; deleting a report
-- or object later does not refund its 24-hour creation allowance.
INSERT INTO zeladf_private.report_creation_quota_events(user_id,report_id,created_at)
  SELECT r.author_id,r.id,r.created_at FROM public.reports r
  JOIN auth.users u ON u.id=r.author_id
  WHERE r.created_at >= pg_catalog.clock_timestamp()-interval '24 hours';
INSERT INTO zeladf_private.report_photo_upload_quota_events(user_id,created_at)
  SELECT u.id,o.created_at FROM storage.objects o
  JOIN auth.users u ON u.id::text=o.owner_id
  WHERE o.bucket_id='report-photos'
    AND o.created_at >= pg_catalog.clock_timestamp()-interval '24 hours';

CREATE FUNCTION zeladf_private.quota_report_creations() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid; v_now timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' THEN RETURN NEW; END IF;
  v_actor:=auth.uid();
  IF v_actor IS NULL OR NEW.author_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'Report author is invalid' USING ERRCODE='42501';
  END IF;
  -- This trigger sorts after assign_report_author and the photo guards.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('report-create-quota:'||v_actor::text,20261003));
  v_now:=pg_catalog.clock_timestamp();
  DELETE FROM zeladf_private.report_creation_quota_events
    WHERE user_id=v_actor AND created_at<v_now-interval '24 hours';
  IF (SELECT count(*) FROM zeladf_private.report_creation_quota_events
      WHERE user_id=v_actor AND created_at>=v_now-interval '24 hours')>=20 THEN
    RAISE SQLSTATE 'PT429' USING MESSAGE='Report creation quota exceeded';
  END IF;
  INSERT INTO zeladf_private.report_creation_quota_events(user_id,report_id,created_at)
    VALUES(v_actor,NEW.id,v_now);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION zeladf_private.quota_report_creations()
  FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER quota_report_creations BEFORE INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION zeladf_private.quota_report_creations();

CREATE FUNCTION zeladf_private.quota_report_photo_uploads() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid; v_now timestamptz;
BEGIN
  IF NEW.bucket_id<>'report-photos'
    OR auth.role() IS DISTINCT FROM 'authenticated' THEN RETURN NEW; END IF;
  v_actor:=auth.uid();
  IF v_actor IS NULL OR NEW.owner_id IS DISTINCT FROM v_actor::text
    OR pg_catalog.split_part(NEW.name,'/',1) IS DISTINCT FROM v_actor::text THEN
    RAISE EXCEPTION 'Report photo owner is invalid' USING ERRCODE='42501';
  END IF;
  -- guard_photo_cleanup locks the path first; both report and Storage triggers
  -- acquire quota locks after path locks to avoid inversion.
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
REVOKE ALL ON FUNCTION zeladf_private.quota_report_photo_uploads()
  FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER quota_report_photo_uploads BEFORE INSERT ON storage.objects
  FOR EACH ROW EXECUTE FUNCTION zeladf_private.quota_report_photo_uploads();
COMMIT;
