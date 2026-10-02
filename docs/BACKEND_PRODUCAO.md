# Backend ZelaDF — pendências para produção

Revisão: 2026-10-01. Publicar a API e transferir o tráfego do aplicativo são etapas distintas. O ensaio em staging está descrito na seção 4.

## Estado atual

- **Confirmado no código:** `backend/server.py` implementa as rotas FastAPI `/api/v1`; `backend/vercel.json` seleciona FastAPI. As cinco flags `VITE_API_*_ENABLED` estão desligadas por padrão. Auth e os bytes das fotos continuam no Supabase. Os executores `account_deletion.py` e `photo_cleanup.py` são administrativos e excluídos do pacote Vercel.
- **Confirmado por execução:** API e Supabase separados foram ensaiados em staging em 26/09 e novamente em 01/10: 118 assertions SQL pela Management API e 66 verificações reais com contas sintéticas. Um build web local com as cinco flags ativas completou o fluxo de navegador em staging. A web de produção permaneceu com FastAPI desligado.
- **Estado externo não verificável:** histórico completo de migrations de produção, backup restaurável, valores dos secrets, métricas representativas e operação humana. Os deploys de API citados abaixo foram verificados, mas não equivalem ao corte dos clientes.

**Verificado em 30/09, sem alteração remota:** API hospedada de staging repetiu 66 verificações integradas; `/health` e `/ready` responderam 200. As páginas web públicas de produção consultadas responderam 200. Auditorias somente leitura: os 823 itens do schema principal e 136 das tabelas privadas de produção não mudaram desde 26/09. Staging difere de produção em `push_tokens`, `reports.author_name`, FKs Auth e objetos novos do backend. Nenhum dos dois projetos registra as 19 versões locais no histórico de migrations. A mudança de fingerprint de `guard_photo_cleanup` desde 26/09 foi revisada e o corpo atual coincide com a migration final `20260926000400`. A lista de backups físicos de produção está vazia e PITR está desligado; não há restauração integral demonstrada. O `supabase test db --linked` no staging parou antes de executar testes porque não há Docker/Podman. Checks locais: três typechecks, 171 Vitest, 18 Python, build web, três testes JVM e APK debug passaram. Playwright: 39 aprovações, duas expirações iniciais que passaram isoladas e três skips intencionais. Nenhuma migration ou deploy de produção foi feito nesta verificação.

## Pré-vistoria de produção — 01/10/2026

**Confirmado externamente por consultas somente leitura:** o projeto de produção identificado pela CLI está ativo em `sa-east-1`. A lista de backups físicos contém zero itens e o PITR está desligado. Não há backup completo de Auth e arquivos Storage nem restauração isolada demonstrada; o snapshot de metadados em `supabase/audit/results/` não é um backup.

As auditorias atuais retornaram 823 itens do schema principal e 136 das tabelas privadas, sem diferença em relação a 30/09. `supabase_migrations.schema_migrations` não existe em produção; há 19 arquivos de migration locais. A consulta `supabase/audit/backend_promotion_presence.sql` confirmou que as quatro tabelas privadas e dez funções exigidas pelas migrations de criação idempotente, exclusão administrativa e limpeza de fotos estão ausentes em produção e presentes em staging. A comparação de produção com staging também encontrou diferenças anteriores: `push_tokens` tem constraints, nulabilidade e índice distintos; `reports.author_name` conserva o default histórico; as FKs de autoria de `reports` e `votes` estão validadas em produção e `NOT VALID` em staging. Essas diferenças exigem revisão semântica antes de adotar um histórico comum. Não se deve copiar o estado de staging integralmente, pois ele inclui objetos de push fora deste corte.

**Teste:** 118 assertions SQL passaram novamente em staging pela Management API com rollback: 68 de RLS, 16 de pedidos de exclusão, 19 de execução administrativa e 15 de limpeza de fotos. O comando oficial `supabase test db` não foi executado nesta máquina por ausência de Docker/Podman; o resultado do GitHub Actions não pôde ser confirmado pelo acesso disponível. Nenhum SQL de escrita de aplicação, `db push`, `migration repair`, seed ou alteração permanente de schema/dados de produção foi executado.

