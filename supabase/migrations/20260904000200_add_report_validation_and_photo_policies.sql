-- Adds server-side validation for reports and narrows report photo writes.
-- Apply only after auditing the remote schema and existing Storage policies.

ALTER TABLE public.reports
  ADD CONSTRAINT reports_category_allowed
  CHECK (category IN ('agua', 'buraco', 'poste', 'lixo', 'semaforo', 'outro'))
  NOT VALID;

ALTER TABLE public.reports
  ADD CONSTRAINT reports_title_length
  CHECK (char_length(btrim(title)) >= 5 AND char_length(title) <= 120)
  NOT VALID;

ALTER TABLE public.reports
  ADD CONSTRAINT reports_description_length
  CHECK (char_length(coalesce(description, '')) <= 2000)
  NOT VALID;

ALTER TABLE public.reports
  ADD CONSTRAINT reports_ra_length
  CHECK (char_length(btrim(ra)) >= 2 AND char_length(ra) <= 80)
  NOT VALID;

ALTER TABLE public.reports
  ADD CONSTRAINT reports_address_length
  CHECK (char_length(btrim(address)) >= 3 AND char_length(address) <= 200)
  NOT VALID;

ALTER TABLE public.reports
  ADD CONSTRAINT reports_coordinates_valid
  CHECK (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180)
  NOT VALID;

ALTER TABLE public.reports
  ADD CONSTRAINT reports_status_allowed
  CHECK (status IN ('aberto', 'andamento', 'resolvido'))
  NOT VALID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'report-photos'
  ) THEN
    RAISE EXCEPTION 'Bucket report-photos must exist before applying this migration';
  END IF;
END
$$;

UPDATE storage.buckets
SET
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'report-photos';

DROP POLICY IF EXISTS "Qualquer um pode fazer upload" ON storage.objects;
DROP POLICY IF EXISTS "report_photos_insert_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "report_photos_delete_own" ON storage.objects;

CREATE POLICY "report_photos_insert_authenticated"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'report-photos');

CREATE POLICY "report_photos_delete_own"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'report-photos'
  AND owner_id = (SELECT auth.uid()::text)
);
