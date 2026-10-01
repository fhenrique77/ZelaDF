-- New contract for the FastAPI write path. Apply only after comparing the real
-- schema and testing in isolated staging; do not replay reconstructed history.
CREATE TABLE zeladf_private.report_create_requests (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_key uuid NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  report_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, request_key)
);
ALTER TABLE zeladf_private.report_create_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON zeladf_private.report_create_requests FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.create_report_idempotent(
  p_request_key uuid, p_payload_hash text, p_category text, p_title text,
  p_description text, p_ra text, p_address text, p_lat double precision,
  p_lng double precision, p_photo_path text, p_photo_url text
) RETURNS TABLE (
  id uuid, category text, title text, description text, ra text,
  address text, lat double precision, lng double precision, photo_url text,
  status text, confirmations integer, created_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  previous zeladf_private.report_create_requests%ROWTYPE;
  new_report_id uuid;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_request_key IS NULL OR p_payload_hash IS NULL OR p_payload_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid idempotency key' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text || p_request_key::text, 240924));
  SELECT * INTO previous FROM zeladf_private.report_create_requests
    WHERE user_id = actor AND request_key = p_request_key;
  IF FOUND THEN
    IF previous.payload_hash <> p_payload_hash OR NOT EXISTS (
      SELECT 1 FROM public.reports r WHERE r.id = previous.report_id
    ) THEN
      RAISE EXCEPTION 'Idempotency conflict' USING ERRCODE = '23505';
    END IF;
    RETURN QUERY SELECT r.id,r.category,r.title,r.description,r.ra,r.address,
      r.lat,r.lng,r.photo_url,r.status,r.confirmations,r.created_at
      FROM public.reports r WHERE r.id = previous.report_id;
    RETURN;
  END IF;

  -- SECURITY DEFINER would otherwise skip the community trigger's role guard.
  IF NOT public.community_terms_accepted() THEN
    RAISE EXCEPTION 'Accept community terms' USING ERRCODE = '42501';
  END IF;
  IF p_photo_path IS NULL THEN
    IF p_photo_url IS DISTINCT FROM '' THEN
      RAISE EXCEPTION 'Invalid photo' USING ERRCODE = '22023';
    END IF;
  ELSE
    -- Serialize distinct request keys that try to attach the same object.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_photo_path, 240925));
    IF p_photo_path !~ ('^' || actor::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$')
      OR p_photo_url IS NULL
      OR position('/storage/v1/object/public/report-photos/' IN p_photo_url) = 0
      OR right(p_photo_url, char_length(p_photo_path) + 1) <> '/' || p_photo_path
      OR p_photo_url IS DISTINCT FROM (
        regexp_replace(coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb->>'iss', '/auth/v1$', '')
        || '/storage/v1/object/public/report-photos/' || p_photo_path)
      OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'report-photos'
        AND o.name = p_photo_path AND o.owner_id = actor::text
        AND o.metadata->>'mimetype' = CASE right(p_photo_path, 4)
          WHEN '.jpg' THEN 'image/jpeg' WHEN '.png' THEN 'image/png'
          ELSE 'image/webp' END
        AND (o.metadata->>'size')::bigint BETWEEN 1 AND 5242880)
      OR EXISTS (SELECT 1 FROM public.reports r WHERE r.photo_url = p_photo_url)
    THEN
      RAISE EXCEPTION 'Invalid photo' USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.reports(category,title,description,ra,address,lat,lng,photo_url)
    VALUES(p_category,p_title,p_description,p_ra,p_address,p_lat,p_lng,p_photo_url)
    RETURNING public.reports.id INTO new_report_id;
  INSERT INTO zeladf_private.report_create_requests(user_id,request_key,payload_hash,report_id)
    VALUES(actor,p_request_key,p_payload_hash,new_report_id);
  RETURN QUERY SELECT r.id,r.category,r.title,r.description,r.ra,r.address,
    r.lat,r.lng,r.photo_url,r.status,r.confirmations,r.created_at
    FROM public.reports r WHERE r.id = new_report_id;
END $$;
REVOKE ALL ON FUNCTION public.create_report_idempotent(uuid,text,text,text,text,text,text,double precision,double precision,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_report_idempotent(uuid,text,text,text,text,text,text,double precision,double precision,text,text) TO authenticated;

-- Failed Storage removals can be retried later, after checking that no report
-- still references the object. No client role can read or mutate the queue.
CREATE TABLE zeladf_private.report_photo_cleanup_jobs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  photo_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  completed_at timestamptz,
  UNIQUE (user_id, photo_path)
);
ALTER TABLE zeladf_private.report_photo_cleanup_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON zeladf_private.report_photo_cleanup_jobs FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.queue_report_photo_cleanup(p_photo_path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  IF actor IS NULL OR p_photo_path IS NULL OR
    p_photo_path !~ ('^' || actor::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$') THEN
    RAISE EXCEPTION 'Invalid photo path' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id='report-photos'
    AND o.name=p_photo_path AND o.owner_id=actor::text) THEN
    RETURN;
  END IF;
  INSERT INTO zeladf_private.report_photo_cleanup_jobs(user_id,photo_path)
    VALUES(actor,p_photo_path)
    ON CONFLICT (user_id,photo_path) DO UPDATE SET completed_at=NULL;
END $$;
REVOKE ALL ON FUNCTION public.queue_report_photo_cleanup(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_report_photo_cleanup(text) TO authenticated;
