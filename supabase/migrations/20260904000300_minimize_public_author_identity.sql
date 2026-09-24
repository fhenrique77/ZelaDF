-- Removes account-derived display names from reports.
-- This migration is intentionally irreversible: a rollback must not restore PII.
-- Audit the remote schema and back up only if legally/operationally required before applying.

UPDATE public.reports
SET author_name = 'Cidadão'
WHERE author_name IS DISTINCT FROM 'Cidadão';

ALTER TABLE public.reports
  ALTER COLUMN author_name SET DEFAULT 'Cidadão',
  ALTER COLUMN author_name SET NOT NULL;

ALTER TABLE public.reports
  ADD CONSTRAINT reports_author_name_is_generic
  CHECK (author_name = 'Cidadão')
  NOT VALID;

ALTER TABLE public.reports
  VALIDATE CONSTRAINT reports_author_name_is_generic;

COMMENT ON COLUMN public.reports.author_name IS
  'Legacy compatibility field. Always generic; account names, email addresses and phone numbers are not public report data.';
