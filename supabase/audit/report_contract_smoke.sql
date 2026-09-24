-- Contratos de validacao e status; somente fixtures revertidas.
BEGIN;
SET LOCAL statement_timeout='30s';
CREATE TEMP TABLE contract_fixture(user_id uuid, report_id uuid);
INSERT INTO contract_fixture VALUES(gen_random_uuid(),NULL);
GRANT SELECT,UPDATE ON contract_fixture TO authenticated;
INSERT INTO auth.users(id) SELECT user_id FROM contract_fixture;
DO $$ BEGIN PERFORM set_config('request.jwt.claim.sub',(SELECT user_id::text FROM contract_fixture),true); END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE rid uuid; BEGIN
  ASSERT NOT public.current_user_is_operator(), 'User unexpectedly operator';
  INSERT INTO public.reports(category,title,ra,address,lat,lng)
    VALUES('buraco','Ensaio de status','Plano Piloto','Endereco de teste',-15.8,-47.9) RETURNING id INTO rid;
  UPDATE contract_fixture SET report_id=rid;
  BEGIN
    INSERT INTO public.reports(category,title,ra,address,lat,lng)
      VALUES('categoria-invalida','Ensaio invalido','Plano Piloto','Endereco de teste',-15.8,-47.9);
    RAISE EXCEPTION 'Category validation failed';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE public.reports SET title='x' WHERE id=rid;
    RAISE EXCEPTION 'Title validation failed';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM public.change_report_status(rid,'andamento','Motivo transacional de teste');
    RAISE EXCEPTION 'Non-operator transition allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
INSERT INTO public.operator_users(user_id) SELECT user_id FROM contract_fixture;
SET LOCAL ROLE authenticated;
DO $$ DECLARE rid uuid := (SELECT report_id FROM contract_fixture); BEGIN
  ASSERT public.current_user_is_operator(), 'Operator lookup failed';
  BEGIN
    PERFORM public.change_report_status(rid,'andamento','');
    RAISE EXCEPTION 'Empty reason accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  PERFORM public.change_report_status(rid,'andamento','Motivo transacional de teste');
  ASSERT (SELECT status='andamento' FROM public.reports WHERE id=rid), 'Transition failed';
  ASSERT (SELECT count(*)=1 FROM public.report_status_history WHERE report_id=rid AND from_status='aberto' AND to_status='andamento'), 'Atomic history failed';
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'Validacao e fluxo de status aprovados; conta/operador/aviso de teste revertidos.' AS resultado;
