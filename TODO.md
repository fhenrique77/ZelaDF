# ZelaDF — Próximas tarefas

Revisão atual: 2026-10-01. Os detalhes antigos abaixo são históricos; o estado remoto atual está em STATUS.md.

- [x] Manter o frontend Vite independente na raiz, com metadados e `robots.txt` estáticos; validar build, navegador desktop/mobile e sincronização Android.
- [x] Repetir auditoria somente leitura do banco de produção e 118 contratos SQL em staging em 01/10; registrar diferenças e objetos ausentes sem alterar produção.
- [ ] Provisionar destino protegido fora do repositório e ambiente isolado para backup/restauração completa de banco, Auth e Storage; proprietário informou em 01/10 que ainda não dispõe deles.

Verificação de 30/09: checks web/Python, APK debug e JVM passaram; os dois timeouts Playwright da execução integral passaram isolados. Ensaio integrado de staging repetido com 66 verificações aprovadas. Auditoria somente leitura atualizada; produção sem mudança de metadados desde 26/09, mas sem backup físico listado e com PITR desligado. O comando oficial pgTAP continua impedido pela ausência de Docker/Podman.


**Segurança do site (30/09):** [avaliação e evidências](docs/SEGURANCA_SITE_2026-09-30.md).

- [x] Configurar `frame-ancestors 'none'`, `X-Frame-Options: DENY` e ensaiar iframe no build web local (quatro páginas HTML).
- [x] Configurar CSP e cabeçalhos complementares; ensaio local do build e fluxos desktop/mobile aprovados.
- [x] Atualizar `firebase-admin` e dependências transitivas: `pnpm audit --prod` sem advisories, typechecks e testes locais aprovados.
- [x] Publicar o projeto web com `vercel.json`; conferir cabeçalhos, mapa, leitura pública e bloqueio de iframe no alias de produção.
- [ ] Validar login autenticado e fluxo de fotos no site de produção com conta de teste controlada; não executar mutações em contas reais.
- [ ] Antes de promover migrations do backend ao Supabase de produção, obter backup completo restaurável e reconciliar schema/histórico conforme `supabase/README.md`.
- [ ] Validar a versão Android instalada em aparelho, inclusive mapa, login e fotos, antes de distribuir nova versão; ativação de push ainda segue seus portões próprios.

## Avanço confirmado em 26/09

- [x] Criar staging Supabase isolado no plano Free e inicializar o schema sem dados de produção.
- [x] Executar 118 assertions SQL com rollback e ensaio de 66 verificações Auth/Storage/RLS pela API local e hospedada.
- [x] Implementar e ensaiar worker de fotos órfãs, reserva atômica, retomada e preservação de fotos recentes/vinculadas.
- [x] Corrigir retry de upload para 400 Duplicate observado no Storage real.
- [x] Publicar API de staging; validar CORS e medir leituras públicas (p95 700 ms em 20 amostras, staging vazio).
- [x] Ampliar navegador para GPS permitido/indisponível, perda de rede e troca de foto; sincronizar Android, compilar APK debug e passar três testes JVM.
- [x] Publicar atualização web de produção com flags FastAPI/push desligadas.
- [x] Preparar CI web/Python/PostgreSQL isolado; execução GitHub ainda pendente.
- [ ] Executar `supabase test db` em ambiente com Docker/Podman: assertions diretas passaram, mas não substituem esse portão do AGENTS.md.
- [ ] Concluir backup completo/restauração e reconciliação do histórico/schema antes de promover migrations do backend.
- [x] Revisar a mudança de fingerprint de `guard_photo_cleanup` em staging: corpo atual igual ao da migration final `20260926000400`.
- [ ] Definir responsável/contato e operação de privacidade/moderação; proprietário confirmou que ainda não existem.
- [ ] Obter aparelho e Play Console, assinatura/AAB e validar OAuth/fluxos nativos.
- [ ] Medir adoção e carga representativa antes do encerramento do módulo 9. Push depende de decisão própria.

Pendências consolidadas: [docs/BACKEND_PRODUCAO.md](docs/BACKEND_PRODUCAO.md). Os itens de módulos abaixo preservam critérios amplos: a parte de staging avançou conforme este quadro; validação nativa e operação continuam abertas.

