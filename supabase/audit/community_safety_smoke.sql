-- Executar somente apos instalar a migration de comunidade, ou concatenado
-- a ela sem COMMIT para ensaio integral. Fixtures sinteticas, tudo revertido.
BEGIN;
SET LOCAL statement_timeout='30s';
CREATE TEMP TABLE community_fixture(owner_id uuid,reader_id uuid,report_id uuid,flag_id uuid);
INSERT INTO community_fixture VALUES(gen_random_uuid(),gen_random_uuid(),NULL,NULL);
GRANT SELECT,UPDATE ON community_fixture TO authenticated;
INSERT INTO auth.users(id) SELECT owner_id FROM community_fixture UNION ALL SELECT reader_id FROM community_fixture;
DO $$ BEGIN PERFORM set_config('request.jwt.claim.sub',(SELECT owner_id::text FROM community_fixture),true); END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE rid uuid; BEGIN
  BEGIN
    INSERT INTO public.reports(category,title,ra,address,lat,lng)
      VALUES('buraco','Ensaio sem aceite','Plano Piloto','Endereco sintetico',-15.8,-47.9);
    RAISE EXCEPTION 'Consent requirement bypassed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM public.accept_community_terms('2026-09-13');
  INSERT INTO public.reports(category,title,ra,address,lat,lng)
    VALUES('buraco','Ensaio da comunidade','Plano Piloto','Endereco sintetico',-15.8,-47.9) RETURNING id INTO rid;
  UPDATE community_fixture SET report_id=rid;
  INSERT INTO storage.objects(bucket_id,name,owner_id)
    SELECT 'report-photos',owner_id::text||'/community-smoke.jpg',owner_id::text FROM community_fixture;
END $$;
RESET ROLE;
DELETE FROM zeladf_private.community_consents WHERE user_id=(SELECT owner_id FROM community_fixture);
SET LOCAL ROLE authenticated;
DO $$ DECLARE rid uuid:=(SELECT report_id FROM community_fixture); BEGIN
  BEGIN
    UPDATE public.reports SET title='Edicao sem aceite' WHERE id=rid;
    RAISE EXCEPTION 'Edit consent requirement bypassed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM public.accept_community_terms('2026-09-13');
  UPDATE public.reports SET title='Edicao com aceite' WHERE id=rid;
  ASSERT (SELECT title='Edicao com aceite' FROM public.reports WHERE id=rid), 'Edit after consent failed';
END $$;
RESET ROLE;
DO $$ BEGIN PERFORM set_config('request.jwt.claim.sub',(SELECT reader_id::text FROM community_fixture),true); END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE rid uuid:=(SELECT report_id FROM community_fixture); fid uuid; BEGIN
  ASSERT NOT public.community_terms_accepted(), 'Consent leaked across accounts';
  fid:=public.flag_report(rid,'author','privacy','Detalhes sinteticos');
  ASSERT fid=public.flag_report(rid,'author','privacy','Repeticao'), 'Complaint not idempotent';
  UPDATE community_fixture SET flag_id=fid;
  BEGIN
    PERFORM * FROM zeladf_private.community_flags;
    RAISE EXCEPTION 'Private queue exposed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM public.block_report_author(rid);
  ASSERT NOT EXISTS(SELECT id FROM public.reports WHERE id=rid), 'Blocked author visible';
  BEGIN
    PERFORM public.set_report_vote(rid,true,'synthetic-device');
    RAISE EXCEPTION 'Blocked content received vote';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  PERFORM public.clear_my_community_blocks();
  ASSERT EXISTS(SELECT id FROM public.reports WHERE id=rid), 'Unblock failed';
  PERFORM public.set_report_vote(rid,true,'synthetic-device');
END $$;
RESET ROLE;
SELECT zeladf_private.review_community_flag(flag_id,'hidden','Decisao administrativa sintetica') FROM community_fixture;
SET LOCAL ROLE authenticated;
DO $$ BEGIN ASSERT NOT EXISTS(SELECT id FROM public.reports WHERE id=(SELECT report_id FROM community_fixture)), 'Moderated content visible'; END $$;
RESET ROLE;
DO $$ BEGIN PERFORM set_config('request.jwt.claim.sub',(SELECT owner_id::text FROM community_fixture),true); END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN ASSERT EXISTS(SELECT id FROM public.reports WHERE id=(SELECT report_id FROM community_fixture)), 'Author lost own content access'; END $$;
RESET ROLE;
ROLLBACK;
SELECT 'Comunidade aprovada: aceite, Storage, denuncia, bloqueio, voto, moderacao e isolamento; fixtures revertidas.' AS resultado;
