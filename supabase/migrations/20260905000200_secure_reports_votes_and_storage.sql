-- Enforces the ZelaDF authorization model at the database boundary.
-- Audit the remote baseline and existing Storage policies before applying.

ALTER TABLE public.reports
  ADD CONSTRAINT reports_author_id_fkey
  FOREIGN KEY (author_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE
  NOT VALID;

ALTER TABLE public.votes
  ADD CONSTRAINT votes_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE
  NOT VALID;

COMMENT ON CONSTRAINT reports_author_id_fkey ON public.reports IS
  'Enforced for new writes. Validate only after auditing historical author identifiers.';

COMMENT ON CONSTRAINT votes_user_id_fkey ON public.votes IS
  'Enforced for new writes. Validate only after auditing historical vote identifiers.';

CREATE OR REPLACE FUNCTION zeladf_private.assign_report_author()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := (SELECT auth.uid());
BEGIN
  IF actor_id IS NULL THEN
    IF current_user IN ('anon', 'authenticated') THEN
      RAISE EXCEPTION 'Authentication is required to create a report'
        USING ERRCODE = '42501';
    END IF;

    -- Allows trusted maintenance and the local demonstration seed to keep
    -- author_id null. Client roles are rejected above.
    NEW.author_name := 'Cidadão';
    RETURN NEW;
  END IF;

  NEW.author_id := actor_id;
  NEW.author_name := 'Cidadão';
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION zeladf_private.assign_report_author()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER assign_report_author
  BEFORE INSERT ON public.reports
  FOR EACH ROW
  EXECUTE FUNCTION zeladf_private.assign_report_author();

-- A policy is permissive by default and policies are combined with OR. Remove
-- every earlier policy from these application-owned tables before rebuilding
-- the exact contract below.
DO $$
DECLARE
  existing_policy RECORD;
BEGIN
  FOR existing_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'reports'
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON public.reports',
      existing_policy.policyname
    );
  END LOOP;

  FOR existing_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'votes'
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON public.votes',
      existing_policy.policyname
    );
  END LOOP;
END
$$;

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.reports FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.votes FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id,
  category,
  title,
  description,
  ra,
  address,
  lat,
  lng,
  photo_url,
  status,
  confirmations,
  created_at
) ON public.reports TO anon, authenticated;

GRANT INSERT (
  category,
  title,
  description,
  ra,
  address,
  lat,
  lng,
  photo_url
) ON public.reports TO authenticated;

GRANT UPDATE (
  category,
  title,
  description,
  photo_url
) ON public.reports TO authenticated;

GRANT DELETE ON TABLE public.reports TO authenticated;
GRANT SELECT (report_id) ON public.votes TO authenticated;

CREATE POLICY reports_read_public
  ON public.reports
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY reports_insert_authenticated
  ON public.reports
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND author_id = (SELECT auth.uid())
  );

CREATE POLICY reports_update_own
  ON public.reports
  FOR UPDATE
  TO authenticated
  USING (author_id = (SELECT auth.uid()))
  WITH CHECK (author_id = (SELECT auth.uid()));

CREATE POLICY reports_delete_own
  ON public.reports
  FOR DELETE
  TO authenticated
  USING (author_id = (SELECT auth.uid()));

CREATE POLICY votes_select_own
  ON public.votes
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.get_my_report_ids(p_report_ids UUID[])
RETURNS TABLE (report_id UUID)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := (SELECT auth.uid());
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required'
      USING ERRCODE = '42501';
  END IF;

  IF p_report_ids IS NULL OR cardinality(p_report_ids) > 501 THEN
    RAISE EXCEPTION 'Invalid report identifier list'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT report.id
  FROM public.reports AS report
  WHERE report.author_id = actor_id
    AND report.id = ANY(p_report_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_report_ids(UUID[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_report_ids(UUID[])
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_reports(
  p_south DOUBLE PRECISION,
  p_west DOUBLE PRECISION,
  p_north DOUBLE PRECISION,
  p_east DOUBLE PRECISION,
  p_categories TEXT[],
  p_status TEXT,
  p_limit INTEGER
)
RETURNS TABLE (
  id UUID,
  category TEXT,
  title TEXT,
  description TEXT,
  ra TEXT,
  address TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  photo_url TEXT,
  status TEXT,
  confirmations INTEGER,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := (SELECT auth.uid());
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required'
      USING ERRCODE = '42501';
  END IF;

  IF p_south IS NULL
    OR p_west IS NULL
    OR p_north IS NULL
    OR p_east IS NULL
    OR p_south NOT BETWEEN -90 AND 90
    OR p_north NOT BETWEEN -90 AND 90
    OR p_west NOT BETWEEN -180 AND 180
    OR p_east NOT BETWEEN -180 AND 180
    OR p_south > p_north
    OR p_west > p_east THEN
    RAISE EXCEPTION 'Invalid report bounds'
      USING ERRCODE = '22023';
  END IF;

  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 501 THEN
    RAISE EXCEPTION 'Invalid report limit'
      USING ERRCODE = '22023';
  END IF;

  IF p_status IS NOT NULL
    AND p_status NOT IN ('aberto', 'andamento', 'resolvido') THEN
    RAISE EXCEPTION 'Invalid report status'
      USING ERRCODE = '22023';
  END IF;

  IF p_categories IS NOT NULL AND EXISTS (
    SELECT 1
    FROM unnest(p_categories) AS requested_category
    WHERE requested_category NOT IN (
      'agua',
      'buraco',
      'poste',
      'lixo',
      'semaforo',
      'outro'
    )
  ) THEN
    RAISE EXCEPTION 'Invalid report category'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    report.id,
    report.category,
    report.title,
    report.description,
    report.ra,
    report.address,
    report.lat,
    report.lng,
    report.photo_url,
    report.status,
    report.confirmations,
    report.created_at
  FROM public.reports AS report
  WHERE report.author_id = actor_id
    AND report.lat BETWEEN p_south AND p_north
    AND report.lng BETWEEN p_west AND p_east
    AND (
      p_categories IS NULL
      OR cardinality(p_categories) = 0
      OR report.category = ANY(p_categories)
    )
    AND (p_status IS NULL OR report.status = p_status)
  ORDER BY report.created_at DESC
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_reports(
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  TEXT[],
  TEXT,
  INTEGER
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_my_reports(
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  TEXT[],
  TEXT,
  INTEGER
) TO authenticated;

COMMENT ON FUNCTION public.get_my_report_ids(UUID[]) IS
  'Returns only report IDs owned by the authenticated account.';

COMMENT ON FUNCTION public.get_my_reports(
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  TEXT[],
  TEXT,
  INTEGER
) IS
  'Returns public report fields for the authenticated owner within validated filters.';

DROP POLICY IF EXISTS "Qualquer um pode fazer upload" ON storage.objects;
DROP POLICY IF EXISTS "report_photos_insert_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "report_photos_insert_own_folder" ON storage.objects;
DROP POLICY IF EXISTS "report_photos_select_own" ON storage.objects;
DROP POLICY IF EXISTS "report_photos_delete_own" ON storage.objects;

CREATE POLICY "report_photos_select_own"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'report-photos'
  AND owner_id = (SELECT auth.uid()::text)
);

CREATE POLICY "report_photos_insert_own_folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'report-photos'
  AND owner_id = (SELECT auth.uid()::text)
  AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
);

CREATE POLICY "report_photos_delete_own"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'report-photos'
  AND owner_id = (SELECT auth.uid()::text)
);
