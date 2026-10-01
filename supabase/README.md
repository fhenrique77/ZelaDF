# ZelaDF - Operação do Supabase

## Validação atual — 26/09/2026

**Confirmado por execução:** staging separado criado e inicializado com migrations até `20260926000400`, sem seed. As 118 assertions passaram via Management API e os fluxos Auth/Storage reais passaram com contas sintéticas. O wrapper `tests/run-staging-contracts.ps1` preserva todos os resultados; o comando oficial `supabase test db` continua pendente por ausência de Docker/Podman. CI isolado foi preparado.

PostgreSQL de produção e staging: 17; `config.toml` alinhado. As 21 funções cobertas no relatório principal têm fingerprints iguais nos dois ambientes; auditoria privada capturada. Isso não reconcilia integralmente constraints, grants, histórico ou backups. Novas migrations não foram promovidas para produção. O staging foi inicializado por SQL, sem registrar versões artificiais no histórico. Não executar `db push` em nenhum desses ambientes antes da reconciliação.

As quatro migrations `20260926000100` a `20260926000400` implementam e corrigem a limpeza transacional de fotos. A ordem deve ser preservada: correções encontradas em staging foram novas migrations, sem reescrever SQL aplicado. Documentação e execução: [validação](../docs/BACKEND_PRODUCAO.md).

## Estado deste baseline

As migrations anteriores a `20260904` foram reconstruídas a partir de `supabase-schema.sql`, `supabase-auth-migration.sql` e do contrato usado pelo frontend. Elas **não foram extraídas nem confirmadas no banco remoto**.

Em 2026-09-13, quatro reparos pontuais de `supabase/repairs/` foram aplicados ao projeto auditado e ensaiados com fixtures revertidas; ver STATUS.md. Isso não equivale a aplicar o histórico reconstruído deste diretório. A migration de comunidade foi aplicada em implantação coordenada e teve teste SQL pós-aplicação, segundo STATUS.md. Não execute `db push` antes de reconciliar o baseline real e o histórico remoto.

O baseline reproduz policies públicas inseguras para registrar fielmente o histórico conhecido. A migration `20260905000200` substitui localmente esse estado por RLS, grants por coluna, autoria derivada da sessão, FKs Auth e policies de Storage. Isso não confirma nem altera o ambiente remoto; auditoria, saneamento histórico e testes em staging continuam obrigatórios.

## Estrutura

```text
supabase/
|- config.toml             # stack local; sem project ref ou secrets
|- migrations/             # schema e evoluções em ordem
|- seed.sql                # somente dados demonstrativos locais
|- audit/
|  |- remote_schema_audit.sql          # metadados principais em uma grade
|  `- remote_private_schema_audit.sql  # tabelas privadas de comunidade
|- tests/database/         # contratos pgTAP
`- HISTORICAL_SQL.sha256   # integridade dos SQLs históricos da raiz
```

| Versão | Responsabilidade | Estado remoto |
| --- | --- | --- |
| `20260903000100` | tabelas, RLS histórica e índices básicos | Não verificado |
| `20260903000200` | autoria e identidade de voto | Não verificado |
| `20260903000300` | bucket e policy histórica de upload | Não verificado |
| `20260904000100` | índices de consulta por viewport | Documentado como não aplicado |
| `20260904000200` | constraints e policies de fotos | Documentado como não aplicado |
| `20260904000300` | saneamento irreversível da identidade pública | Documentado como não aplicado |
| `20260904000400` | tabela, constraints, RLS e reatribuição de tokens push | Documentado como não aplicado |
| `20260904000500` | operador interno, RPC, transições e histórico de status | Documentado como não aplicado |
| `20260905000100` | voto idempotente, contador transacional e bloqueio de escrita direta | Documentado como não aplicado |
| `20260905000200` | autorização de avisos/votos, FKs Auth, consultas de autoria e Storage por proprietário | Documentado como não aplicado |
| `20260905000300` | fila privada de solicitações de exclusão e RPC idempotente por sessão Auth | Somente local; não aplicada |
| `20260924000200` | job privado de execução da exclusão, bloqueio de escritas e RPCs administrativas de inventário/purga/conclusão | Somente local; não aplicada |
| `20260925000100` | evento push com payload mínimo e reivindicação única por histórico autorizado, exclusiva do serviço | Somente local; não aplicada |

`supabase-schema.sql` e `supabase-auth-migration.sql` continuam como referências históricas. Não execute esses arquivos em ambientes novos e não os edite silenciosamente; o fluxo novo usa somente `supabase/migrations/`.

