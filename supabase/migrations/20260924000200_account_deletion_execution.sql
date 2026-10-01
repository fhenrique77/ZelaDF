-- Module 7: administrative, resumable account deletion. Requires the audited
-- request queue and all application tables from earlier migrations. Apply only
-- after an isolated rehearsal and remote-schema comparison (supabase/README.md).
-- Rollback before a job starts: remove these RPCs/triggers/table. Once a job
-- starts, finish or investigate it; never remove the write fence to roll back.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE zeladf_private.account_deletion_jobs (
  request_id uuid PRIMARY KEY,
  target_user_id uuid UNIQUE,
  verification_hash text NOT NULL CHECK (verification_hash ~ '^[0-9a-f]{64}$'),
  stage text NOT NULL DEFAULT 'frozen' CHECK (stage IN ('frozen', 'database_done', 'completed')),
  verified_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK ((stage = 'completed' AND target_user_id IS NULL AND completed_at IS NOT NULL)
      OR (stage <> 'completed' AND target_user_id IS NOT NULL AND completed_at IS NULL))
);
ALTER TABLE zeladf_private.account_deletion_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON zeladf_private.account_deletion_jobs FROM PUBLIC, anon, authenticated;

-- Every client write takes the same per-account transaction lock as the
-- administrative start. A write already in progress finishes before freezing;
-- a later write observes the job and is rejected, including with an old JWT.
CREATE FUNCTION zeladf_private.deny_deleting_account_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  IF actor IS NULL OR current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zeladf-account-' || actor::text, 0));
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = actor)
     OR EXISTS (SELECT 1 FROM zeladf_private.account_deletion_jobs
                WHERE target_user_id = actor) THEN
    RAISE EXCEPTION 'Account deletion in progress' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
REVOKE ALL ON FUNCTION zeladf_private.deny_deleting_account_write()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER account_deletion_write_fence BEFORE INSERT OR UPDATE OR DELETE
  ON public.reports FOR EACH ROW EXECUTE FUNCTION zeladf_private.deny_deleting_account_write();
CREATE TRIGGER account_deletion_write_fence BEFORE INSERT OR UPDATE OR DELETE
  ON public.votes FOR EACH ROW EXECUTE FUNCTION zeladf_private.deny_deleting_account_write();
CREATE TRIGGER account_deletion_write_fence BEFORE INSERT OR UPDATE OR DELETE
  ON public.push_tokens FOR EACH ROW EXECUTE FUNCTION zeladf_private.deny_deleting_account_write();
CREATE TRIGGER account_deletion_write_fence BEFORE INSERT OR UPDATE OR DELETE
  ON public.report_status_history FOR EACH ROW EXECUTE FUNCTION zeladf_private.deny_deleting_account_write();
CREATE TRIGGER account_deletion_write_fence BEFORE INSERT OR UPDATE OR DELETE
  ON storage.objects FOR EACH ROW EXECUTE FUNCTION zeladf_private.deny_deleting_account_write();
CREATE TRIGGER account_deletion_write_fence BEFORE INSERT OR UPDATE OR DELETE
  ON zeladf_private.community_consents FOR EACH ROW EXECUTE FUNCTION zeladf_private.deny_deleting_account_write();
CREATE TRIGGER account_deletion_write_fence BEFORE INSERT OR UPDATE OR DELETE
  ON zeladf_private.community_blocks FOR EACH ROW EXECUTE FUNCTION zeladf_private.deny_deleting_account_write();
CREATE TRIGGER account_deletion_write_fence BEFORE INSERT OR UPDATE OR DELETE
  ON zeladf_private.community_flags FOR EACH ROW EXECUTE FUNCTION zeladf_private.deny_deleting_account_write();
CREATE TRIGGER account_deletion_write_fence BEFORE INSERT OR UPDATE OR DELETE
  ON zeladf_private.report_create_requests FOR EACH ROW EXECUTE FUNCTION zeladf_private.deny_deleting_account_write();
CREATE TRIGGER account_deletion_write_fence BEFORE INSERT OR UPDATE OR DELETE
  ON zeladf_private.report_photo_cleanup_jobs FOR EACH ROW EXECUTE FUNCTION zeladf_private.deny_deleting_account_write();

