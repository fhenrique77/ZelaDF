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