## Pré-requisitos locais

- Supabase CLI compatível com `config.toml`;
- Docker Desktop ou runtime compatível em execução;
- portas `54320` a `54324` disponíveis;
- versão PostgreSQL remota confirmada antes da adoção. `config.toml` usa 17, conferido em produção e staging.

Em 2026-09-05, a CLI 2.116.0 ficou disponível via `npx.cmd --yes supabase@2`. Docker/runtime e PostgreSQL local continuam ausentes. A tentativa de `test db --local` retornou `ECONNREFUSED 127.0.0.1:54322`, sem executar os contratos. `projects list` retornou `LegacyPlatformAuthRequiredError`, confirmando ausência de sessão administrativa autenticada.

## Ambiente local

Os comandos devem ser executados na raiz do repositório:

```powershell
supabase start
supabase db reset --local
supabase test db --local
supabase stop
```

`db reset --local` é destrutivo apenas para o banco local: recria o schema pelas migrations e depois aplica `supabase/seed.sql`. Nunca acrescente `--linked` a esse comando para produção.

O seed contém somente os oito avisos demonstrativos, todos com zero confirmações porque não cria usuários nem votos. Não contém tokens ou dados remotos e não deve ser aplicado em produção.

## Auditoria do ambiente remoto

Antes de qualquer `db push`:

