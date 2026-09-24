-- Coordenar com frontend que aceita termos antes do upload/publicacao.
-- Nao aplicar por db push sobre o baseline remoto ainda nao reconciliado.
-- Novos dados privados; nenhuma identidade Auth e exposta pelo contrato publico.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
CREATE TABLE zeladf_private.community_consents (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version text NOT NULL CHECK(version='2026-09-13'),
  accepted_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,version)
);
CREATE TABLE zeladf_private.community_blocks (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,blocked_user_id), CHECK(user_id<>blocked_user_id)
);
CREATE TABLE zeladf_private.community_hidden_reports (
  report_id uuid PRIMARY KEY REFERENCES public.reports(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK(char_length(btrim(reason)) BETWEEN 10 AND 500),
  hidden_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE zeladf_private.community_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  target text NOT NULL CHECK(target IN ('report','author')),
  reason text NOT NULL CHECK(reason IN ('spam','violence','hate','sexual','privacy','other')),
  details text NOT NULL CHECK(char_length(details)<=500),
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','hidden','dismissed')),
  resolution text CHECK(char_length(resolution) BETWEEN 10 AND 500),
  reviewed_at timestamptz,
  UNIQUE(reporter_id,report_id,target)
);
CREATE INDEX community_flags_pending ON zeladf_private.community_flags(created_at) WHERE status='pending';
ALTER TABLE zeladf_private.community_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE zeladf_private.community_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE zeladf_private.community_hidden_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE zeladf_private.community_flags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON zeladf_private.community_consents,zeladf_private.community_blocks,
  zeladf_private.community_hidden_reports,zeladf_private.community_flags FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.accept_community_terms(p_version text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_version IS DISTINCT FROM '2026-09-13' THEN RAISE EXCEPTION 'Unsupported terms version' USING ERRCODE='22023'; END IF;
  INSERT INTO zeladf_private.community_consents(user_id,version) VALUES(auth.uid(),p_version) ON CONFLICT DO NOTHING;
END $$;
CREATE FUNCTION public.community_terms_accepted() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM zeladf_private.community_consents WHERE user_id=auth.uid() AND version='2026-09-13');
$$;
REVOKE ALL ON FUNCTION public.accept_community_terms(text),public.community_terms_accepted() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.accept_community_terms(text),public.community_terms_accepted() TO authenticated;

CREATE FUNCTION zeladf_private.require_community_terms() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF current_user IN ('anon','authenticated') AND NOT public.community_terms_accepted() THEN
    RAISE EXCEPTION 'Accept community terms before publishing' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION zeladf_private.require_community_terms() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER require_community_terms BEFORE INSERT ON public.reports
FOR EACH ROW EXECUTE FUNCTION zeladf_private.require_community_terms();
CREATE TRIGGER require_community_terms_edit
BEFORE UPDATE OF title,description,category,ra,address,lat,lng,photo_url ON public.reports
FOR EACH ROW EXECUTE FUNCTION zeladf_private.require_community_terms();
CREATE POLICY report_photo_requires_terms ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK(bucket_id<>'report-photos' OR public.community_terms_accepted());

CREATE FUNCTION public.community_report_visible(p_report_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.reports r WHERE r.id=p_report_id
    AND (r.author_id=auth.uid() OR NOT EXISTS(SELECT 1 FROM zeladf_private.community_hidden_reports h WHERE h.report_id=r.id))
    AND NOT EXISTS(SELECT 1 FROM zeladf_private.community_blocks b WHERE b.user_id=auth.uid() AND b.blocked_user_id=r.author_id));
$$;
REVOKE ALL ON FUNCTION public.community_report_visible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.community_report_visible(uuid) TO anon,authenticated;
CREATE POLICY community_visibility ON public.reports AS RESTRICTIVE FOR SELECT TO anon,authenticated
-- Autoria da linha tambem permite INSERT ... RETURNING antes de ela ser visivel
-- por uma consulta separada. O trigger/grants impedem autoria forjada.
USING(author_id=(SELECT auth.uid()) OR public.community_report_visible(id));

CREATE FUNCTION public.flag_report(p_report_id uuid,p_target text,p_reason text,p_details text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); receipt uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_target IS NULL OR p_target NOT IN ('report','author') OR p_reason IS NULL
    OR p_reason NOT IN ('spam','violence','hate','sexual','privacy','other')
    OR p_details IS NULL OR char_length(p_details)>500 THEN RAISE EXCEPTION 'Invalid complaint' USING ERRCODE='22023'; END IF;
  IF NOT public.community_report_visible(p_report_id) THEN RAISE EXCEPTION 'Report unavailable' USING ERRCODE='P0002'; END IF;
  IF p_target='author' AND NOT EXISTS(SELECT 1 FROM public.reports WHERE id=p_report_id AND author_id IS NOT NULL)
    THEN RAISE EXCEPTION 'Legacy report has no account author; report the content instead' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,928));
  SELECT id INTO receipt FROM zeladf_private.community_flags WHERE reporter_id=actor AND report_id=p_report_id AND target=p_target;
  IF receipt IS NOT NULL THEN RETURN receipt; END IF;
  IF (SELECT count(*) FROM zeladf_private.community_flags WHERE reporter_id=actor AND created_at>now()-interval '1 hour')>=20
    THEN RAISE EXCEPTION 'Complaint rate limit' USING ERRCODE='54000'; END IF;
  INSERT INTO zeladf_private.community_flags(reporter_id,report_id,target,reason,details)
    VALUES(actor,p_report_id,p_target,p_reason,btrim(p_details)) RETURNING id INTO receipt;
  RETURN receipt;