- [x] Revisar e publicar a atualização web em 25/09, mantendo flags FastAPI/push desligadas; validar build remoto, domínio, páginas públicas, mapa/leitura e login desktop/mobile. Deployment `dpl_3afUR2huPchuiowq29beH1kNZs6x`; backend Python e migrations continuam sujeitos aos portões abaixo.

- [ ] Reconciliar integralmente schema, grants, RLS, tabelas privadas e histórico de migrations de produção; obter backup completo restaurável antes de promover as migrations do backend.
- [x] Implementar localmente a fundação FastAPI necessária e as quatro leituras do módulo 2, com testes e flag web desligada.
- [x] Implementar localmente o módulo 3: consulta própria e solicitação idempotente de exclusão via FastAPI, com testes e flag desligada.
- [x] Implementar localmente o módulo 4: CRUD de avisos, integração de fotos, criação idempotente e flag web desligada.
- [x] Implementar localmente o módulo 5: voto e desfazer por FastAPI/RPC, resposta canônica, testes e flag própria desligada.
- [x] Implementar localmente o módulo 6: termos, denúncias, bloqueios, consulta de operador/histórico e mudança de status por FastAPI, com flag própria desligada.
- [x] Implementar localmente o módulo 7: executor administrativo retomável, trava de escritas, remoção de fotos por Storage API, purga transacional e verificação Auth/banco/Storage antes da conclusão.
- [x] Preparar localmente o módulo 9: rótulo agregado de build nos pedidos FastAPI, log sanitizado por rota e roteiro de corte/rollback em `docs/BACKEND_PRODUCAO.md`.
- [ ] Encerrar o módulo 9 após staging e observação: validar adoção por operação/versão Android nos logs agregados da API e Data API, definir suporte a instalações antigas, testar aparelho/carga/restauração, assumir custos/operação e só então retirar código legado. Manter RLS/RPCs/grants até decisão separada.
- [ ] Validar módulos 1/2 em staging com duas contas, bloqueios/ocultação, CORS web/Android, p95 e preview Vercel; somente então decidir a ativação da flag e o rollback dos clientes instalados.
- [ ] Validar módulo 3 em staging com duas contas, repetição do protocolo, sessão expirada, falhas da RPC, CORS e fluxo web/Android; definir atendimento operacional antes da ativação.
- [ ] Auditar e aplicar em staging a migration de idempotência/fila do módulo 4 após comparar o schema real; testar RLS/Auth/Storage com duas contas, repetição, substituição e exclusão de fotos, limites e Android. Executor da fila/varredura implementado e ensaiado em 26/09; operação de produção ainda por definir.
- [ ] Validar módulo 5 em staging com duas contas, concorrência real, avisos ocultos/bloqueados, falha após commit, rollback visual e contador comparado com `votes`; ensaiar web/Android antes de ligar a flag.
- [ ] Validar módulo 6 em staging com cidadão, autor, bloqueado, operador e visitante; testar aceite ausente, denúncia repetida, limites, histórico privado, transição e motivo de status, ocultação e limpeza de foto. Definir operação humana de moderação e ensaiar web/Android antes de ligar a flag.
- [ ] Validar módulo 7 em banco isolado e staging: comparar schema/FKs/Storage, aplicar migration controlada, duas contas, corrida com novas escritas, falha e retomada em cada etapa, foto órfã e externa, logout/refresh web/Android e segunda execução. Definir responsável, verificação humana, recuperação de acesso, canal, prazo e retenção do comprovante antes de executar com pedidos reais.

- [x] Auditar o Supabase autenticado, salvar/restaurar backup lógico de avisos/votos e aplicar os quatro reparos de supabase/repairs.
- [x] Corrigir no banco BUG-004/005, RLS de fotos, validações/status e fila de exclusão/limpeza de tokens; testar com fixtures revertidas.
- [x] Descontinuar o patch inseguro; corrigir OTP, falhas Google, carregamento parcial e estabilidade da lista mobile.
- [x] Atualizar build web, sincronizar Capacitor e compilar APK debug; repetir validação local em 13/09/2026.
- [ ] Validar os fluxos no Android instalado, Storage API e atendimento manual de exclusão.
- [x] Implementar termos/aceite, denúncia de conteúdo/usuário, bloqueio e moderação no código local.
- [x] Implantar comunidade e frontend coordenadamente; verificar SQL pós-aplicação, URLs HTTP 200 e push desativado com 503.
- [ ] Definir responsável e operação contínua de moderação antes da Play Store.
- [x] Preparar imagem de destaque, capturas e textos da loja.
- [ ] Finalizar responsável, e-mail operacional, rotina de moderação, assinatura e configuração da Play Console; proprietário informou em 13/09/2026 que ainda não possui os dados/conta solicitados.
- [ ] Verificar a revogação da chave Firebase iniciada em `5603b52e`: proprietário informou conclusão, sem confirmação administrativa independente. Manter push desativado; nova credencial somente quando necessária para ativação.
- [ ] Preparar backup operacional completo e reconciliar o baseline remoto antes de qualquer db push; não reaplicar migrations incorporadas pelos reparos.

