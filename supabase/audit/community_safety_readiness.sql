-- Somente metadados; nenhum conteudo de avisos, contas ou denuncias.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='10s';
SELECT jsonb_build_object(
  'functions', (SELECT jsonb_agg(jsonb_build_object(
    'signature',signature,'exists',to_regprocedure(signature) IS NOT NULL,
    'authenticated_execute',CASE WHEN to_regprocedure(signature) IS NOT NULL THEN has_function_privilege('authenticated',to_regprocedure(signature),'EXECUTE') ELSE false END
  )) FROM (VALUES
    ('public.accept_community_terms(text)'),('public.community_terms_accepted()'),
    ('public.flag_report(uuid,text,text,text)'),('public.block_report_author(uuid)'),
    ('public.clear_my_community_blocks()'),('public.set_report_vote(uuid,boolean,text)')
  ) AS expected(signature)),
  'private_tables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='zeladf_private' AND c.relkind='r' AND c.relrowsecurity
      AND c.relname IN ('community_consents','community_blocks','community_flags','community_hidden_reports')),
  'consent_triggers',(SELECT count(*) FROM pg_trigger WHERE tgrelid='public.reports'::regclass AND tgenabled='O' AND tgname IN ('require_community_terms','require_community_terms_edit'))
) AS readiness;
ROLLBACK;
