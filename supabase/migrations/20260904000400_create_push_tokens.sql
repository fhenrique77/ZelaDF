-- Prepares device push subscriptions without activating the external webhook.
-- Audit the remote baseline before applying this migration.

CREATE TABLE public.push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT push_tokens_token_length CHECK (char_length(token) BETWEEN 20 AND 4096),
  CONSTRAINT push_tokens_platform_android CHECK (platform = 'android'),
  CONSTRAINT push_tokens_token_unique UNIQUE (token)
);

CREATE INDEX idx_push_tokens_user_id ON public.push_tokens (user_id);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.push_tokens FROM anon, authenticated;
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
