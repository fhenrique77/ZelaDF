-- Backup logico limitado as tabelas alteradas pelo reparo de avisos/votos.
-- A saida contem dados pessoais: gravar somente em arquivo local protegido.
-- Nao imprimir no terminal nem enviar para chat, Git ou deploy.
-- Nao inclui contas Auth, secrets ou arquivos do Storage.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';
SELECT jsonb_build_object(
  'captured_at', now(), 'postgres_version', current_setting('server_version'),
  'reports', (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id), '[]'::jsonb) FROM public.reports r),
  'votes', (SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.id), '[]'::jsonb) FROM public.votes v)
) AS report_flow_backup;
ROLLBACK;
