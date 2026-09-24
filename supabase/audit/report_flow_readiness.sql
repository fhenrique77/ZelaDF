-- Diagnóstico somente leitura de consulta própria e confirmação.
-- Executar no SQL Editor do projeto usado pelo aplicativo.
-- Não consulta avisos, contas, tokens, fotos nem corpos de funções.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '10s';

WITH expected(signature) AS (
  VALUES
    ('public.set_report_vote(uuid,boolean,text)'),
    ('public.get_my_report_ids(uuid[])'),
    ('public.get_my_reports(double precision,double precision,double precision,double precision,text[],text,integer)')
)
SELECT
  signature,
  to_regprocedure(signature) IS NOT NULL AS exists_in_database,
  CASE WHEN to_regprocedure(signature) IS NOT NULL
    THEN has_function_privilege('authenticated', to_regprocedure(signature), 'EXECUTE')
    ELSE false
  END AS authenticated_can_execute
FROM expected;

-- Mostra assinaturas existentes e nomes dos argumentos enviados pela API.
-- Não usa pg_get_functiondef nem valores padrão de argumentos.
SELECT
  p.oid::regprocedure::text AS installed_signature,
  p.proargnames AS argument_names,
  p.prosecdef AS security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE')
    AS authenticated_can_execute
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('set_report_vote', 'get_my_report_ids', 'get_my_reports')
ORDER BY p.proname, p.oid;

ROLLBACK;