1. Confirme o projeto remoto e um backup utilizável, com data, escopo, retenção e teste de restauração em ambiente isolado. Guarde o backup em destino protegido fora do projeto; nunca em documentação ou logs. O backup do banco contém metadados de Storage, mas não os arquivos: preserve `report-photos` separadamente e valide a recuperação de uma foto. Referência: [backups Supabase](https://supabase.com/docs/guides/platform/backups).
2. Confirme o projeto/ambiente de destino e a versão do PostgreSQL.
3. Vincule a CLI sem registrar senha ou project ref no repositório:

```powershell
supabase link --project-ref <project-ref>
supabase migration list --linked
```

4. Execute `supabase/audit/remote_schema_audit.sql` com acesso somente-leitura e compare tabelas, colunas, constraints, índices, triggers, funções, policies e bucket com as migrations locais. A consulta retorna uma única grade `section`/`item` para exportação em CSV no SQL Editor; confira que a exportação inclui seções além de `rls`.

Execute o arquivo inteiro na mesma sessão: ele usa `REPEATABLE READ READ ONLY`, limites de espera e `ROLLBACK`. Salve os resultados completos somente em local protegido (`supabase/audit/results/` está excluído do Git e do deploy); a documentação deve conter apenas diferenças revisadas e resultados. A auditoria não lê linhas de contas/avisos/tokens. Funções, argumentos de triggers, defaults, índices, constraints e expressões de policies podem conter secrets: o relatório retorna fingerprints, não seu conteúdo. Um fingerprint diferente requer revisão semântica no ambiente administrativo; igualdade de fingerprint não substitui teste de RLS. Grants efetivos incluem herança e `PUBLIC`; um privilégio de tabela não substitui a avaliação das policies RLS.

Compare também `operator_users`, `report_status_history`, `zeladf_private`, as customizações de Storage, `convalidated`, `SECURITY DEFINER`, proprietário e `search_path`. Registre somente versões do histórico com `migration list`, evitando exportar a coluna de SQL executado, que pode conter valores sensíveis.
Para as quatro tabelas privadas de comunidade, execute também `supabase/audit/remote_private_schema_audit.sql` e exporte sua grade `section`/`item`; o relatório principal consulta as funções privadas, mas não essas tabelas.
5. Em uma cópia de trabalho descartável, capture o schema remoto oficial para comparação:

```powershell
supabase db pull remote-baseline --schema public
```

Não aceite alteração do histórico remoto durante esse pull antes de revisar o SQL gerado. Auth e Storage são schemas gerenciados; para este projeto, compare suas customizações pelo relatório de auditoria, não copiando dados ou secrets.

6. Se houver qualquer divergência, não execute `migration repair` nem `db push`. Registre a diferença e reconcilie o baseline reconstruído antes da adoção.
7. Somente se as três migrations reconstruídas forem equivalentes ao estado remoto, registre-as como já aplicadas:

```powershell
supabase migration repair 20260903000100 20260903000200 20260903000300 --status applied --linked
```

`migration repair` altera apenas o histórico de migrations, não executa o SQL. Mesmo assim, é uma mudança remota e exige aprovação explícita, backup e evidência da comparação.

## Promoção por ambiente

### Desenvolvimento local

Use `db reset --local`. O seed é permitido. Falhas podem ser corrigidas criando uma migration nova; migrations compartilhadas não devem ser reescritas.

### Staging

Depois da auditoria e do alinhamento do histórico:

```powershell
supabase migration list --linked
supabase db push --dry-run --linked
supabase db push --linked
supabase test db --linked
```

Use um projeto separado e backup. Seed demonstrativo só pode ser incluído deliberadamente em um ambiente descartável, nunca por padrão.

### Produção

Promova exatamente as migrations validadas em staging. Antes de aplicar: backup testado, janela de mudança, `migration list`, `db push --dry-run` e plano de compensação. Não use `db reset --linked` e não use `--include-seed`.

## Rollback

- Local: corrija a migration ainda não compartilhada ou use `db reset --local` para reconstruir o banco descartável.
- Staging/produção: não edite uma migration já aplicada e não apague manualmente o histórico. Crie uma migration compensatória quando a reversão for segura.
- Mudança destrutiva ou incompatível: interrompa a promoção e restaure o backup conforme o procedimento do ambiente.
- Storage: remova arquivos somente pela Storage API. SQL de rollback pode restaurar configuração/policies, mas não recupera objetos já excluídos.
- Identidade pública: `20260904000300` remove valores derivados de contas. Uma migration compensatória pode retirar constraint/default se necessário, mas nunca deve restaurar nomes, e-mails ou telefones apagados.
- Push: desative cliente, função e webhook antes de compensar `20260925000100` por uma migration nova que remova trigger, RPC e tabelas de evento/reivindicação. `20260904000400` pode então ser compensada removendo trigger, função e tabela de tokens; essa exclusão elimina inscrições e exige novo opt-in.
- Status: antes de compensar `20260904000500`, remover/desativar os controles do frontend e o webhook. Remover histórico é destrutivo; exporte-o somente se houver base legal e necessidade operacional.
- Votos atômicos: antes de compensar `20260905000100`, interromper novas confirmações e reconciliar `reports.confirmations` com `votes`. Reabrir DML direto ou restaurar unicidade por dispositivo pode reintroduzir fraude, conflitos entre contas e divergência de contagem.
- Autorização: antes de compensar `20260905000200`, interromper escrita cliente e revisar dependências das RPCs, pastas de foto e grants por coluna. Restaurar policies públicas reintroduz falsificação de autoria e mutação de terceiros; prefira uma migration corretiva em vez de reabrir acesso.

Cada migration futura deve documentar pré-condições, impacto em RLS/Storage, estratégia de rollout e reversão. Alterações do Dashboard devem ser capturadas em migration antes de serem promovidas.

## Ativação da autorização/RLS

`20260905000200` define a matriz local: visitante lê campos públicos; conta autenticada cria e vota; autor edita campos permitidos e exclui o próprio aviso; operador altera apenas status pela RPC. O trigger ignora autoria enviada pelo cliente, e `author_id`/`user_id` não recebem `SELECT` dos papéis cliente.

As FKs para `auth.users` usam `NOT VALID`: PostgreSQL verifica novas referências, mas não certifica linhas antigas até uma validação explícita. Antes de staging:

1. Auditar policies e grants atuais de `reports`, `votes` e `storage.objects`; qualquer policy permissiva adicional pode ampliar acesso por `OR`.
2. Contar referências Auth nulas, órfãs e anônimas sem registrar IDs ou dados pessoais em relatórios.
3. Definir tratamento dos avisos/votos históricos órfãos; não apagar nem reatribuir automaticamente.
4. Aplicar frontend e migrations em janela coordenada, pois clientes antigos enviam campos internos e usam caminhos de foto sem pasta de conta.
5. Executar `db reset` e os 68 casos pgTAP; depois repetir criação, edição, exclusão, voto e Storage com duas contas reais em staging.

O contrato agora insere histórico, token sintético e metadados de foto de outra conta antes de verificar leituras proibidas. Isso evita resultados aparentemente corretos causados por tabelas vazias. São 68 assertions planejadas, ainda não executadas em PostgreSQL. Fixtures em `storage.objects` verificam RLS no banco, mas não substituem uploads/remoções pela Storage API, validação de MIME/tamanho, acesso público à foto e limpeza de arquivos reais.
6. Somente após saneamento, validar `reports_author_id_fkey` e `votes_user_id_fkey` por uma nova migration, sem reescrever esta.

## Ativação dos votos atômicos

`20260905000100` reconcilia todos os contadores com as linhas existentes de `votes`; portanto, seu impacto nos dados deve ser medido antes da aplicação. Ela remove a unicidade histórica por dispositivo, mantém um voto por conta/aviso, bloqueia DML direto dos papéis cliente e expõe somente `set_report_vote` para mutação autenticada.

Antes de produção:

1. Auditar linhas anônimas, duplicadas ou órfãs sem reproduzir identificadores em relatórios.
2. Comparar a contagem atual de cada aviso com `count(*)` em `votes` e registrar apenas totais agregados.
3. Aplicar em staging e executar o pgTAP, incluindo repetição de confirmar/remover.
4. Executar concorrência real com sessões distintas no mesmo aviso e confirmar voto único e contador correto.
5. Validar criação de aviso, voto, troca de conta no mesmo aparelho e exclusão em cascata.
6. Promover frontend e migration em uma janela coordenada; versões antigas do cliente não conseguem mais escrever diretamente em `votes`.

## Ativação futura do push

O push está desativado por padrão e não foi alterado remotamente. Antes de ativar:

1. Auditar o schema remoto, aplicar a migration em staging e executar os testes de RLS.
2. Configurar no servidor somente as variáveis `PUSH_ENABLED`, `PUSH_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` e `FIREBASE_SERVICE_ACCOUNT`.
3. Após aplicar/testar `20260925000100`, configurar um único webhook de `INSERT` em `public.push_status_events` para `POST /api/send-push`, com o mesmo segredo, sem versionar seu valor. O trigger grava nessa tabela somente o ID de um histórico confirmado; motivo e operador não entram no payload. Desabilitar qualquer webhook legado de `UPDATE public.reports`. O payload deve conter `type: INSERT`, `table: push_status_events` e `record.id` UUID. A função rejeita payload sem ID válido e só envia quando a RPC exclusiva de `service_role` reivindica o evento.
4. Implementar uma ação explícita de opt-in na interface Android e somente então habilitar `VITE_PUSH_ENABLED`.
5. Validar registro, refresh, logout, troca de conta, token inválido e recebimento em primeiro/segundo plano num aparelho.
6. Só depois habilitar `PUSH_ENABLED` no ambiente que receberá o webhook.

A reivindicação é feita antes do envio FCM e impede duas entregas para o mesmo ID mesmo com webhooks repetidos; se o processo falhar depois da reivindicação, a notificação pode se perder. Confirmar que o produto aceita entrega de melhor esforço antes da ativação. A tabela privada deve seguir sem grants cliente. Reverter a função para a versão antiga exige desabilitar primeiro o webhook de histórico; não ativar dois consumidores para o mesmo evento.

## Solicitações de exclusão da conta

A fila `account_deletion_requests` pertence ao processo de privacidade, não ao papel de operador de avisos. A RPC recebe zero argumentos e deriva autoria da sessão; leitura cliente é limitada por coluna/RLS e a fila é removida com a conta Auth. Repetir a solicitação não altera protocolo/data. O arquivo `account_deletion_test.sql` acrescenta 16 contratos aos 68 existentes, totalizando 84 assertions pgTAP ainda não executadas. Não ativar o formulário remotamente antes de validar a migration, o atendimento responsável e a recuperação de acesso descritos em `PRIVACY.md`.

O módulo 7 acrescenta `account_deletion_execution_test.sql` com 19 contratos de privilégios, bloqueio de escritas, isolamento, purga e conclusão, totalizando 103 assertions pgTAP ainda não executadas. Ele depende das migrations de comunidade e criação idempotente, além da fila original. O ensaio SQL não substitui a exclusão física pela Storage API nem o Auth Admin API em staging. Depois de iniciar um job, preserve a migration e retome/investigue a operação; não remova a trava como rollback.

## Provisionamento de operadores

`operator_users` representa somente a equipe interna do ZelaDF. A migration não cria operador inicial e o frontend não pode atribuir ou revogar o papel.

Depois de auditar e aplicar a migration em staging, um administrador autorizado pode inserir o ID Auth validado em `operator_users` por um canal privilegiado. Não use metadados editáveis pelo usuário, não exponha `service_role` no cliente e não registre IDs reais neste documento. A remoção da linha revoga o papel na próxima consulta da aplicação.

Antes de produção, testar pelo menos:

1. Visitante e usuário comum não conseguem mudar status nem ler histórico.
2. Operador só executa as transições documentadas, sempre com motivo válido.
3. Mudança e histórico são confirmados ou revertidos juntos.
4. Aviso novo sempre começa aberto.
5. Exclusão do aviso remove o histórico e exclusão do operador anonimiza o ator.
6. O webhook ignora updates comuns e aceita somente transições válidas.
