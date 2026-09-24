-- Complemento para solicitacoes de exclusao e limpeza de tokens.
-- Proprietario confirmou atendimento manual em 2026-09-13.
-- Nenhuma conta ou token real e removido por este reparo. Push permanece desativado.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ BEGIN
  IF to_regclass('public.account_deletion_requests') IS NOT NULL
    OR to_regprocedure('public.request_account_deletion()') IS NOT NULL
    OR (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='push_tokens') <> 5
    OR (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='push_tokens') <> 3
    OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.push_tokens'::regclass AND conname='push_tokens_user_id_fkey' AND confdeltype='a' AND confrelid='auth.users'::regclass AND convalidated)
    OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.push_tokens'::regclass AND NOT tgisinternal)
  THEN RAISE EXCEPTION 'Estrutura de conta/push divergiu da auditoria'; END IF;
END $$;
ALTER TABLE public.push_tokens DROP CONSTRAINT push_tokens_user_id_fkey;
ALTER TABLE public.push_tokens ADD CONSTRAINT push_tokens_user_id_fkey FOREIGN KEY(user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.push_tokens ADD CONSTRAINT push_tokens_token_length CHECK(char_length(token) BETWEEN 20 AND 4096) NOT VALID;
ALTER TABLE public.push_tokens ADD CONSTRAINT push_tokens_platform_android CHECK(platform='android') NOT VALID;
DROP POLICY "Users can insert their own tokens" ON public.push_tokens;
DROP POLICY "Users can read their own tokens" ON public.push_tokens;
DROP POLICY "Users can update their own tokens" ON public.push_tokens;
REVOKE ALL ON public.push_tokens FROM PUBLIC,anon,authenticated;
REVOKE SELECT(id,user_id,token,platform,updated_at), INSERT(id,user_id,token,platform,updated_at), UPDATE(id,user_id,token,platform,updated_at), REFERENCES(id,user_id,token,platform,updated_at) ON public.push_tokens FROM PUBLIC,anon,authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_tokens TO authenticated;

CREATE POLICY "Users can read their own push tokens"
  ON public.push_tokens
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL AND (SELECT auth.uid()) = user_id);

CREATE POLICY "Users can register their own push tokens"
  ON public.push_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND (SELECT auth.uid()) = user_id);

CREATE POLICY "Users can refresh their own push tokens"
  ON public.push_tokens
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL AND (SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND (SELECT auth.uid()) = user_id);

CREATE POLICY "Users can remove their own push tokens"
  ON public.push_tokens
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL AND (SELECT auth.uid()) = user_id);

-- A token identifies one app installation. Before an authenticated INSERT,
-- remove a stale association left by a different account on the same device.
CREATE SCHEMA IF NOT EXISTS zeladf_private;
REVOKE ALL ON SCHEMA zeladf_private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION zeladf_private.reassign_push_token()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.push_tokens
  WHERE token = NEW.token
    AND user_id <> NEW.user_id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION zeladf_private.reassign_push_token() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER reassign_push_token_before_insert
  BEFORE INSERT ON public.push_tokens
  FOR EACH ROW
  EXECUTE FUNCTION zeladf_private.reassign_push_token();

COMMENT ON TABLE public.push_tokens IS
  'Private Android FCM registrations. Tokens must never be exposed in public queries or logs.';

-- Prerequisites: audited baseline, isolated validation and an assigned privacy
-- operator before rollout. This records requests; it does not delete accounts.
-- Rollback: disable the entry point and retain pending requests until fulfilled.
-- Do not drop the queue as a rollback or expose it to general report operators.
CREATE TABLE public.account_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_review'))
);

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_deletion_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, created_at, status) ON public.account_deletion_requests TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.account_deletion_requests TO service_role;

CREATE POLICY account_deletion_requests_read_own
ON public.account_deletion_requests FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

CREATE FUNCTION public.request_account_deletion()
RETURNS TABLE (id UUID, created_at TIMESTAMPTZ, status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id UUID := (SELECT auth.uid());
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required' USING ERRCODE = '42501';
  END IF;

  -- Retrying or using two devices preserves the original request and timestamp.
  INSERT INTO public.account_deletion_requests (user_id) VALUES (actor_id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN QUERY
  SELECT request.id, request.created_at, request.status
  FROM public.account_deletion_requests AS request
  WHERE request.user_id = actor_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_account_deletion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_account_deletion() TO authenticated;

COMMENT ON TABLE public.account_deletion_requests IS
  'Private account deletion requests. Fulfill through an authorized privacy process; no automatic deletion. Removed with the Auth account.';

NOTIFY pgrst, 'reload schema';
COMMIT;
SELECT 'Fila privada de exclusao e limpeza de tokens instaladas; atendimento manual, push desativado.' AS resultado;
