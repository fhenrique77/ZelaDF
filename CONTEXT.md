# ZelaDF - Contexto do Projeto

## Visão geral

**Confirmado no código:** o ZelaDF é uma aplicação web responsiva, também empacotada para Android, que apresenta problemas urbanos do Distrito Federal em um mapa colaborativo. Visitantes consultam avisos; usuários autenticados podem publicar e confirmar ocorrências.

As categorias atuais cobrem água, buracos, iluminação/postes, lixo, semáforos/sinalização e outros problemas. Cada categoria contém órgão e telefone de referência configurados no frontend.

**Inferência:** o público principal são moradores do DF que desejam dar visibilidade coletiva a problemas urbanos e descobrir um canal de contato apropriado.

## Problema

### Problema de negócio

Problemas urbanos podem ficar dispersos, moradores podem desconhecer o órgão relacionado e ocorrências percebidas por várias pessoas podem não ter visibilidade coletiva. O mapa, as fotos e as confirmações procuram centralizar esse contexto.

### Problema técnico

O sistema reúne localização, categoria, descrição, fotografia, autoria, status e votos em uma interface única. Supabase fornece autenticação, PostgreSQL e Storage; Leaflet apresenta os dados geograficamente.

## Objetivo atual

O objetivo implementado é registrar e consultar avisos comunitários, permitir confirmações e orientar o cidadão com o órgão e telefone associados à categoria.

Não há encaminhamento oficial implementado. O sistema não chama APIs de órgãos públicos, não cria protocolo e não confirma que uma ocorrência foi recebida pela administração pública. A interface apresenta o órgão apenas como sugestão de contato.

## Usuários

### Visitante

Pode consultar mapa, lista, filtros, detalhes, fotografias e contatos. A interface solicita login quando tenta publicar ou votar.

### Usuário autenticado

Pode publicar avisos, votar, remover seu voto e editar/excluir os próprios avisos. A migration local atribui autoria por `auth.uid()` e protege essas mutações no banco. A consulta pública geral não recebe `author_id` nem `author_name`; RPCs autenticadas retornam somente IDs/campos públicos dos avisos da própria conta. O estado remoto não foi verificado.

### Administrador ou operador

Uma migration local prepara o papel de operador interno do ZelaDF. O operador confirmado pela RPC pode alterar status na tela de detalhe e consultar o histórico operacional. Nenhum operador é criado automaticamente, não há gestão de papéis na interface e o estado remoto não foi verificado. Esse papel não representa órgão público.

Não há painel de gestão de operadores. O candidato inclui denúncia de conteúdo/autor, bloqueios e moderação manual por função administrativa privada, com termos versionados antes da publicação/edição. Consultas e decisões não revelam IDs Auth ao cliente. Operação contínua ainda por definir; procedimento em release/COMMUNITY_MODERATION.md.

## Stack

- React 19 e React DOM 19;
- TypeScript 5.7;
- Vite 8;
- Tailwind CSS 4;
- Leaflet e React Leaflet;
- Supabase JS, PostgreSQL, Auth e Storage;
- Capacitor 8 e Android/Gradle;
- Capacitor Geolocation, Push Notifications, App, Splash Screen e Status Bar;
- Firebase Admin e Firebase Cloud Messaging;
- Vercel Functions;
- Nominatim e OpenStreetMap;
- pnpm;

Unsplash fornece imagens apenas aos dados de demonstração. Não há projeto iOS nem PWA completa no repositório atual.

## Arquitetura

**Atualização confirmada em 26/09:** existe API FastAPI em projeto Vercel separado e Supabase de staging separado, ensaiados com contas sintéticas. Produção continua no fluxo Supabase direto por flags; os executores administrativos de exclusão e fotos não integram a API pública. Evidências e limites em `docs/BACKEND_PRODUCAO.md`.


### Núcleo funcional

```text
Usuário
   |
React SPA
   |
Supabase
|- Auth
|- PostgreSQL: reports, votes, operator_users, report_status_history
`- Storage: report-photos esperado
```

### Integrações do cliente

```text
React
|- Nominatim: coordenadas -> endereço/RA
|- OpenStreetMap: tiles do mapa
|- Google: OAuth e fontes
|- Unsplash: fotos de demonstração
`- Capacitor: GPS, deep link, UI nativa e push
```

