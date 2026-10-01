-- The webhook reads only an event ID, never the private reason or operator ID.
-- This prepares push but does not enable a webhook or client access.
CREATE TABLE public.push_status_events (
  id UUID PRIMARY KEY REFERENCES public.report_status_history(id) ON DELETE CASCADE
);

ALTER TABLE public.push_status_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_status_events FROM PUBLIC, anon, authenticated;

CREATE FUNCTION zeladf_private.enqueue_push_status_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.push_status_events(id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION zeladf_private.enqueue_push_status_event()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER enqueue_push_status_event_after_history_insert
  AFTER INSERT ON public.report_status_history
  FOR EACH ROW EXECUTE FUNCTION zeladf_private.enqueue_push_status_event();

-- One claim per committed status event. A claim is never returned twice.
CREATE TABLE zeladf_private.push_status_event_claims (
  event_id UUID PRIMARY KEY REFERENCES public.push_status_events(id) ON DELETE CASCADE,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

REVOKE ALL ON zeladf_private.push_status_event_claims FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.claim_push_status_event(p_event_id UUID)
RETURNS TABLE(report_id UUID, author_id UUID, title TEXT, to_status TEXT)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH eligible AS (
    SELECT h.id AS event_id, r.id AS report_id, r.author_id,
           r.title, h.to_status
    FROM public.push_status_events q
    JOIN public.report_status_history h ON h.id = q.id
    JOIN public.reports r ON r.id = h.report_id
    WHERE h.id = p_event_id
      AND r.author_id IS NOT NULL
      AND r.status = h.to_status
  ), claimed AS (
    INSERT INTO zeladf_private.push_status_event_claims(event_id)
    SELECT event_id FROM eligible
    ON CONFLICT (event_id) DO NOTHING
    RETURNING event_id
  )
  SELECT e.report_id, e.author_id, e.title, e.to_status
  FROM eligible e JOIN claimed c USING (event_id);
$$;

REVOKE ALL ON FUNCTION public.claim_push_status_event(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_push_status_event(UUID) TO service_role;

COMMENT ON FUNCTION public.claim_push_status_event(UUID) IS
  'Service-only, at-most-once claim for a committed status event. A failed FCM send is not retried automatically.';