# Prioridade crítica

## 1. Auditar e rotacionar a credencial sensível

**Status:** contenção local concluída em 2026-09-05. O arquivo foi removido sem leitura do conteúdo, os ignores foram confirmados e a aplicação usa somente um secret de servidor. Revogação/rotação e auditoria histórica continuam pendentes externamente.

**Problema:** um arquivo de service account Firebase com chave privada esteve presente na raiz. A cópia local foi removida, mas a exposição anterior e a validade da chave ainda não puderam ser determinadas.

**Impacto:** uma chave exposta pode permitir acesso administrativo ao Firebase.

**Objetivo:** eliminar a credencial do projeto e invalidar qualquer cópia potencialmente exposta.

**Arquivos provavelmente envolvidos:** `.gitignore`, `.vercelignore` e configuração externa do Firebase/Vercel; o arquivo de credencial já foi removido.

**Dependências:** acesso administrativo ao Firebase e, quando houver, ao histórico Git.

**Critérios de conclusão:**

- [ ] Confirmar se a chave foi versionada ou compartilhada.
- [ ] Rotacionar/revogar a chave no Firebase.
- [x] Remover o arquivo do projeto sem reproduzir seu conteúdo.
- [x] Bloquear o padrão apropriado no `.gitignore` e `.vercelignore`.
- [x] Manter o contrato local somente em `FIREBASE_SERVICE_ACCOUNT` no servidor; a Vercel lista esse nome como secret oculto em Preview e Production.
- [ ] Após a rotação, substituir o secret da Vercel pela nova credencial e validar o envio mantendo `PUSH_ENABLED` ausente até o fluxo estar pronto.
- [x] Verificar padrões de credenciais no código, documentos e assets disponíveis sem imprimir valores: nenhuma ocorrência nos 121 arquivos inspecionados; detalhes e exclusões em `PLAY_STORE.md`.
- [x] Bloquear a inicialização automática FCM/Analytics no manifesto Android e testar o bloqueio local de push no cliente/servidor.
- [ ] Inspecionar o AAB final, manifesto mesclado e logs remotos; validar instalação limpa e atualização de uma instalação anteriormente registrada no FCM.
- [x] Investigar o HTTP 500 observado em `/api/send-push` na produção antes de habilitar o serviço; o handler local e a produção desativada retornam 503, conferidos em 26/09.

**Bloqueios externos:** esta cópia não contém `.git`, então o histórico precisa ser auditado no repositório original. Firebase CLI/Google Cloud CLI e acesso administrativo não estão disponíveis neste ambiente, impedindo revogar ou rotacionar a chave. O valor do secret da Vercel não foi inspecionado e sua rotação não pode ser presumida.

**Risco da alteração:** alto.

# Prioridade alta

**Preparação de Banco e autorização para a Play Store (2026-09-05):** auditoria somente leitura ampliada e 68 contratos pgTAP reforçados; 107 testes Vitest aprovados. A CLI Supabase está disponível, mas não há sessão administrativa autenticada nem banco local/Docker para executar o pgTAP. Backup, comparação remota, aplicação isolada, validação dos papéis e promoção continuam pendentes conforme `PLAY_STORE.md`. Nenhuma migration foi alterada ou aplicada nesta etapa.

## 2. Definir e implementar o modelo de autorização/RLS

**Status:** concluído no código local em 2026-09-05. A migration define a matriz de papéis, autoria derivada de `auth.uid()`, privilégios por coluna, RLS de avisos/votos, FKs Auth para novas escritas e policies de Storage. Auditoria histórica, validação das FKs, execução do pgTAP e aplicação remota continuam pendentes.

**Problema:** os SQLs permitem escrita pública e não vinculam autoria a `auth.uid()`.

**Impacto:** chamadas diretas ao Supabase podem contornar os controles da interface.

