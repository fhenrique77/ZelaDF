-- Read-only presence check for backend migrations planned for production.
-- No application rows, credentials, or function bodies are returned.
SELECT 'table' AS kind, name, to_regclass(name) IS NOT NULL AS present FROM (VALUES
 ('zeladf_private.report_create_requests'),('zeladf_private.report_photo_cleanup_jobs'),
 ('zeladf_private.account_deletion_jobs'),('zeladf_private.report_photo_cleanup_claims')) AS t(name)
UNION ALL
SELECT 'function', name, EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=split_part(name,'.',1) AND p.proname=split_part(name,'.',2)) FROM (VALUES
 ('public.create_report_idempotent'),('public.queue_report_photo_cleanup'),
 ('public.begin_account_deletion'),('public.account_deletion_photo_batch'),
 ('public.purge_account_deletion_data'),('public.finish_account_deletion'),
 ('public.claim_report_photo_cleanup'),('public.finish_report_photo_cleanup'),
 ('zeladf_private.guard_photo_cleanup'),('zeladf_private.deny_deleting_account_write')) AS f(name)
ORDER BY kind,name;
