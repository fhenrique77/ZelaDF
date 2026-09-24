-- Ensaio administrativo transacional com duas contas sinteticas.
-- Nenhuma conta, aviso ou voto de teste permanece apos o ROLLBACK.
-- Executar inteiro; nao usa nem exibe dados das contas reais.
BEGIN;
SET LOCAL statement_timeout = '30s';
CREATE TEMP TABLE flow_fixture(owner_id uuid, other_id uuid, report_id uuid);
INSERT INTO flow_fixture VALUES (gen_random_uuid(), gen_random_uuid(), NULL);
GRANT SELECT, UPDATE ON flow_fixture TO authenticated;
INSERT INTO auth.users(id) SELECT owner_id FROM flow_fixture UNION ALL SELECT other_id FROM flow_fixture;
DO $$ BEGIN PERFORM set_config('request.jwt.claim.sub', (SELECT owner_id::text FROM flow_fixture), true); END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE rid uuid; outcome record;
BEGIN
  INSERT INTO public.reports(category,title,ra,address,lat,lng)
    VALUES ('buraco','Ensaio transacional','Plano Piloto','Endereco de teste',-15.8,-47.9)
    RETURNING id INTO rid;
  UPDATE flow_fixture SET report_id=rid;
  SELECT * INTO outcome FROM public.set_report_vote(rid,true,'transactional-smoke');
  ASSERT outcome.voted AND outcome.confirmations=1, 'Initial vote failed';
  SELECT * INTO outcome FROM public.set_report_vote(rid,true,'transactional-smoke');
  ASSERT outcome.voted AND outcome.confirmations=1, 'Vote not idempotent';
  ASSERT (SELECT count(*)=1 FROM public.get_my_report_ids(ARRAY[rid])), 'Ownership RPC failed';
  ASSERT (SELECT count(*)=1 FROM public.get_my_reports(-16,-48,-15,-47,NULL,NULL,200) WHERE id=rid), 'My reports RPC failed';
  BEGIN
    PERFORM author_id FROM public.reports LIMIT 1;
    RAISE EXCEPTION 'Private authorship exposed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.reports SET confirmations=100 WHERE id=rid;
    RAISE EXCEPTION 'Direct counter mutation allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.reports SET status='resolvido' WHERE id=rid;
    RAISE EXCEPTION 'Direct status mutation allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.votes(report_id,device_id) VALUES (rid,'forbidden');
    RAISE EXCEPTION 'Direct vote mutation allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN PERFORM set_config('request.jwt.claim.sub', (SELECT other_id::text FROM flow_fixture), true); END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE rid uuid := (SELECT report_id FROM flow_fixture); affected integer; outcome record;
BEGIN
  ASSERT (SELECT count(*)=0 FROM public.get_my_report_ids(ARRAY[rid])), 'Other owner exposed';
  ASSERT (SELECT count(*)=0 FROM public.get_my_reports(-16,-48,-15,-47,NULL,NULL,200) WHERE id=rid), 'Other reports exposed';
  UPDATE public.reports SET title='Alteracao proibida' WHERE id=rid;
  GET DIAGNOSTICS affected = ROW_COUNT;
  ASSERT affected=0, 'Other user edit allowed';
  DELETE FROM public.reports WHERE id=rid;
  GET DIAGNOSTICS affected = ROW_COUNT;
  ASSERT affected=0, 'Other user delete allowed';
  SELECT * INTO outcome FROM public.set_report_vote(rid,true,'transactional-smoke');
  ASSERT outcome.voted AND outcome.confirmations=2, 'Shared device incorrectly deduplicated';
  ASSERT (SELECT count(*)=1 FROM public.votes WHERE report_id=rid), 'Vote RLS failed';
  SELECT * INTO outcome FROM public.set_report_vote(rid,false,'transactional-smoke');
  ASSERT NOT outcome.voted AND outcome.confirmations=1, 'Vote removal failed';
END $$;
RESET ROLE;
DO $$ BEGIN PERFORM set_config('request.jwt.claim.sub', (SELECT owner_id::text FROM flow_fixture), true); END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE affected integer; BEGIN
  DELETE FROM public.reports WHERE id=(SELECT report_id FROM flow_fixture);
  GET DIAGNOSTICS affected = ROW_COUNT;
  ASSERT affected=1, 'Owner delete failed';
END $$;
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT count(*)=0 FROM public.votes WHERE report_id=(SELECT report_id FROM flow_fixture)), 'Vote cascade failed';
  PERFORM set_config('request.jwt.claim.sub','',true);
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
  PERFORM id,title FROM public.reports LIMIT 1;
  BEGIN
    PERFORM author_id FROM public.reports LIMIT 1;
    RAISE EXCEPTION 'Anonymous private read allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.reports(category,title,ra,address,lat,lng)
      VALUES ('buraco','Publicacao proibida','Plano Piloto','Endereco de teste',-15.8,-47.9);
    RAISE EXCEPTION 'Anonymous report creation allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'Ensaio aprovado: criacao, votos, autoria, isolamento e exclusao; fixtures revertidas.' AS resultado;