**Objetivo:** fazer o banco garantir leitura pública somente onde desejado e escrita restrita ao ator correto.

**Arquivos envolvidos:** `supabase/migrations/20260905000200_secure_reports_votes_and_storage.sql`, `src/lib/reportService.ts`, `src/App.tsx`, testes e documentação. `supabase-schema.sql` e `supabase-auth-migration.sql` permaneceram inalterados como referências históricas.

**Dependências restantes:** auditoria do estado real do Supabase, saneamento de referências Auth históricas e validação em stack local/staging. O contrato adotado mantém contribuição somente autenticada e limita operador interno ao ciclo de status.

**Critérios de conclusão:**

- [x] Definir visitante como leitor de campos públicos; autenticado como criador/votante; autor como editor/exclusor do próprio conteúdo; operador como responsável apenas pelo status/histórico.
- [x] Adicionar FKs `reports.author_id` e `votes.user_id` para `auth.users`, com cascade e `NOT VALID` para não aceitar referências novas inválidas sem apagar ou presumir dados históricos.
- [x] Atribuir autoria no banco e proteger insert/update/delete de `reports` com policies e privilégios de coluna explícitos.
- [x] Restringir `votes` à leitura do próprio `report_id` e mutações somente pela RPC autenticada.
- [x] Restringir upload ao diretório da conta e leitura/remoção de metadados ao proprietário no Storage.
- [x] Versionar 68 casos pgTAP permitidos e proibidos para visitante, autenticado, autor, operador, votos e Storage.
- [ ] Auditar referências históricas, validar as duas FKs e executar `db reset`/pgTAP em ambiente isolado antes de aplicar remotamente.

**Risco da alteração:** alto.

## 3. Tornar votos e confirmações atômicos

**Status:** concluído no código local com RPC idempotente, contador protegido por triggers, reconciliação inicial e rollback/recarregamento na interface. A migration não foi aplicada remotamente e o teste concorrente real ainda depende de PostgreSQL local/staging.

**Problema original:** o cliente executava insert/delete, count e update em operações separadas.

**Impacto:** concorrência, falhas intermediárias e fraude podem divergir `votes` de `confirmations`.

**Objetivo:** centralizar a operação no banco e impedir escrita arbitrária do contador.

**Arquivos envolvidos:** `supabase/migrations/20260905000100_make_votes_atomic.sql`, `src/lib/reportService.ts`, `src/App.tsx`, `src/ReportDetail.tsx`, testes e documentação.

**Dependências restantes:** auditoria/aplicação remota e conclusão da FK/RLS geral na tarefa 2.

**Critérios de conclusão:**

- [x] Definir `votes` como fonte canônica e `reports.confirmations` como contador materializado.
- [x] Implementar `set_report_vote` idempotente, autenticada e serializada por aviso.
- [x] Atualizar o contador por trigger na mesma transação do voto.
- [x] Impedir mutação direta de `votes` e alteração direta de `confirmations` para papéis cliente.
- [x] Reconciliar resposta do banco, bloquear cliques simultâneos e fazer rollback/reload no frontend.
- [x] Invalidar consultas anteriores ao voto, adiar novas leituras enquanto houver votos pendentes e recarregar os filtros atuais ao terminar; regressões cobertas com React/DOM.
- [x] Cobrir duplicação, remoção repetida, resposta inválida e lock/trigger nos contratos versionados.
- [ ] Executar pgTAP e teste concorrente com sessões reais após disponibilizar Supabase local ou staging.

**Risco da alteração:** alto.

## 4. Definir ciclo de status e papel operacional

**Status:** concluído no código local com operador interno, RPC, transições, motivo obrigatório, histórico e controles na tela de detalhe. Nenhum operador foi provisionado e a migration não foi aplicada remotamente.

**Problema original:** a aplicação exibia três status sem ator, transições, histórico ou operação autorizada.

**Impacto:** não há processo confiável de andamento, resolução ou auditoria; push não tem origem definida.

**Objetivo:** estabelecer atores, transições e histórico antes de implementar operação real.

**Arquivos envolvidos:** `src/lib/reportStatus.ts`, `src/lib/reportService.ts`, `src/App.tsx`, `src/ReportDetail.tsx`, `api/send-push.ts`, `supabase/migrations/20260904000500_create_status_workflow.sql`, testes e documentação.

**Dependências:** confirmação de negócio sobre a operação interna e as transições. Qualquer parceria futura com órgãos deve ser tratada como decisão separada.

