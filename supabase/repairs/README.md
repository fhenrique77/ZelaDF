# Reparo do fluxo de avisos e votos

**Aplicado no Supabase em 2026-09-13:** os quatro arquivos desta pasta foram ensaiados em transações revertidas e aplicados com autorização do proprietário. Não reaplicar. O patch antigo em `supabase/patches/` foi descontinuado e aborta sem alterar o banco.

| Arquivo | Resultado confirmado |
| --- | --- |
| `20260910_restore_report_flow.sql` | RPCs, autoria, votos/RLS; 19 avisos e 5 votos preservados; 13 contadores reconciliados. |
| `20260913_secure_report_photos.sql` | Pasta/proprietário, leitura/exclusão próprias, formatos de imagem e limite de 5 MiB. |
| `20260913_complete_report_contract.sql` | Validações, índices, status/histórico; FKs Auth validadas; nenhum operador provisionado. |
| `20260913_complete_account_contract.sql` | Fila privada de exclusão e limpeza de tokens; proprietário assumiu atendimento manual; push desativado. |

Backup lógico de reports/votes e metadados protegido em `.tools/backups/report-flow-20260913`, fora de Git/deploy. Restauração em PostgreSQL em memória e reparo na cópia passaram. Não inclui Auth, tokens reais ou arquivos Storage; a listagem do provedor não mostrou backups físicos disponíveis.

Os scripts `supabase/audit/*_smoke.sql` usam fixtures sintéticas e ROLLBACK. Testes reais de avisos/votos, status e fila/tokens passaram após a aplicação. Em Storage, a proteção gerenciada exige exclusão pela API; o ensaio verificou upload/leitura RLS e o predicado de exclusão sem remover arquivos. Não equivale aos 84 contratos pgTAP completos, concorrência entre conexões ou teste Android.

O procedimento abaixo documenta as pré-condições do primeiro reparo. A estrutura atual já mudou e suas guardas rejeitam reaplicação. Não usar `db push` nem marcar migrations antigas como aplicadas: os reparos incorporam apenas os contratos revisados, e `push_tokens` mantém diferenças históricas de colunas.

**Documentado — auditoria fornecida pelo usuário:** PostgreSQL 17.6; `reports`/`votes` com RLS ativo, policies públicas permissivas, índices históricos (incluindo unicidade por usuário/aviso), sem triggers de aplicação e sem schema `zeladf_private` ou as três RPCs. Tipos e constraints foram comparados com os SQLs históricos. Não é uma auditoria completa de Supabase/Auth/Storage.

## Arquivo pronto para revisão

`20260910_restore_report_flow.sql` é um reparo administrativo pontual para essa estrutura. Não é uma migration de baseline e não deve ser executado por `db push`. Foi aplicado após backup e ensaios.

O arquivo:

- trava `reports`/`votes` durante a transação e rejeita divergências de colunas, índices, constraints, policies, RLS ou presença de funções/triggers;
- cria `set_report_vote`, `get_my_report_ids` e `get_my_reports` usando os contratos locais de `20260905000100` e o trecho de avisos/votos de `20260905000200`;
- atribui autoria de novos avisos pela sessão, inicia contador em zero e limita campos públicos e mutações por papel/autor;
- preserva linhas de avisos e votos, inclusive votos anônimos antigos; recalcula `confirmations` conforme a quantidade real de votos e remove a unicidade por dispositivo, mantendo a unicidade por conta/aviso;
- não atribui autoria a avisos antigos sem autor nem recupera votos que nunca foram gravados;
- adiciona FKs Auth `NOT VALID` para proteger novas referências sem excluir histórico; auditoria de referências/autorias históricas continua pendente;
- não altera Storage, contas Auth, push, operadores ou histórico de migrations;
- solicita atualização do cache PostgREST no commit. Qualquer erro exige `ROLLBACK` na sessão antes de tentar outro comando; não execute trechos isolados.

As contagens antigas podem diminuir quando não correspondem a linhas em `votes`. Elas não são descartadas por um bug do reparo: a fonte canônica acordada é `votes`.

## Validação local

Executar na raiz:

```powershell
npm.cmd install --prefix .tools/sql-validation --no-audit --no-fund @electric-sql/pglite@0.3.14
node tests/reportFlowRepair.mjs
```

O teste usa PostgreSQL 17.5 embarcado em memória com estrutura histórica, contas sintéticas e função `auth.uid()` simulada. Cobre instalação do arquivo completo, preservação de histórico, autoria, RPCs, idempotência do voto, duas contas no mesmo dispositivo, contador, leitura privada, escrita proibida, exclusão por autor, rollback após falha tardia, divergência e reaplicação. Não substitui PostgREST/Auth reais, pgTAP completo, concorrência entre conexões ou teste Android. A dependência fica em `.tools/`, fora do aplicativo.

## Procedimento usado na aplicação

1. Confirmar projeto de destino, autorização explícita e backup recuperável; preferir validar primeiro em cópia isolada conforme `supabase/README.md`.
2. Executar o arquivo completo no SQL Editor como administrador, em horário compatível com o bloqueio curto das duas tabelas. Se qualquer guarda rejeitar o banco, parar e comparar novamente.
3. Executar `supabase/audit/report_flow_readiness.sql`: as três assinaturas e permissões precisam retornar `true`.
4. No app atualizado, abrir um aviso já publicado e confirmar manualmente, sem republicá-lo. O voto deve permanecer após atualização; clicar novamente deve removê-lo. Publicar um único aviso de teste e verificar confirmação inicial e presença em “Meus avisos”.
5. Validar que outra conta não edita/exclui o aviso e que “Meus avisos” não retorna avisos de outra conta.

Após a aplicação, não reaplicar as migrations antigas de voto/autorização: parte delas estará incorporada, mas Storage e outras evoluções ainda não. Capturar um novo baseline e reconciliar o histórico pelo procedimento de `supabase/README.md`; este reparo não marca migrations como aplicadas. Antes do commit, o rollback é transacional; após commit, não reabrir policies públicas como compensação. Usar correção futura ou restauração do backup conforme impacto revisado.