### Push preparado e inativo

```text
RPC de status -> histórico -> push_status_events (somente ID)
-> webhook externo a configurar
-> Vercel Function POST /api/send-push
-> reivindicação única e consulta a push_tokens
-> Firebase Cloud Messaging
-> aplicativo Android
```

Cliente, função, migrations, RLS e cleanup de tokens inválidos existem localmente. O ciclo de status é protegido por operador/RPC; a função de push só aceita ID de evento reivindicado no banco e mantém entrega de melhor esforço. Cliente e função push permanecem desativados por padrão; webhook, secrets, migration nova e funcionamento em aparelho não são confirmados.

## Característica arquitetural importante

O CRUD principal ainda se comunica diretamente com o Supabase por padrão. Rotas FastAPI ensaiadas em staging e flags de build permitem migrar cada fluxo separadamente, mas não há corte de tráfego confirmado. O módulo 9 prepara rótulos agregados de build para medir adoção e mantém os caminhos diretos até validação real.

Consequentemente, as policies de Row Level Security são uma parte crítica da segurança. Validações ou verificações de autoria no React podem ser contornadas por chamadas diretas ao Supabase.

## Estrutura do repositório

```text
src/
|- App.tsx                  # Orquestra UI e fluxos
|- data.ts                  # Tipos, categorias e órgãos
|- NewReportForm.tsx        # Criação
|- ReportDetail.tsx         # Detalhe, voto, edição/exclusão e status operacional
|- ReportList.tsx           # Lista e filtros
|- auth/                    # Supabase Auth
`- lib/                     # Dados, GPS, geocoding, push, Capacitor
api/send-push.ts            # Função serverless Vercel
android/                    # Projeto Capacitor Android
public/                     # Ícones e política de privacidade
PRIVACY.md                  # Regras técnicas de retenção e exclusão
PLAY_STORE.md               # Checklist de prontidão e publicação Android
supabase-schema.sql         # Schema inicial e seed manual
supabase-auth-migration.sql # Extensão manual para autoria
supabase/config.toml        # Configuração da stack local
supabase/migrations/        # Baseline reconstruído e evoluções ordenadas
supabase/seed.sql           # Oito avisos somente para desenvolvimento local
supabase/audit/             # Auditoria estrutural remota somente-leitura
supabase/tests/database/    # Contrato pgTAP de segurança/RLS
capacitor.config.ts         # Configuração nativa
```

`dist/`, `node_modules/`, caches Gradle e assets web copiados para Android são gerados ou instalados e não são fonte principal do comportamento.

## Modelo de domínio

### Report / Aviso

Possui `id`, categoria, título, descrição, região administrativa, endereço, coordenadas, URL da foto, status, contador de confirmações, autor interno e data. Status válidos: `aberto`, `andamento` e `resolvido`. A identidade pública é sempre `Cidadão`; a aplicação não carrega dados de conta junto ao conteúdo público. Para novas escritas, um trigger deriva `author_id` da sessão e a FK Auth aplica cascade na exclusão da conta; a validação das referências históricas continua pendente.

### Vote / Confirmação

Referencia um aviso. `votes` é a fonte canônica; `reports.confirmations` é um contador materializado mantido por triggers. As migrations locais restringem a leitura ao `report_id` dos votos da própria conta e as mutações à RPC idempotente `set_report_vote`, que serializa operações por aviso. A unicidade efetiva é por usuário/aviso; `device_id` permanece por compatibilidade histórica. `votes.user_id` possui FK `NOT VALID` para Auth: novas referências são verificadas, mas dados históricos precisam de auditoria antes da validação. As migrations não foram aplicadas remotamente.

### User

É gerenciado pelo Supabase Auth. A UI suporta e-mail OTP, telefone/senha e Google OAuth. Nome, e-mail e telefone não são usados como assinatura pública; o número também não aparece no rótulo privado da conta. A ativação efetiva dos provedores é estado externo não verificável.

### Category

É configuração local em `src/data.ts`, não tabela. Define rótulo, cor, ícone, órgão, sigla e telefone.

### Push Token

A migration local define `push_tokens` com `user_id`, token FCM único, plataforma Android, timestamps e FK para `auth.users`. RLS restringe as linhas ao usuário autenticado; um trigger privado remove associação anterior do mesmo token antes de vinculá-lo a outra conta. A tabela remota não foi confirmada.

### Operador interno

`operator_users` relaciona uma conta Auth ao papel operacional interno. A tabela não concede acesso direto ao cliente; `current_user_is_operator()` informa somente se a sessão atual possui o papel. Atribuição e revogação dependem de processo administrativo externo ao frontend.

### Histórico de status

`report_status_history` registra aviso, status anterior/novo, motivo, ator interno e timestamp. Somente operadores podem consultar o histórico, e a consulta do frontend não seleciona o identificador do ator. A exclusão do aviso remove seu histórico; a exclusão da conta do operador anonimiza `changed_by`.

### Solicitação de exclusão da conta

`account_deletion_requests` é uma fila privada preparada localmente. A RPC sem argumentos `request_account_deletion()` atribui a conta pela sessão Auth, mantém um pedido por usuário e retorna somente protocolo, data e situação. O botão “Conta” e `public/account-deletion.html` oferecem entrada autenticada na web e no Android. Há confirmação de intenção e tratamento de falhas, mas a exclusão efetiva e o atendimento administrativo ainda não estão operacionais. Ver `PRIVACY.md` e DEC-020; a migration não foi aplicada remotamente.

## Fluxos principais

| Fluxo | Estado | Resumo |
| --- | --- | --- |
| Consulta | Funcional no código | Busca até 200 `reports` do viewport, com categoria, status e autoria filtrados no Supabase |
| Criação | Preparada localmente | Valida dados, envia foto na pasta da conta, insere sem escolher autoria/status/contador e tenta registrar voto inicial; depende das migrations remotas |
| Upload | Dependente de configuração externa | Valida JPEG/PNG/WebP até 5 MiB; policy local exige conta, pasta e `owner_id` correspondentes, mas não foi aplicada remotamente |
| GPS web | Funcional no código | Obtém posição ou volta ao centro de Brasília com motivo de falha |
| GPS Android | Parcial | Código e permissões existem; execução em emulador/aparelho não foi confirmada |
| Geocodificação | Funcional no código | Somente após ação explícita, envia coordenadas selecionadas ao Nominatim, com cache em memória e intervalo local |
| Voto | Preparado localmente | UI otimista com bloqueio por aviso e reconciliação; RPC idempotente e triggers mantêm voto/contador na mesma transação; depende de migration remota |
| Edição | Preparada localmente | Autor altera somente categoria, título, descrição e foto; policy usa `auth.uid()` e grants bloqueiam campos internos; depende de migration remota |
| Exclusão | Preparada localmente | Policy permite apenas ao autor; banco remove dependências por cascade e cliente tenta limpar a foto; depende de migration remota |
| Autenticação | Dependente de configuração externa | Sessão e três métodos existem no cliente |
| Mudança de status | Preparada localmente | Operador interno usa RPC atômica com transições e motivo; depende de migration e provisionamento remoto |
| Push | Preparado/inativo | Migration, cliente e função existem, mas flags padrão impedem ativação; webhook, remotos e aparelho não foram validados |

## Dados externos e privacidade

- Supabase recebe autenticação, avisos, votos e fotos; push pretende armazenar tokens.
- Nominatim recebe latitude e longitude somente quando o usuário solicita sugestão de endereço.
- OpenStreetMap recebe requisições de tiles conforme a área navegada.
- Google participa do OAuth escolhido pelo usuário e entrega as fontes carregadas pela interface.
- Firebase recebe token e conteúdo operacional de push somente se o fluxo for ativado e autorizado.
- Vercel hospeda o frontend e a função de push, podendo processar metadados técnicos de requisição.
- Unsplash recebe requisições das imagens de demonstração.
- O protocolo `tel:` abre o discador; nenhum aviso é transmitido ao órgão.

A política pública descreve esses provedores e está ligada no cabeçalho, autenticação e publicação. `PRIVACY.md` define identidade pública, retenção e o fluxo técnico pretendido de exclusão. Controlador, bases legais, canal, prazos remotos e operação real de exclusão continuam dependentes de decisão jurídica/administrativa e dos ambientes externos.

## Ambiente

Gerenciador: pnpm 10, com Node.js 22 indicado em `.mise.toml`.

Variáveis do frontend:

```text
VITE_SUPABASE_URL=<valor>
VITE_SUPABASE_ANON_KEY=<valor>
VITE_PUSH_ENABLED=false
```

Variáveis esperadas somente pela função serverless:

```text
PUSH_ENABLED
PUSH_SECRET
SUPABASE_SERVICE_ROLE_KEY
FIREBASE_SERVICE_ACCOUNT
```

A função lê `VITE_SUPABASE_URL`, exige `PUSH_ENABLED=true`, `SUPABASE_SERVICE_ROLE_KEY`, `FIREBASE_SERVICE_ACCOUNT` e `PUSH_SECRET` no servidor, sem aceitar a chave `anon` como fallback. Somente os nomes são versionados; nenhum valor real deve ser documentado ou enviado ao cliente.

Configurações confirmadas localmente:

- projeto Supabase configurável por `.env`;
- projeto Android `com.zeladf.app`;
- deep link `com.zeladf.app://`;
- vínculo local da Vercel;
- configuração Firebase Android;
- arquivo sensível de service account removido da raiz em 2026-09-05, sem leitura ou reprodução do conteúdo.