CREATE FUNCTION public.begin_account_deletion(
  p_request_id uuid, p_expected_user_id uuid, p_verification_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target uuid; current_stage text; stored_hash text;
BEGIN
  IF p_request_id IS NULL OR p_expected_user_id IS NULL OR
     p_verification_hash IS NULL OR p_verification_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid deletion operation' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zeladf-account-' || p_expected_user_id::text, 0));
  SELECT target_user_id, stage, verification_hash INTO target, current_stage, stored_hash
    FROM zeladf_private.account_deletion_jobs WHERE request_id = p_request_id FOR UPDATE;
  IF FOUND THEN
    IF stored_hash <> p_verification_hash OR
       (current_stage <> 'completed' AND target IS DISTINCT FROM p_expected_user_id) THEN
      RAISE EXCEPTION 'Deletion request mismatch' USING ERRCODE = '22023';
    END IF;
    RETURN pg_catalog.jsonb_build_object('stage', current_stage);
  END IF;
  SELECT user_id INTO target FROM public.account_deletion_requests
    WHERE id = p_request_id FOR UPDATE;
  IF target IS DISTINCT FROM p_expected_user_id THEN
    RAISE EXCEPTION 'Deletion request mismatch' USING ERRCODE = '22023';
  END IF;
  INSERT INTO zeladf_private.account_deletion_jobs
    (request_id, target_user_id, verification_hash)
    VALUES (p_request_id, target, p_verification_hash);
  UPDATE public.account_deletion_requests SET status = 'in_review'
    WHERE id = p_request_id;
  RETURN pg_catalog.jsonb_build_object('stage', 'frozen');
END $$;

-- Return at most 100 exact Storage paths per call. No account identifier or
-- private report text is returned. Stop for foreign ownership/legacy URLs so
-- a human can inspect them without deleting another person's object.
CREATE FUNCTION public.account_deletion_photo_batch(
  p_request_id uuid, p_expected_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_stage text; result jsonb;
BEGIN
  SELECT stage INTO current_stage FROM zeladf_private.account_deletion_jobs
    WHERE request_id = p_request_id AND target_user_id = p_expected_user_id;
  IF current_stage IS NULL OR current_stage <> 'frozen' THEN
    RAISE EXCEPTION 'Deletion is not in photo stage' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects
             WHERE owner_id = p_expected_user_id::text AND bucket_id <> 'report-photos')
     OR EXISTS (SELECT 1 FROM storage.objects
             WHERE bucket_id = 'report-photos'
               AND name LIKE p_expected_user_id::text || '/%'
               AND owner_id IS NOT NULL AND owner_id <> p_expected_user_id::text)
     OR EXISTS (SELECT 1 FROM public.reports
             WHERE author_id = p_expected_user_id AND coalesce(photo_url, '') <> ''
               AND photo_url NOT LIKE '%/storage/v1/object/public/report-photos/'
                                      || p_expected_user_id::text || '/%') THEN
    RAISE EXCEPTION 'Account media requires manual review' USING ERRCODE = '22023';
  END IF;
  SELECT pg_catalog.jsonb_build_object(
    'paths', coalesce(pg_catalog.jsonb_agg(name ORDER BY name), '[]'::jsonb))
    INTO result FROM (
      SELECT name FROM storage.objects WHERE bucket_id = 'report-photos'
        AND (owner_id = p_expected_user_id::text
          OR name LIKE p_expected_user_id::text || '/%')
      ORDER BY name LIMIT 100
    ) AS batch;
  RETURN result;
END $$;