**Portão seguinte:** disponibilizar backup protegido de banco/Auth/Storage e demonstrar restauração isolada; reconciliar o baseline e o histórico reais; executar o contrato oficial em ambiente isolado. Só então ensaiar e promover as seis migrations selecionadas, na ordem indicada abaixo, com plano de compensação. **Documentado — informado pelo proprietário em 01/10:** ainda não há destino protegido para a cópia nem ambiente isolado de restauração. É necessário provisionar ambos antes da promoção; não enviar credenciais em chat ou arquivos versionados.

## 1. Preparar o banco de produção

1. Confirmar o projeto Supabase de destino. Produzir backup utilizável de banco, Auth e arquivos Storage; ensaiar restauração isolada. O backup lógico anterior de avisos/votos é incompleto e PITR estava desligado na última consulta documentada.
2. Seguir `supabase/README.md`: comparar o schema e o histórico remotos com o baseline local reconstruído, incluindo constraints, grants, RLS, funções, triggers, tabelas privadas e policies de Storage. Resolver divergências antes de `db push` ou `migration repair`; não aplicar `seed.sql` em produção.
3. Promover somente as migrations necessárias após ensaio isolado: `20260924000100` para criação idempotente, `20260924000200` para exclusão administrativa e `20260926000100` a `20260926000400`, nessa ordem, para limpeza de fotos. `20260925000100` é de push e não faz parte do corte da API com push desligado.
4. Executar `supabase test db` em stack local/CI com Docker ou Podman e conferir o resultado do CI. As assertions diretas em staging não satisfazem esse portão do `AGENTS.md`. Repetir os casos de visitante, autor, outra conta, bloqueado e operador contra Auth/RLS/Storage reais.

## 2. Definir a operação

- Nomear responsável e canal de privacidade e moderação; definir consulta das filas, prazos, recuperação de acesso, retenção de comprovantes e resposta a incidentes. `PRIVACY.md` registra que isso ainda faltava. Protocolo de exclusão não significa conta excluída.
- Preparar ambiente protegido para `backend/account_deletion.py` e `backend/photo_cleanup.py`. Ensaiar falhas e retomada, remoção física no Storage, verificação Auth/banco/Storage e tratamento de fotos ocultas/órfãs. A chave `SUPABASE_SERVICE_ROLE_KEY` fica apenas nesse ambiente administrativo, nunca na API pública, no app ou no repositório.
- Definir responsável pela API Vercel, acesso/retenção de logs, alertas, custos e janela de rollback. Conferir logs de infraestrutura sem registrar tokens, coordenadas, fotos, textos ou IDs nas URLs.

## 3. Publicar a API, mantendo o cliente atual

1. Usar projeto Vercel separado do web, com raiz `backend/`; conferir runtime Python, exclusão dos executores administrativos e resultado do preview.
2. Configurar apenas `SUPABASE_URL`, `SUPABASE_PUBLIC_KEY`, `API_CORS_ORIGINS` com origens exatas e `API_KNOWN_CLIENT_BUILDS` com builds testados. Conferir nomes, presença e escopo sem imprimir valores. Não instalar service role na API.
3. Validar `/health`, `/ready`, JWT inválido/expirado, isolamento entre contas, CORS permitido/negado, erros, limites, logs sanitizados e Storage. Repetir o ensaio integrado contra staging; após a promoção controlada do banco, fazer smoke test limitado em produção.
4. Registrar domínio, deployment imutável, versão, responsável e caminho de rollback. O deploy da API não altera sozinho o tráfego web/Android.

### Publicação executada em 01/10/2026

