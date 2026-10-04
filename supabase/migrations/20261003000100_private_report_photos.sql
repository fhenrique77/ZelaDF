-- ZDF-02: revoke public report-photo URLs while preserving authorized reads.
-- Deploy with web/Android clients that use Storage download for managed photos.
-- Compare the target Storage schema and policies before applying.
-- Rollback to public=true re-exposes every saved URL, including moderated photos.
BEGIN;
SET LOCAL lock_timeout='5s';

DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='report-photos') THEN
    RAISE EXCEPTION 'report-photos bucket is missing';
  END IF;
  IF pg_catalog.to_regprocedure('storage.allow_only_operation(text)') IS NULL
    OR pg_catalog.to_regprocedure('storage.allow_any_operation(text[])') IS NULL THEN
    RAISE EXCEPTION 'Storage operation-aware policies are required';
  END IF;
END $$;

CREATE FUNCTION zeladf_private.managed_report_photo_path(p_url text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT pg_catalog.split_part(pg_catalog.split_part(coalesce(
    substring(p_url FROM '/storage/v1/object/public/report-photos/(.+)$'),
    substring(p_url FROM '/storage/v1/render/image/public/report-photos/(.+)$')
  ),'?',1),'#',1);
$$;
REVOKE ALL ON FUNCTION zeladf_private.managed_report_photo_path(text)
  FROM PUBLIC,anon,authenticated;

-- A cleanup claim is a durable path tombstone. It prevents re-upload at that
-- path and keeps a moderated photo denied even after its report is edited or deleted.
CREATE FUNCTION zeladf_private.capture_hidden_report_photo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_url text; v_path text; v_owner uuid; v_author uuid;
BEGIN
  IF TG_TABLE_SCHEMA='zeladf_private' THEN
    SELECT r.photo_url,r.author_id INTO v_url,v_author FROM public.reports r
      WHERE r.id=NEW.report_id FOR UPDATE;
  ELSE
    IF NOT EXISTS(SELECT 1 FROM zeladf_private.community_hidden_reports h
      WHERE h.report_id=NEW.id) THEN RETURN NEW; END IF;
    v_url:=NEW.photo_url;
    v_author:=NEW.author_id;
  END IF;
  v_path:=zeladf_private.managed_report_photo_path(v_url);
  IF v_path IS NULL OR v_path !~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
  THEN RETURN NEW; END IF;
  v_owner:=pg_catalog.split_part(v_path,'/',1)::uuid;
  IF v_author IS NOT NULL AND v_author<>v_owner THEN RETURN NEW; END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=v_owner) THEN RETURN NEW; END IF;
  IF v_author IS NULL AND NOT EXISTS(SELECT 1 FROM storage.objects o
    WHERE o.bucket_id='report-photos' AND o.name=v_path
      AND o.owner_id=v_owner::text) THEN RETURN NEW; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_path,240925));
  INSERT INTO zeladf_private.report_photo_cleanup_claims(photo_path,user_id)
    VALUES(v_path,v_owner) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION zeladf_private.capture_hidden_report_photo()
  FROM PUBLIC,anon,authenticated;
CREATE TRIGGER capture_hidden_report_photo AFTER INSERT
  ON zeladf_private.community_hidden_reports FOR EACH ROW
  EXECUTE FUNCTION zeladf_private.capture_hidden_report_photo();
CREATE TRIGGER capture_hidden_report_photo_update AFTER UPDATE OF photo_url
  ON public.reports FOR EACH ROW
  EXECUTE FUNCTION zeladf_private.capture_hidden_report_photo();

-- Preserve decisions that predate this migration.
DO $$
DECLARE v_path text; v_owner uuid; v_item record;
BEGIN
  FOR v_item IN SELECT DISTINCT
      zeladf_private.managed_report_photo_path(r.photo_url) AS photo_path,r.author_id
    FROM public.reports r
    JOIN zeladf_private.community_hidden_reports h ON h.report_id=r.id
  LOOP
    v_path:=v_item.photo_path;
    IF v_path IS NULL OR v_path !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
    THEN CONTINUE; END IF;
    v_owner:=pg_catalog.split_part(v_path,'/',1)::uuid;
    IF v_item.author_id IS NOT NULL AND v_item.author_id<>v_owner THEN CONTINUE; END IF;
    IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=v_owner) THEN CONTINUE; END IF;
    IF v_item.author_id IS NULL AND NOT EXISTS(SELECT 1 FROM storage.objects o
      WHERE o.bucket_id='report-photos' AND o.name=v_path
        AND o.owner_id=v_owner::text) THEN CONTINUE; END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_path,240925));
    INSERT INTO zeladf_private.report_photo_cleanup_claims(photo_path,user_id)
      VALUES(v_path,v_owner) ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

CREATE FUNCTION public.report_photo_downloadable(p_path text,p_owner_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT p_owner_id IS NOT NULL
    AND p_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
    AND pg_catalog.split_part(p_path,'/',1)=p_owner_id
    AND EXISTS(SELECT 1 FROM auth.users u WHERE u.id::text=p_owner_id)
    AND NOT EXISTS(SELECT 1 FROM zeladf_private.report_photo_cleanup_claims c
      WHERE c.photo_path=p_path)
    AND EXISTS(SELECT 1 FROM public.reports r
      WHERE (r.author_id::text=p_owner_id OR r.author_id IS NULL)
        AND zeladf_private.managed_report_photo_path(r.photo_url)=p_path
        AND public.community_report_visible(r.id)
        AND NOT EXISTS(SELECT 1 FROM zeladf_private.community_hidden_reports h
          WHERE h.report_id=r.id))
    AND NOT EXISTS(SELECT 1 FROM public.reports r
      JOIN zeladf_private.community_hidden_reports h ON h.report_id=r.id
      WHERE (r.author_id::text=p_owner_id OR r.author_id IS NULL)
        AND zeladf_private.managed_report_photo_path(r.photo_url)=p_path);
$$;
REVOKE ALL ON FUNCTION public.report_photo_downloadable(text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.report_photo_downloadable(text,text)
  TO anon,authenticated;

-- The restrictive gate applies even if an older permissive SELECT policy exists.
-- Owners retain metadata/cleanup access, but hidden bytes are denied even
-- to the owner. Visitors get only bytes from an authorized download.
CREATE POLICY report_photos_visibility_gate ON storage.objects
  AS RESTRICTIVE FOR SELECT TO anon,authenticated
  USING (
    bucket_id<>'report-photos'
    OR (owner_id=(SELECT auth.uid()::text)
      AND storage.allow_any_operation(ARRAY[
        'object.list','object.list_v2','object.get_authenticated_info',
        'object.head_authenticated_info','object.info_authenticated',
        'object.delete','object.delete_many'
      ]))
    OR (storage.allow_only_operation('object.get_authenticated')
      AND public.report_photo_downloadable(name,owner_id))
  );
CREATE POLICY report_photos_download_visible ON storage.objects
  FOR SELECT TO anon,authenticated
  USING (
    bucket_id='report-photos'
    AND storage.allow_only_operation('object.get_authenticated')
    AND public.report_photo_downloadable(name,owner_id)
  );

UPDATE storage.buckets SET public=false WHERE id='report-photos';
COMMIT;
