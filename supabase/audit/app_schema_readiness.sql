-- Metadados somente: recursos usados pelo app e autorizacao do Storage.
BEGIN TRANSACTION READ ONLY;
SELECT jsonb_build_object(
  'public_tables', (SELECT jsonb_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='public'),
  'functions', (SELECT jsonb_agg(p.oid::regprocedure::text ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('current_user_is_operator','change_report_status','request_account_deletion','set_report_vote','get_my_report_ids','get_my_reports')),
  'storage_policies', (SELECT jsonb_agg(to_jsonb(p)) FROM pg_policies p WHERE schemaname='storage' AND tablename='objects'),
  'bucket', (SELECT jsonb_build_object('public',public,'file_size_limit',file_size_limit,'allowed_mime_types',allowed_mime_types) FROM storage.buckets WHERE id='report-photos'),
  'auth_user_custom_triggers', (SELECT jsonb_agg(jsonb_build_object('name',tgname,'function',tgfoid::regprocedure::text)) FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND NOT tgisinternal),
  'extensions', (SELECT jsonb_agg(extname) FROM pg_extension)
  ,'push_columns', (SELECT jsonb_agg(jsonb_build_object('name',column_name,'type',data_type,'nullable',is_nullable)) FROM information_schema.columns WHERE table_schema='public' AND table_name='push_tokens')
  ,'push_policies', (SELECT jsonb_agg(to_jsonb(p)) FROM pg_policies p WHERE schemaname='public' AND tablename='push_tokens')
  ,'push_rls', (SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.push_tokens'))
  ,'push_constraints', (SELECT jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid),'validated',convalidated)) FROM pg_constraint WHERE conrelid=to_regclass('public.push_tokens'))
) AS app_schema;
ROLLBACK;