-- These deletes, including cascades to votes/history/flags, commit together.
-- Storage was removed first via its API and must have no remaining metadata.
CREATE FUNCTION public.purge_account_deletion_data(
  p_request_id uuid, p_expected_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_stage text;
BEGIN
  SELECT stage INTO current_stage FROM zeladf_private.account_deletion_jobs
    WHERE request_id = p_request_id AND target_user_id = p_expected_user_id FOR UPDATE;
  IF current_stage = 'database_done' THEN
    RETURN pg_catalog.jsonb_build_object('stage', current_stage);
  END IF;
  IF current_stage IS NULL OR current_stage <> 'frozen' THEN
    RAISE EXCEPTION 'Deletion is not ready for database purge' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects WHERE owner_id = p_expected_user_id::text
             OR (bucket_id = 'report-photos' AND name LIKE p_expected_user_id::text || '/%')) THEN
    RAISE EXCEPTION 'Account media remains' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.reports
             WHERE author_id = p_expected_user_id AND coalesce(photo_url, '') <> ''
               AND photo_url NOT LIKE '%/storage/v1/object/public/report-photos/'
                                      || p_expected_user_id::text || '/%') THEN
    RAISE EXCEPTION 'Account media requires manual review' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.votes WHERE user_id = p_expected_user_id;
  DELETE FROM public.reports WHERE author_id = p_expected_user_id;
  DELETE FROM public.push_tokens WHERE user_id = p_expected_user_id;
  UPDATE zeladf_private.account_deletion_jobs
    SET stage = 'database_done', updated_at = now() WHERE request_id = p_request_id;
  RETURN pg_catalog.jsonb_build_object('stage', 'database_done');
END $$;

-- The request row disappears by FK cascade with Auth. Keep only a receipt ID,
-- stage, verification hash and timestamps after confirming every data layer.
CREATE FUNCTION public.finish_account_deletion(
  p_request_id uuid, p_expected_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_stage text;
BEGIN
  SELECT stage INTO current_stage FROM zeladf_private.account_deletion_jobs
    WHERE request_id = p_request_id FOR UPDATE;
  IF current_stage = 'completed' THEN
    RETURN pg_catalog.jsonb_build_object('stage', 'completed');
  END IF;
  IF current_stage IS DISTINCT FROM 'database_done' OR NOT EXISTS (
      SELECT 1 FROM zeladf_private.account_deletion_jobs
      WHERE request_id = p_request_id AND target_user_id = p_expected_user_id) THEN
    RAISE EXCEPTION 'Deletion is not ready to finish' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = p_expected_user_id)
     OR EXISTS (SELECT 1 FROM storage.objects WHERE owner_id = p_expected_user_id::text
             OR (bucket_id = 'report-photos' AND name LIKE p_expected_user_id::text || '/%'))
     OR EXISTS (SELECT 1 FROM public.reports WHERE author_id = p_expected_user_id)
     OR EXISTS (SELECT 1 FROM public.votes WHERE user_id = p_expected_user_id)
     OR EXISTS (SELECT 1 FROM public.push_tokens WHERE user_id = p_expected_user_id)
     OR EXISTS (SELECT 1 FROM public.account_deletion_requests WHERE user_id = p_expected_user_id)
     OR EXISTS (SELECT 1 FROM public.operator_users WHERE user_id = p_expected_user_id)
     OR EXISTS (SELECT 1 FROM zeladf_private.community_consents WHERE user_id = p_expected_user_id)
     OR EXISTS (SELECT 1 FROM zeladf_private.community_blocks
                WHERE user_id = p_expected_user_id OR blocked_user_id = p_expected_user_id)
     OR EXISTS (SELECT 1 FROM zeladf_private.community_flags WHERE reporter_id = p_expected_user_id)
     OR EXISTS (SELECT 1 FROM zeladf_private.report_create_requests WHERE user_id = p_expected_user_id)
     OR EXISTS (SELECT 1 FROM zeladf_private.report_photo_cleanup_jobs WHERE user_id = p_expected_user_id) THEN
    RAISE EXCEPTION 'Account data remains' USING ERRCODE = '22023';
  END IF;
  UPDATE zeladf_private.account_deletion_jobs
    SET target_user_id = NULL, stage = 'completed', updated_at = now(),
        completed_at = now() WHERE request_id = p_request_id;
  RETURN pg_catalog.jsonb_build_object('stage', 'completed');
END $$;

REVOKE ALL ON FUNCTION public.begin_account_deletion(uuid,uuid,text),
  public.account_deletion_photo_batch(uuid,uuid),
  public.purge_account_deletion_data(uuid,uuid),
  public.finish_account_deletion(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_account_deletion(uuid,uuid,text),
  public.account_deletion_photo_batch(uuid,uuid),
  public.purge_account_deletion_data(uuid,uuid),
  public.finish_account_deletion(uuid,uuid) TO service_role;
COMMIT;