**Critérios de conclusão:**

- [x] Reservar mudança de status ao papel interno `operator_users`, sem atribuição automática e sem representar órgão público.
- [x] Definir transições: aberto → andamento/resolvido; andamento → aberto/resolvido; resolvido → aberto.
- [x] Exigir motivo de 10 a 500 caracteres para qualquer mudança, inclusive resolução e reabertura.
- [x] Registrar status anterior/novo, motivo, ator e timestamp na mesma transação.
- [x] Bloquear status inicial diferente de aberto e mudanças diretas sem operador/RPC.
- [x] Exibir controle e histórico somente quando o banco confirmar o papel atual.
- [x] Vincular o histórico ao aviso e à sessão atuais, descartando respostas/erros antigos ao trocar de aviso, fechar o painel ou sair da conta.
- [x] Fazer a função de push aceitar somente transições do ciclo definido.
- [ ] Confirmar com o responsável pelo produto se o papel interno e as transições adotadas correspondem ao processo real.
- [ ] Auditar e aplicar a migration em staging; provisionar operadores por processo administrativo protegido.
- [ ] Executar o contrato pgTAP com operador, não operador e visitante no Supabase local/staging.

**Risco da alteração:** alto.

## 5. Concluir ou desativar o fluxo de push

**Status:** fluxo preparado e desativado por padrão no código local. O ciclo autorizado de status agora possui origem definida; a ativação continua bloqueada até migrations, webhook, secrets, opt-in e teste em aparelho.

**Problema original:** cliente e função existiam sem tabela, policies, flags de ativação ou ciclo seguro de token. A infraestrutura local foi preparada, mas webhook, ambientes remotos e aparelho continuam não verificados.

**Impacto:** notificações podem falhar, ser acionadas sem proteção ou associar token ao usuário incorreto.

**Objetivo:** disponibilizar um fluxo completo e seguro, ou mantê-lo inativo até isso ser possível.

**Arquivos envolvidos:** `src/lib/push.ts`, `src/auth/AuthProvider.tsx`, `api/send-push.ts`, `supabase/migrations/20260904000400_create_push_tokens.sql`, `.env.example`, testes e documentação.

**Dependências:** tarefa 2 e aplicação da tarefa 4; acesso Supabase, Vercel, Firebase e aparelho Android.

**Critérios de conclusão:**

- [x] Criar migration local de `push_tokens` com FK, constraints, grants mínimos, RLS por usuário e reatribuição do token entre contas.
- [x] Tornar autenticação do webhook obrigatória e validar o formato básico do payload no código local.
- [x] Documentar somente os nomes das variáveis de servidor, sem valores ou credenciais.
- [x] Remover o token antes do logout, invalidar o registro nativo e permitir reatribuição segura no próximo registro de outra conta.
- [x] Remover no servidor tokens que o FCM classifica como inválidos ou não registrados, sem registrar seus valores.
- [x] Manter cliente e função desativados por padrão por flags separadas; remover o registro automático no login.
- [x] Preparar webhook por ID de histórico e reivindicação atômica persistida para não reenviar duplicatas; função Vercel mantida como único consumidor. Migration apenas local.
- [ ] Confirmar com o produto a ativação e a aceitação de entrega de melhor esforço (falha após reivindicação pode perder uma notificação).
- [ ] Testar `claim_push_status_event` em PostgreSQL isolado, incluindo privilégios, duplicação concorrente e evento inexistente/status superado.
- [ ] Auditar o schema remoto e aplicar/testar a migration primeiro em ambiente isolado.
- [ ] Configurar e testar webhook, `PUSH_SECRET`, service role e Firebase nos ambientes externos.
- [ ] Criar uma ação explícita de opt-in na interface antes de definir `VITE_PUSH_ENABLED=true`.
- [ ] Validar permissões e notificações Android em aparelho.

**Risco da alteração:** alto.

## 6. Revisar privacidade e exposição de dados

**Status:** concluído no código e na documentação local. A prontidão de produção ainda depende de validação jurídica/administrativa, auditoria dos provedores, aplicação controlada da migration e implementação da exclusão automática de conta.

**Problema original:** autor podia ser exibido pelo telefone, a política omitia provedores e não havia fluxo técnico de exclusão/retenção documentado.

**Impacto:** risco LGPD, exposição pessoal e expectativa incorreta do usuário.

