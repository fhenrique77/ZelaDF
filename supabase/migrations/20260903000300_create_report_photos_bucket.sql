-- RECONSTRUCTED EVOLUTION: replaces the historical manual Storage setup.
-- The permissive upload policy is reproduced here and narrowed by migration
-- 20260904000200. This sequence documents history; it is not the target security model.

INSERT INTO storage.buckets (id, name, public)
VALUES ('report-photos', 'report-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Qualquer um pode fazer upload"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'report-photos');