Uma consulta somente leitura à configuração da Vercel confirmou `FIREBASE_SERVICE_ACCOUNT` e `PUSH_SECRET` como secrets ocultos nos ambientes Preview e Production. Os valores não foram lidos e não é possível confirmar se a credencial Firebase armazenada já foi rotacionada. `PUSH_ENABLED` não está configurada, então a função permanece inativa por padrão. O estado do Firebase e dos demais serviços remotos não é verificável pelo repositório.

O baseline em `supabase/migrations/` foi reconstruído dos SQLs históricos e do contrato do cliente; não foi extraído do Supabase remoto. O runbook de auditoria, adoção por ambiente e rollback está em `supabase/README.md`. O seed é exclusivo de desenvolvimento/testes e nunca deve ser promovido para produção.

## Limitações conhecidas da arquitetura

- Segurança depende da aplicação e auditoria remota da migration local de autorização; o baseline histórico continua permissivo por registro histórico.
- O baseline remoto e a versão real do PostgreSQL ainda não foram comparados com as migrations reconstruídas.
- A consulta é limitada aos 200 avisos mais recentes do viewport; ainda não há cursor ou ação para carregar além desse limite.
- Atualização usa mudança de viewport e refresh manual, sem realtime ou sincronização incremental.
- Não há backend próprio para centralizar regras complexas.
- Não há exclusão de conta automatizada; o procedimento idempotente de servidor está especificado em `PRIVACY.md`.
- A migration local restringe colunas internas por grants e usa RPCs para autoria, mas policies/grants efetivos do ambiente remoto não foram verificados.
- As FKs Auth locais são `NOT VALID`: protegem novas referências, mas exigem auditoria e saneamento antes de validar o histórico.
- Votos e contador possuem operação atômica local, mas a migration ainda não foi aplicada nem testada sob concorrência no PostgreSQL remoto/local.
- Dados demonstrativos aparecem somente sem configuração Supabase e são identificados na interface; falhas remotas preservam dados anteriores e mostram erro.
- Há papel e histórico de status locais, mas nenhum operador provisionado, painel de gestão de papéis ou validação do processo real.
- Push permanece inativo até opt-in na UI, aplicação da migration, webhook autenticado, secrets e teste Android; nenhuma flag local confirma estado remoto.
- Cleanup de fotos é best effort e depende das policies remotas; objetos antigos sem proprietário podem exigir limpeza administrativa.
- Não há integração oficial com órgãos públicos.
- Os tiles padrão do OpenStreetMap são um serviço comunitário sem SLA, adequado apenas enquanto o uso interativo permanecer moderado e compatível com a política do provedor.