END $$;
CREATE FUNCTION public.block_report_author(p_report_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); target_id uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF NOT public.community_report_visible(p_report_id) THEN RAISE EXCEPTION 'Report unavailable' USING ERRCODE='P0002'; END IF;
  SELECT author_id INTO target_id FROM public.reports WHERE id=p_report_id;
  IF target_id IS NULL THEN RAISE EXCEPTION 'Legacy report has no account author' USING ERRCODE='22023'; END IF;
  IF target_id=actor THEN RAISE EXCEPTION 'Cannot block yourself' USING ERRCODE='22023'; END IF;
  INSERT INTO zeladf_private.community_blocks(user_id,blocked_user_id) VALUES(actor,target_id) ON CONFLICT DO NOTHING;
END $$;
CREATE FUNCTION public.clear_my_community_blocks() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  DELETE FROM zeladf_private.community_blocks WHERE user_id=auth.uid();
END $$;
REVOKE ALL ON FUNCTION public.flag_report(uuid,text,text,text),public.block_report_author(uuid),public.clear_my_community_blocks() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.flag_report(uuid,text,text,text),public.block_report_author(uuid),public.clear_my_community_blocks() TO authenticated;

-- Operacao manual exclusivamente administrativa. Nenhum ID Auth e retornado.
-- Ocultar um aviso nao remove o objeto publico: seguir cleanup pela Storage API.
CREATE FUNCTION zeladf_private.review_community_flag(p_flag_id uuid,p_action text,p_resolution text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rid uuid;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('hidden','dismissed') OR p_resolution IS NULL OR char_length(btrim(p_resolution)) NOT BETWEEN 10 AND 500
    THEN RAISE EXCEPTION 'Invalid moderation decision' USING ERRCODE='22023'; END IF;
  SELECT report_id INTO rid FROM zeladf_private.community_flags WHERE id=p_flag_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Complaint unavailable' USING ERRCODE='P0002'; END IF;
  IF p_action='hidden' THEN
    INSERT INTO zeladf_private.community_hidden_reports(report_id,reason) VALUES(rid,btrim(p_resolution)) ON CONFLICT(report_id) DO UPDATE SET reason=excluded.reason;
  END IF;
  UPDATE zeladf_private.community_flags SET status=p_action,resolution=btrim(p_resolution),reviewed_at=now() WHERE id=p_flag_id;
END $$;
REVOKE ALL ON FUNCTION zeladf_private.review_community_flag(uuid,text,text) FROM PUBLIC,anon,authenticated;
-- Administradores postgres podem consultar a fila e executar a revisao no SQL Editor.

-- Mantem o contrato publico/idempotencia; protege confirmacoes por URL/ID antigo.
ALTER FUNCTION public.set_report_vote(uuid,boolean,text) SET SCHEMA zeladf_private;
REVOKE ALL ON FUNCTION zeladf_private.set_report_vote(uuid,boolean,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.set_report_vote(p_report_id uuid,p_voted boolean,p_device_id text)
RETURNS TABLE(voted boolean,confirmations integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_voted AND NOT public.community_report_visible(p_report_id)
    THEN RAISE EXCEPTION 'Report unavailable' USING ERRCODE='P0002'; END IF;
  RETURN QUERY SELECT * FROM zeladf_private.set_report_vote(p_report_id,p_voted,p_device_id);
END $$;
REVOKE ALL ON FUNCTION public.set_report_vote(uuid,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_report_vote(uuid,boolean,text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