**Confirmado externamente:** projeto Vercel separado `zeladf-api` (`prj_2vyhhKISe9cGwEVLes0CmcUTjSB6`). O deployment de produção atual `dpl_BF5dErye1pfiYHcARUPAyHyh2d2y`, Python 3.12/FastAPI, atende em https://zeladf-api.vercel.app. O pacote foi montado a partir de `backend/` com somente `server.py`, `requirements.txt`, `vercel.json`, `.python-version` e `.vercelignore`; os executores administrativos, testes, ambiente virtual e caches ficaram fora. O deployment de staging atual `dpl_3QpL1pYY4WwdDJ5d8YMZMtKMnpkv` atende em https://zeladf-api-staging.vercel.app e usa Supabase staging. A Vercel vinculou o primeiro deploy automaticamente a produção; ele foi substituído pelo deployment corrigido após detectar log upstream do `httpx`.

**Configuração verificada por nomes e escopos, sem ler valores na Vercel:** `SUPABASE_URL`, `SUPABASE_PUBLIC_KEY`, `API_CORS_ORIGINS` e `API_KNOWN_CLIENT_BUILDS` estão presentes em Production e Preview; `SUPABASE_SERVICE_ROLE_KEY` está ausente. Os valores foram enviados em memória: produção aponta ao projeto Supabase de produção e preview ao staging. CORS permite apenas `https://zela-df.vercel.app` e `https://localhost` (origem Android padrão segundo a configuração Capacitor atual); os rótulos conhecidos são `web/1.0.0` e `android/1.0.0`.

**Validação:** 20 testes Python, 171 Vitest, três typechecks e 41 testes Playwright passaram (três skips). O ensaio integrado existente repetiu 66 verificações com contas sintéticas em staging. O staging respondeu 200 em `/health` e `/ready`, 404 para UUID inexistente e 401 sem sessão. O middleware CORS foi corrigido para cobrir também respostas de erro: uma rota `/me/*` sem sessão devolve 401 com `Access-Control-Allow-Origin` para a origem permitida, e sem esse cabeçalho para origem estranha. Em produção, `/health`, `/ready` e leitura pública limitada responderam 200; ausência de sessão/JWT inválido ou sintético expirado deram 401; CORS web/Android deu 200 com origem exata e origem estranha deu 400 sem permissão; consulta inválida/grande deu 400. A correção anterior do logger suprimiu URLs upstream: oito registros do deployment anterior continham apenas mensagens de rota normalizada, sem URL Supabase ou token de teste. O projeto web permaneceu no deployment `dpl_CoSqEXHv8wJoAevgXRgCDJwmAfhk`; as flags FastAPI não foram ligadas e nenhum build Android mudou.

**Limite da validação:** as migrations do backend continuam ausentes em produção. Auth com contas reais, isolamento entre contas, escritas, Storage e operação humana não foram ensaiados nessa API de produção; não declarar essas rotas prontas para o cliente. O teste oficial `supabase test db`, backup/restauração e a reconciliação do banco da seção 1 continuam pendentes. Responsável de plantão, retenção de logs, alertas e custo ainda dependem de definição operacional.

**Rollback:** o cliente atual não aponta para essa API. Se a publicação causar incidente antes do corte de tráfego, pausar o projeto separado com `vercel project pause zeladf-api` e investigar; reativá-lo somente após correção. O deployment anterior de produção `dpl_HTj5YWQUJ4DTVwHgN8vmotiCcb7b` permite rollback da última correção, mas não envia CORS nas respostas de erro. O anterior de staging é `dpl_2HLzzQcx9B181ENgzPqt9y1zzL4X`. Não restaurar o primeiro deployment `dpl_BzfkUeyxcvXZ5rZcEkDKj8Av5gH9`, que registrava URLs upstream.

## 4. Passar os fluxos para FastAPI