**Objetivo:** minimizar dados públicos e alinhar código, política e operação.

**Arquivos envolvidos:** `src/lib/privacy.ts`, `src/auth/AuthProvider.tsx`, `src/App.tsx`, `src/NewReportForm.tsx`, `src/ReportDetail.tsx`, `src/lib/reportService.ts`, `public/privacy.html`, `PRIVACY.md` e `supabase/migrations/20260904000300_minimize_public_author_identity.sql`.

**Dependências:** decisões de negócio/jurídicas e políticas do Supabase.

**Critérios de conclusão:**

- [x] Definir `Cidadão` como única identidade pública e impedir telefone/e-mail/nome de conta na consulta e exibição geral.
- [x] Documentar Supabase, Nominatim, OpenStreetMap, Google, Firebase, Vercel e Unsplash conforme o uso atual.
- [x] Definir retenção e o fluxo técnico de exclusão de conta, avisos, fotos, votos e tokens em `PRIVACY.md`.
- [x] Disponibilizar a política no cabeçalho, autenticação e publicação.
- [x] Tornar geocodificação uma ação explícita, preservar preenchimento manual e informar a publicidade da localização antes do envio.
- [x] Implementar localmente solicitação de exclusão no app/web, confirmação, protocolo persistido e tratamento de erro/troca de conta; adicionar migration/RLS e contratos SQL sem alterar o banco remoto.

**Pendências externas e operacionais:**

- [ ] Confirmar controlador, encarregado/canal, domínio, bases legais e prazos com responsáveis pelo produto e jurídico.
- [ ] Auditar retenção, região, logs, backups e contratos nos ambientes dos provedores.
- [ ] Aplicar e verificar a migration de saneamento somente após auditoria do baseline remoto.
- [x] Implementar localmente a execução administrativa da exclusão de conta e cleanup de tokens push; ensaio real pendente. Exportação de dados continua tarefa separada.
- [ ] Aplicar e validar `20260905000300` em staging, executar seus 16 contratos pgTAP e testar o fluxo de solicitação com Auth/PostgREST reais.
- [ ] Nomear responsável pela fila, confirmar canal para recuperação de acesso e testar o atendimento completo antes de habilitar o novo fluxo em produção.

**Risco da alteração:** alto.

# Prioridade média

## 7. Adotar migrations reproduzíveis

**Status:** parcialmente concluído e validado estaticamente; estrutura e operação local estão preparadas, mas o baseline remoto real ainda precisa ser capturado e comparado antes de qualquer adoção.

**Problema original:** índices e validação tinham migrations, mas baseline, autenticação e Storage dependiam de SQLs/passos manuais. A estrutura local e a RLS principal foram versionadas; auditoria/aplicação remota, push/webhook e equivalência entre ambientes continuam pendentes.

**Impacto:** ambientes podem divergir e mudanças ficam sem ordem/auditoria confiável.

**Objetivo:** versionar evolução de schema, RLS, funções, triggers e seed separadamente.

**Arquivos provavelmente envolvidos:** `supabase/migrations/`, SQLs históricos e documentação de ambiente.

**Dependências:** auditoria do estado remoto e desenho das tarefas 2 a 5.

**Critérios de conclusão:**

- [ ] Capturar e comparar o baseline remoto real sem expor dados; a auditoria somente-leitura cobre schema, constraints, índices, RLS, grants, triggers, funções, extensões e Storage.
- [x] Separar schema, migrations e seed de demonstração.
- [x] Não reescrever silenciosamente SQL histórico já aplicado; os arquivos da raiz permanecem como referência imutável.
- [x] Documentar aplicação, promoção e rollback por ambiente sem incluir credenciais.

**Risco da alteração:** alto.

## 8. Melhorar erros, validação e ciclo das fotos

**Status:** corrigido e validado no código local em 2026-09-05. A edição reinicia ao trocar de aviso/conta e a exclusão exige a linha retornada pelo banco antes de limpar sua foto. Ativação das constraints e policies depende de auditoria e aplicação controlada da migration no Supabase remoto.

**Problema original:** operações falhavam silenciosamente, demos mascaravam erro, uploads tinham validação limitada e fotos não eram removidas.

**Impacto:** inconsistência, conteúdo inválido, storage órfão e feedback enganoso.

**Objetivo:** tornar falhas visíveis e proteger entradas/arquivos em todas as camadas.

