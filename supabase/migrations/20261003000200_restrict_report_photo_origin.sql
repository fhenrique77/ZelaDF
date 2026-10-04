-- ZDF-05: client writes may reference only this project's owned Storage photos.
-- The signed JWT issuer supplies the Storage origin; never trust a submitted host.
-- Existing legacy URLs remain editable only when photo_url is unchanged.
-- Apply after comparing the target schema, then deploy clients that do not
-- render legacy external URLs. No remote operation is performed by this file.
BEGIN;
SET LOCAL lock_timeout='5s';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid='public.reports'::regclass
      AND tgname='guard_photo_cleanup' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Report photo ownership guard is required';
  END IF;
END $$;

CREATE FUNCTION zeladf_private.guard_report_photo_origin() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_issuer text; v_origin text; v_path text;
BEGIN
  IF TG_OP='UPDATE' AND NEW.photo_url IS NOT DISTINCT FROM OLD.photo_url THEN
    RETURN NEW;
  END IF;
  -- Local seed and internal maintenance do not use client JWTs.
  IF auth.role() IS DISTINCT FROM 'authenticated'
    OR coalesce(NEW.photo_url,'')='' THEN RETURN NEW; END IF;

  v_issuer:=coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'iss';
  IF v_issuer IS NULL OR v_issuer !~ '^https?://[^/?#@]+/auth/v1$' THEN
    RAISE EXCEPTION 'Invalid report photo origin' USING ERRCODE='22023';
  END IF;
  v_origin:=pg_catalog.regexp_replace(v_issuer,'/auth/v1$','');
  v_path:=substring(NEW.photo_url FROM '/storage/v1/object/public/report-photos/(.+)$');
  IF v_path IS NULL OR v_path !~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
    OR NEW.photo_url IS DISTINCT FROM
      v_origin || '/storage/v1/object/public/report-photos/' || v_path
  THEN
    RAISE EXCEPTION 'Invalid report photo origin' USING ERRCODE='22023';
  END IF;
  -- guard_photo_cleanup runs first and verifies the object and its owner.
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION zeladf_private.guard_report_photo_origin()
  FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_report_photo_origin BEFORE INSERT OR UPDATE OF photo_url
  ON public.reports FOR EACH ROW
  EXECUTE FUNCTION zeladf_private.guard_report_photo_origin();
COMMIT;