As flags são `VITE_API_READS_ENABLED`, `VITE_API_DELETION_REQUESTS_ENABLED`, `VITE_API_REPORT_WRITES_ENABLED`, `VITE_API_VOTES_ENABLED` e `VITE_API_COMMUNITY_STATUS_ENABLED`, com `VITE_API_URL` no build. Ativar uma por vez em build de teste e validar web e Android instalado antes de distribuir. Falha de escrita pela API não dispara uma segunda escrita direta.

- Leituras: filtros, limites, autoria própria, bloqueios e avisos ocultos.
- Exclusão: protocolo idempotente, sessão expirada, isolamento entre contas e atendimento humano.
- Avisos/fotos: criação repetida, substituição/exclusão, falhas entre banco e Storage e limpeza retomável.
- Votos: concorrência, aviso bloqueado/oculto e contador comparado à fonte canônica `votes`.
- Comunidade/status: termos, denúncias, bloqueios, operador, histórico privado e motivo/transição.

### Ensaio do cliente em staging — 01/10/2026

**Confirmado no código e por execução:** um build web local apontou para o Supabase e a API de staging com as cinco flags ativas. No Chromium em `https://localhost`, duas contas sintéticas percorreram leituras públicas e privadas, aceite de termos, upload de foto diretamente ao Storage, criação/edição/exclusão de aviso, voto e desfazer, mudança de status por operador com motivo, denúncia, bloqueio/desbloqueio e solicitação de exclusão. As chamadas de negócio observadas passaram pela FastAPI; o navegador não fez escritas diretas em `reports` ou `votes`. Auth e upload de bytes permaneceram no Supabase conforme o contrato. O teste de regressão da API hospedada aprovou 66 verificações de Auth/RLS/Storage. As contas, papéis, avisos, fotos e pedidos sintéticos foram removidos; um arquivo órfão gerado por uma tentativa inicial do teste foi identificado e excluído, com ausência confirmada. O build de ensaio não foi publicado nem sincronizado para Android.

**Observabilidade limitada:** em uma amostra de 470 linhas de requisição do log da API de staging, 90 tinham rótulo `web/1.0.0`; o p95 dessas 90 foi 1.366 ms e nenhuma apresentou 5xx. Essa amostra sintética não mede carga nem custo de produção, tampouco mostra a adoção real dos clientes ou todo o tráfego direto da Data API.

**Corte pendente:** consulta somente leitura confirmou 0 dos 14 objetos exigidos pelas migrations de backend no Supabase de produção. Sem destino protegido de backup, restauração isolada, reconciliação do schema/histórico, `supabase test db` e operação humana definida, as flags de produção permanecem desligadas. Ainda faltam ensaio em Android instalado, validação de Auth/Storage/escritas com contas controladas em produção após as migrations, comparação agregada com tráfego direto, carga representativa, custos/alertas e política para versões Android antigas. Ativar cada flag exige um novo build e plano de rollback do cliente.

Medir erros e p95 com carga representativa. O p95 de 700 ms documentado veio de 20 leituras em staging vazio. Relacionar cada rótulo de build ao artefato web e ao `versionCode` Android; comparar contagens agregadas por rota/build na API com Data API/RPC para entender adoção. Decidir suporte a versões Android antigas antes de remover caminhos diretos. Reverter flag exige novo build web e novo APK; manter RLS, grants, RPCs e Storage compatíveis.

Push é decisão separada: permanece na função TypeScript e desligado até validar opt-in, webhook/FCM, aparelho e revogação da credencial Firebase anterior.

## Critério para declarar concluído

- Backup completo restaurado; schema/histórico reconciliados; migrations necessárias conferidas; `supabase test db` aprovado.
- API de produção validada com Auth, CORS, Storage e observabilidade; operação de privacidade, moderação, exclusão e fotos definida e ensaiada.
- Fluxos ativados e observados por build em web/Android, com rollback registrado. O simples deploy da API não comprova a migração dos clientes.

Referências operacionais: `backend/README.md`, `supabase/README.md`, `PRIVACY.md` e `release/ROLLOUT.md`.