**Arquivos provavelmente envolvidos:** `src/App.tsx`, formulários, `src/lib/reportService.ts`, Storage policies e migrations.

**Dependências:** RLS e definição de limites de produto.

**Observação operacional:** `supabase/migrations/20260904000200_add_report_validation_and_photo_policies.sql` exige que o bucket `report-photos` já exista. Ela deve ser auditada junto às policies atuais, pois policies permissivas adicionais são combinadas por `OR`.

**Critérios de conclusão:**

- [x] Diferenciar modo demo de falha de produção.
- [x] Mostrar erro e preservar o formulário quando criação falhar.
- [x] Implementar rollback de voto.
- [x] Validar tamanho, MIME, texto e coordenadas no cliente, serviço e migration local.
- [x] Remover fotos substituídas ou pertencentes a avisos excluídos pelo Storage API.
- [x] Reiniciar edição e confirmação de exclusão ao trocar de aviso/conta, liberar previews e iniciar cada edição com os dados atuais.
- [x] Tratar exclusão sem linha retornada como falha; limpar somente a foto da linha efetivamente excluída, sem usar uma URL antiga da interface.

**Risco da alteração:** médio.

## 9. Validar Android e substituir testes de scaffold

**Status:** preparação local validada em 2026-09-08: JDK 21, SDK 36, APK de debug e APK de testes compilados; 3 testes JVM e 128 testes Vitest aprovados. Permissões, backup e captura de fotos corrigidos. Execução em aparelho, assinatura real e publicação continuam pendentes em `PLAY_STORE.md`.

**Problema:** permissões e testes do produto foram adicionados, mas os fluxos nativos ainda não foram comprovados por build Gradle e execução em emulador/aparelho.

**Impacto:** GPS, OAuth, foto ou push podem falhar em aparelho.

**Objetivo:** tornar o Android verificável e cobrir fluxos nativos essenciais.

**Arquivos provavelmente envolvidos:** `android/`, `capacitor.config.ts`, `src/lib/gps.ts`, `src/lib/push.ts`, `src/auth/AuthProvider.tsx`, `PLAY_STORE.md` e testes.

**Dependências restantes:** emulador/aparelhos, upload key fora do projeto, Play Console e acesso administrativo aos ambientes externos. JDK 21 e SDK 36 disponíveis.

**Critérios de conclusão:**

- [x] Declarar permissões necessárias com justificativa.
- [ ] Validar deep link e OAuth em aparelho e no provedor remoto; contratos locais estão cobertos.
- [ ] Validar GPS, câmera/galeria, splash e status bar em aparelho; permissões e configuração empacotada estão cobertas localmente.
- [x] Corrigir/remover testes genéricos e adicionar testes do produto.
- [ ] Revisar/remover permissões amplas de mídia e validar o seletor do sistema conforme a política do Google Play.
- [x] Sincronizar o build web atual e compilar o APK de debug e os testes do aplicativo; assets conferidos dentro do APK em 2026-09-08.
- [x] Preparar assinatura por ambiente e comprovar bloqueio de release sem credenciais; ainda falta criar/guardar a chave real.
- [ ] Gerar AAB assinado e validar primeiro na faixa de teste interno seguindo `PLAY_STORE.md`.

**Risco da alteração:** médio.

## 10. Criar cobertura automatizada e observabilidade

**Status:** parcialmente concluído; 133 testes Vitest e 26 testes Playwright passam em 2026-09-09. A suíte de navegador cobre 13 cenários em desktop e mobile com serviços simulados; encontrou e validou correções de GPS negado e retorno do foco no diálogo de exclusão. TypeScript frontend/API/E2E e build web aprovados. Os contratos pgTAP somam 84 casos (68 de autorização e 16 de solicitações de exclusão), ainda não executados em stack local. Cobertura e execução em `e2e/README.md`.

**Problema:** o projeto não possuía testes dos serviços, RLS ou função Vercel e registrava erros diretamente no console. A cobertura local foi iniciada; RLS, Android, CI e observabilidade remota continuam incompletos.

**Impacto:** regressões e falhas remotas podem passar despercebidas.

**Objetivo:** cobrir contratos críticos e fornecer diagnóstico sem expor dados pessoais ou tokens.

**Arquivos provavelmente envolvidos:** configuração de testes, `src/`, `api/`, migrations e CI futura.

**Dependências:** Vitest 4 escolhido para testes TypeScript; testes reais de RLS continuam dependentes de schema estabilizado e ambiente Supabase isolado.

