-- Supports viewport, filter and author queries introduced in the web client.
-- Apply only after confirming the remote schema matches the documented baseline.

CREATE INDEX IF NOT EXISTS idx_reports_lat
  ON public.reports (lat);

CREATE INDEX IF NOT EXISTS idx_reports_lng
  ON public.reports (lng);

CREATE INDEX IF NOT EXISTS idx_reports_category_status_created_at
  ON public.reports (category, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reports_author_created_at
  ON public.reports (author_id, created_at DESC)
  WHERE author_id IS NOT NULL;
