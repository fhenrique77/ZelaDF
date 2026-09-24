-- Contas/tokens/protocolos sinteticos; nenhum dado real exibido ou removido.
BEGIN;
SET LOCAL statement_timeout='30s';
CREATE TEMP TABLE account_fixture(owner_id uuid,other_id uuid,receipt_id uuid,receipt_at timestamptz,token text);
INSERT INTO account_fixture VALUES(gen_random_uuid(),gen_random_uuid(),NULL,NULL,'synthetic-'||gen_random_uuid());
GRANT SELECT,UPDATE ON account_fixture TO authenticated;
INSERT INTO auth.users(id) SELECT owner_id FROM account_fixture UNION ALL SELECT other_id FROM account_fixture;
DO $$ BEGIN PERFORM set_config('request.jwt.claim.sub',(SELECT owner_id::text FROM account_fixture),true); END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE receipt record; BEGIN
  SELECT * INTO receipt FROM public.request_account_deletion();
  ASSERT receipt.status='pending', 'Request failed';
  UPDATE account_fixture SET receipt_id=receipt.id,receipt_at=receipt.created_at;
  SELECT * INTO receipt FROM public.request_account_deletion();
  ASSERT receipt.id=(SELECT receipt_id FROM account_fixture) AND receipt.created_at=(SELECT receipt_at FROM account_fixture), 'Request retry changed receipt';
  ASSERT (SELECT count(*)=1 FROM public.account_deletion_requests), 'Duplicate requests';
  BEGIN
    PERFORM user_id FROM public.account_deletion_requests;
    RAISE EXCEPTION 'Private request identity exposed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.account_deletion_requests SET status='in_review';
    RAISE EXCEPTION 'Client processing status allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  INSERT INTO public.push_tokens(user_id,token,platform,updated_at)
    SELECT owner_id,token,'android',now() FROM account_fixture;
END $$;
RESET ROLE;
DO $$ BEGIN PERFORM set_config('request.jwt.claim.sub',(SELECT other_id::text FROM account_fixture),true); END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE affected integer; BEGIN
  ASSERT (SELECT count(*)=0 FROM public.account_deletion_requests), 'Other request exposed';
  ASSERT (SELECT count(*)=0 FROM public.push_tokens), 'Other token exposed';
  DELETE FROM public.push_tokens WHERE token=(SELECT token FROM account_fixture);
  GET DIAGNOSTICS affected = ROW_COUNT;
  ASSERT affected=0, 'Other token deletion allowed';
  INSERT INTO public.push_tokens(user_id,token,platform,updated_at)
    SELECT other_id,token,'android',now() FROM account_fixture ON CONFLICT(token) DO UPDATE SET user_id=excluded.user_id;
  ASSERT (SELECT count(*)=1 FROM public.push_tokens WHERE user_id=(SELECT other_id FROM account_fixture)), 'Token reassignment failed';
  DELETE FROM public.push_tokens WHERE token=(SELECT token FROM account_fixture);
  GET DIAGNOSTICS affected = ROW_COUNT;
  ASSERT affected=1, 'Own token cleanup failed';
END $$;
RESET ROLE;
DO $$ BEGIN PERFORM set_config('request.jwt.claim.sub',(SELECT owner_id::text FROM account_fixture),true); END $$;
SET LOCAL ROLE authenticated;
INSERT INTO public.push_tokens(user_id,token,platform,updated_at)
  SELECT owner_id,token,'android',now() FROM account_fixture;
RESET ROLE;
DELETE FROM auth.users WHERE id=(SELECT owner_id FROM account_fixture);
DO $$ BEGIN
  ASSERT (SELECT count(*)=0 FROM public.push_tokens WHERE token=(SELECT token FROM account_fixture)), 'Auth token cascade failed';
  ASSERT (SELECT count(*)=0 FROM public.account_deletion_requests WHERE id=(SELECT receipt_id FROM account_fixture)), 'Request cascade failed';
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM id FROM public.account_deletion_requests;
    RAISE EXCEPTION 'Anonymous queue access allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM * FROM public.request_account_deletion();
    RAISE EXCEPTION 'Anonymous request allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'Fila, idempotencia, isolamento e limpeza de tokens aprovados; fixtures revertidas.' AS resultado;