**Critérios de conclusão:**

- [x] Testar criação, voto, edição, exclusão e autenticação.
- [x] Cobrir troca de aviso pelas listas desktop/mobile, previews, exclusão não confirmada, votos simultâneos, filtros durante voto e histórico fora de ordem, com React e jsdom.
- [x] Executar Playwright em Chromium desktop/mobile para visitante, login, autoria, criação/foto, edição/exclusão, votos, operador/status, privacidade, pedido de exclusão, falhas e GPS negado, com rede simulada.
- [x] Corrigir e validar reconhecimento de erros de GPS por código e restauração de foco ao fechar o diálogo de exclusão.
- [ ] Validar os mesmos fluxos com Auth/Storage/RLS reais em staging e ampliar navegador para GPS permitido/indisponível, rede desconectada e substituição de fotos.
- [x] Sincronizar o build web e recompilar Android; APK debug e JVM aprovados em 26/09, aparelho pendente.
- [ ] Fazer o contrato pgTAP de casos permitidos/proibidos passar após corrigir RLS e estabilizar o baseline.
- [x] Incluir `api/` na checagem TypeScript apropriada.
- [x] Testar webhook/push com serviços simulados.
- [x] Registrar falhas sem incluir secrets, tokens ou PII.

**Risco da alteração:** médio.

## 11. Preparar consultas para crescimento

**Status:** concluído e publicado no frontend; índices aguardam aplicação controlada no ambiente remoto.

**Problema:** a leitura global foi substituída por consulta limitada ao viewport e filtros executados no Supabase.

**Impacto:** tráfego, memória e renderização degradam conforme a base cresce.

**Objetivo:** limitar dados por viewport e definir uma estratégia previsível de atualização.

**Arquivos envolvidos:** `src/lib/reportService.ts`, `src/App.tsx`, `src/ReportList.tsx` e `supabase/migrations/20260904000100_add_report_query_indexes.sql`.

**Dependências restantes:** aplicar e medir os índices no Supabase remoto quando o schema estiver auditado.

**Critérios de conclusão:**

- [x] Definir orçamento inicial: até 200 linhas, uma consulta após 300 ms de estabilização e carregamento completo `reports` + `votes` com p95 alvo de até 1,5 s.
- [x] Limitar cada resposta aos 200 avisos mais recentes do viewport.
- [x] Consultar novamente após 300 ms sem movimento do mapa.
- [x] Mover categoria, status e autoria para a consulta Supabase.
- [x] Limitar a consulta de votos aos avisos carregados.
- [x] Manter atualização por viewport e refresh manual, sem realtime nesta etapa.
- [x] Ignorar respostas assíncronas antigas.
- [x] Invalidar consultas também após mutações e no início de votos; descartar erros antigos e executar consultas adiadas com o viewport/filtros atuais.
- [x] Criar migration local com índices de bounds e filtros.
- [ ] Medir o p95 no ambiente remoto e revisar o limite se o orçamento não for atendido.

**Risco da alteração:** médio.

# Prioridade baixa

## 12. Alinhar comunicação, SEO e plataformas

**Problema:** a comunicação e o `noindex` foram alinhados ao produto atual, mas domínio/contato canônicos e política de versionamento de artefatos ainda não estão definidos.

**Impacto:** expectativa incorreta e manutenção confusa.

**Objetivo:** fazer textos e metadados refletirem o produto real e as plataformas suportadas.

**Arquivos provavelmente envolvidos:** `index.html`, `public/robots.txt`, `public/privacy.html`, documentação e configuração futura de domínio.

**Dependências:** confirmação do domínio e contato oficiais; decisão de versionamento quando um repositório Git estiver disponível; nova decisão de produto antes de adicionar PWA ou iOS.

**Critérios de conclusão:**

- [x] Diferenciar orientação de encaminhamento oficial.
- [x] Explicar o efeito real das confirmações.
- [x] Manter a distribuição atual como `noindex` de forma coerente.
- [ ] Confirmar domínio e contato canônicos antes de indexação pública.
- [x] Formalizar web responsiva e Android como plataformas atuais; PWA e iOS não são suportados.
- [x] Revisar quais artefatos gerados devem ser versionados; builds, backups, resultados de testes e arquivos pessoais da IDE ficam fora do primeiro commit Git.

**Risco da alteração:** baixo.
