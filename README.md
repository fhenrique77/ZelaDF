# ZelaDF

Mapa colaborativo de problemas urbanos do Distrito Federal, disponível como aplicação web responsiva e aplicativo Android via Capacitor.

Este documento descreve o projeto como ele existe atualmente no repositório. Ele diferencia evidências encontradas no código de inferências sobre negócio e não pressupõe que a infraestrutura remota esteja igual aos arquivos locais.

## Resumo executivo

O ZelaDF permite que moradores consultem problemas urbanos em um mapa e que usuários autenticados publiquem novos avisos, anexem fotos e confirmem ocorrências existentes.

Os avisos representam situações como:

- vazamentos de água;
- buracos em vias;
- postes ou iluminação defeituosa;
- lixo e entulho;
- semáforos ou sinalização;
- outros problemas urbanos.

Cada categoria aponta para um órgão e telefone de referência. Essa associação é somente informativa: o código atual não envia automaticamente o aviso ao órgão público, não cria protocolo oficial e não possui integração com sistemas governamentais.

O projeto tem características de um MVP funcional em evolução. O núcleo de visualização/publicação, votos atômicos e um ciclo operacional local de status estão implementados no repositório, mas segurança geral de acesso aos dados, aplicação das migrations, notificações push, validação dos fluxos Android em aparelho, testes de banco e operação em produção ainda precisam ser consolidados.

## Problema que o projeto tenta resolver

A política de privacidade e o código indicam que o projeto busca facilitar o registro e a visualização de problemas urbanos em Brasília e no Distrito Federal.

O problema possui três partes:

1. Ocorrências urbanas podem estar dispersas e sem visibilidade coletiva.
2. Moradores podem não saber qual órgão deve ser procurado para cada tipo de problema.
3. Uma única ocorrência pode parecer isolada, enquanto confirmações de outros cidadãos ajudam a indicar recorrência ou relevância.

> **Inferência baseada no código atual:** o público principal parece ser composto por moradores do Distrito Federal que desejam informar, consultar ou confirmar problemas urbanos próximos. Não há evidência no repositório de que órgãos públicos sejam usuários do sistema ou parceiros integrados.

## Solução existente

O ZelaDF concentra os avisos em um mapa. Um visitante pode consultar os dados públicos e filtrá-los. Um usuário autenticado pode marcar uma posição, descrever a ocorrência, anexar uma foto e publicar o aviso.

A solução combina:

- mapa público com marcadores;
- lista de avisos ordenada por data;
- filtros por categoria e status;
- autenticação pelo Supabase;
- geocodificação reversa de coordenadas;
- armazenamento de fotos;
- votos autenticados por RPC idempotente, com contador transacional preparado localmente;
- indicação do órgão e telefone relacionado à categoria;
- mudança auditável de status por operador interno, preparada localmente;
- empacotamento Android;
- estrutura local de push preparada, mas desativada até validação externa.

## Escopo real

### O sistema faz

- Exibe avisos públicos no mapa e em uma lista.
- Permite filtrar por categoria e status.
- Exibe detalhes, fotografia, localização, data, confirmações e autoria pública genérica.
- Oferece login por e-mail OTP, Google e telefone/senha no frontend.
- Exige login na interface para publicar e votar.
- Permite marcar manualmente o local de um novo aviso.
- Consulta endereço e região administrativa quando o usuário solicita a sugestão ao Nominatim.
- Envia fotografias ao Supabase Storage.
- Persiste avisos e votos no Supabase.
- Permite que o autor veja controles de edição e exclusão.
- Permite que um operador interno reconhecido pelo banco altere status com motivo e consulte o histórico.
- Exibe o órgão responsável sugerido e abre o discador pelo protocolo `tel:`.
- Possui fallback com dados de demonstração.
- Empacota o frontend em um aplicativo Android com Capacitor.

### O sistema não faz, segundo o repositório

- Não envia avisos automaticamente para órgãos públicos.
- Não gera protocolo oficial.
- Não possui painel de gestão de operadores ou de moderação.
- Não provisiona operadores automaticamente e não representa integração com agentes públicos.
- Não implementa priorização efetiva por número de confirmações.
- Não possui integração direta com Caesb, Novacap, Neoenergia, SLU, Detran-DF ou Participa DF.
- Não contém projeto iOS.
- Não possui PWA completa: existem metatags mobile, mas não foram encontrados manifesto e service worker.
- Não contém fluxo implementado de importação ou exportação de dados.

## Usuários prováveis

### Visitante

Pode consultar mapa, lista, filtros, detalhes e órgãos indicados. Ao tentar publicar ou votar, é direcionado à autenticação.

### Cidadão autenticado

Pode publicar, confirmar e remover sua confirmação. A interface mostra edição e exclusão quando RPCs autenticadas identificam o aviso como pertencente à sessão; a consulta pública não carrega a identidade da conta.

### Operador ou administrador

Uma migration local define o papel de operador interno do ZelaDF. Quando a RPC confirma esse papel, o detalhe do aviso apresenta controles de status e histórico. Não existe painel de gestão de operadores, moderação ou papel de órgão público.

> **Inferência baseada no código atual:** o operador será integrante da operação interna do ZelaDF. O processo real, os responsáveis e as transições adotadas ainda precisam de confirmação de negócio. Nenhum operador é criado pela migration.

## Arquitetura

O projeto usa uma arquitetura cliente/BaaS com um pequeno complemento serverless:

```text
Aplicação React
├── Supabase Auth
├── Supabase PostgreSQL
├── Supabase Storage
├── Nominatim
├── OpenStreetMap
└── Plugins Capacitor

Supabase Webhook pretendido
└── Vercel Function /api/send-push
    ├── Supabase push_tokens
    └── Firebase Cloud Messaging
```

O CRUD principal não passa por um backend próprio. O navegador utiliza a chave anônima e se comunica diretamente com Supabase Auth, banco e Storage. Por isso, as políticas Row Level Security são a principal fronteira de segurança do sistema.

### Frontend

O frontend é uma SPA React sem roteador. As diferentes experiências são componentes e estados sobre a mesma página:

- `src/App.tsx`: coordena mapa, dados, filtros, autenticação e modais;
- `src/ReportList.tsx`: lista e filtros;
- `src/ReportDetail.tsx`: detalhe, voto, órgão, edição, exclusão e operação de status;
- `src/NewReportForm.tsx`: criação e fotografia;
- `src/auth/AuthProvider.tsx`: sessão e métodos de autenticação;
- `src/auth/AuthModal.tsx`: interface de login e cadastro;
- `src/data.ts`: categorias, status, órgãos e tipos do domínio;
- `src/lib/reportService.ts`: acesso a avisos, votos e fotos;
- `src/lib/reportStatus.ts`: contrato de transições e validação do motivo;
- `src/lib/geocoding.ts`: geocodificação reversa;
- `src/lib/gps.ts`: localização do dispositivo;
- `src/lib/push.ts`: registro de token push;
- `src/lib/capacitor.ts`: inicialização de plugins nativos.

Não existem rotas de página. No desktop, a lista fica em uma barra lateral; no mobile, ela abre como uma folha inferior. O detalhe e os formulários aparecem como painéis ou modais.

### Backend

O backend principal é o Supabase, consumido diretamente pelo frontend.

A migration `20260904000500_create_status_workflow.sql` prepara `operator_users`, `report_status_history`, triggers e as RPCs `current_user_is_operator` e `change_report_status`. Toda mudança válida é protegida pelo papel interno e registra motivo, ator e timestamp na mesma transação. Essa migration não foi aplicada nem validada no Supabase remoto.

A única função própria de servidor está em `api/send-push.ts`. Pela convenção da Vercel, ela expõe `POST /api/send-push` e espera um payload de webhook do Supabase. A função:

1. aceita somente `POST`;
2. exige e compara o segredo do webhook;
3. ignora eventos que não sejam `UPDATE` em `reports`;
4. verifica se o status mudou e se a transição pertence ao ciclo autorizado;
5. procura tokens do autor em `push_tokens`;
6. envia uma notificação via Firebase Cloud Messaging.

Esse fluxo está preparado, mas inativo: a migration de `push_tokens`, RLS, cleanup e nomes de variáveis existem localmente. Não há opt-in na UI nem confirmação da migration, webhook, secrets, Firebase ou aparelho nos ambientes externos.

### Aplicativo Android

O diretório `android/` contém um projeto Capacitor com:

- pacote `com.zeladf.app`;
- `minSdkVersion` 24;
- `targetSdkVersion` 36;
- suporte a deep link `com.zeladf.app://`;
- plugins App, Geolocation, Push Notifications, Splash Screen e Status Bar;
- configuração Firebase para o aplicativo Android;
- cópia do build web dentro dos assets nativos.

Os assets web encontrados no Android possuem o mesmo hash dos arquivos equivalentes em `dist`.

## Tecnologias

| Área | Tecnologia |
| --- | --- |
| Interface | React 19 e React DOM 19 |
| Linguagem | TypeScript 5.7 |
| Build | Vite 8 |
| Estilos | Tailwind CSS 4 |
| Mapa | Leaflet e React Leaflet |
| Banco | PostgreSQL por meio do Supabase |
| Autenticação | Supabase Auth |
| Arquivos | Supabase Storage |
| Mobile | Capacitor 8 e Android/Gradle |
| Localização | Capacitor Geolocation |
| Push cliente | Capacitor Push Notifications |
| Push servidor | Firebase Admin / FCM |
| Serverless | Vercel Functions |
| Geocodificação | OpenStreetMap Nominatim |
| Tiles | OpenStreetMap padrão, sem chave |
| Formatação | oxfmt |
| Gerenciador | pnpm |
| Ambiente de criação | Figma Make |

## Estrutura do repositório

```text
ZelaDF/
├── .figma/make/                 # Scripts e configuração do Figma Make
├── .vercel/                     # Vínculo local com projeto Vercel
├── android/                     # Projeto Android Capacitor
├── api/
│   └── send-push.ts             # Função Vercel para push
├── dist/                        # Build web já gerado
├── public/                      # Ícones, privacidade e verificação Google
├── src/
│   ├── auth/                    # Autenticação
│   ├── lib/                     # Supabase, GPS, push e geocodificação
│   ├── App.tsx                  # Componente principal
│   ├── data.ts                  # Tipos e categorias
│   ├── NewReportForm.tsx        # Novo aviso
│   ├── ReportDetail.tsx         # Detalhe do aviso
│   └── ReportList.tsx           # Lista e filtros
├── .env                         # Configuração local do Supabase
├── .env.example                 # Exemplo parcial de ambiente
├── BUGS.md                      # Registro de bugs conhecido
├── PRIVACY.md                   # Retenção e operação de privacidade
├── capacitor.config.ts          # Configuração Capacitor
├── package.json                 # Dependências e scripts
├── supabase-schema.sql          # Referência histórica inicial
├── supabase-auth-migration.sql  # Referência histórica de autoria
├── supabase/                    # Config local, migrations, seed, auditoria e testes
├── tsconfig.json                # TypeScript do frontend
└── vite.config.ts               # Vite, Tailwind e plugins Figma
```

Não foram encontrados:

- histórico Git ou diretório `.git` nesta cópia;
- Supabase CLI ou Docker disponíveis nesta máquina;
- CI/CD declarativa;
- baseline extraído e confirmado do schema remoto;
- README anterior;
- projeto iOS;
- Terraform ou infraestrutura equivalente.

## Modelo de domínio

### Aviso (`reports`)

| Campo | Finalidade |
| --- | --- |
| `id` | UUID do aviso |
| `category` | Categoria do problema |
| `title` | Título público |
| `description` | Detalhes da ocorrência |
| `ra` | Região administrativa |
| `address` | Endereço textual |
| `lat`, `lng` | Coordenadas |
| `photo_url` | URL pública da foto |
| `status` | `aberto`, `andamento` ou `resolvido` |
| `confirmations` | Contador materializado derivado de `votes` por trigger local |
| `author_id` | Identificador interno do autor; não solicitado na consulta pública geral |
| `author_name` | Coluna legada restrita ao valor genérico `Cidadão` pela migration local |
| `created_at` | Data de criação |

### Voto (`votes`)

Um voto pertence a um aviso por FK com `ON DELETE CASCADE`. A migration local `20260905000100` define `votes` como fonte canônica, remove a unicidade histórica por dispositivo e mantém uma confirmação por usuário/aviso. Novas mutações passam por `set_report_vote`, que obtém a identidade da sessão e serializa chamadas por aviso.

O contador em `reports` é reconciliado na migration e depois atualizado por triggers na mesma transação da linha de voto. Ainda não há FK entre `votes.user_id` e `auth.users`; a migration e suas policies não foram aplicadas nem testadas no ambiente remoto.

### Usuário

É mantido pelo Supabase Auth. Metadados Google ou prefixo do e-mail podem compor o rótulo privado do próprio usuário; telefone aparece somente como `Conta por celular`. Nenhum desses dados é usado como assinatura pública do aviso.

### Categoria

Não é persistida no banco. É uma configuração estática no frontend que contém rótulo, ícone, cor, órgão, sigla e telefone.

### Token push

É definida na migration local `20260904000400_create_push_tokens.sql`, com `user_id`, token FCM único, plataforma Android, timestamps e FK para Auth. RLS restringe cada usuário às próprias linhas e um trigger privado evita associação simultânea do mesmo token a contas diferentes. O estado remoto não foi confirmado.

### Operador interno e histórico de status

`operator_users` relaciona uma conta do Supabase Auth ao papel operacional interno do ZelaDF; a migration não cria membros. `report_status_history` registra aviso, status anterior e novo, motivo, ator e timestamp. O frontend consulta o papel por RPC e não recebe o identificador do ator ao exibir o histórico.

## Fluxos principais

### Consulta de avisos

```text
Visitante
-> aplicação React
-> SELECT em reports com bounds do mapa
-> filtros públicos de categoria/status no Supabase; autoria somente por RPC autenticada
-> ordenação por data e limite de 200 linhas
-> mapa, lista e detalhe
```

O mapa carrega tiles padrão do OpenStreetMap. A consulta é refeita 300 ms após o viewport estabilizar e também pelo botão manual. Não há assinatura realtime nem cursor para resultados além do limite.

### Criação de aviso

```text
Usuário autenticado
-> clica em Novo aviso
-> marca um ponto no mapa
-> usuário pode solicitar sugestão; então as coordenadas são enviadas ao Nominatim
-> RA e endereço são sugeridos
-> usuário preenche dados e foto
-> usuário confirma que localização, texto e foto serão públicos
-> foto vai para report-photos/<id da conta>/...
-> aviso é inserido sem autoria/status/contador escolhidos pelo cliente
-> trigger atribui author_id a partir de auth.uid()
-> set_report_vote registra o voto inicial e atualiza o contador na mesma transação
-> interface seleciona o novo aviso
```

Título, RA e endereço são obrigatórios; descrição e foto são opcionais. Formulário e serviço compartilham limites de texto e coordenadas, aceitam apenas JPEG/PNG/WebP de até 5 MiB e derivam a extensão do MIME. A migration local repete constraints no PostgreSQL e limita o bucket, mas ainda não foi aplicada no Supabase remoto. Não existe inspeção do conteúdo binário nem moderação da imagem.

### Confirmação de ocorrência

```text
Usuário autenticado
-> interface incrementa/decrementa o contador otimisticamente
-> set_report_vote recebe o estado desejado
-> RPC serializa o aviso e insere/remove o voto de forma idempotente
-> trigger atualiza reports.confirmations na mesma transação
-> banco devolve voto e contagem canônica
-> interface reconcilia o estado retornado
```

A interface bloqueia uma segunda operação simultânea no mesmo aviso. Em falha, desfaz a atualização otimista e recarrega os dados; a migration local impede DML direto dos papéis cliente e bloqueia alteração direta do contador. O contrato ainda não foi executado sob concorrência real em PostgreSQL local/staging.

### Edição e exclusão

A interface exibe os controles quando RPCs autenticadas, baseadas em `auth.uid()`, marcam o aviso como `isOwner`. A consulta geral recebe somente colunas públicas; `author_id` e `author_name` não são concedidos aos papéis cliente. A migration local protege a mutação no banco, mas ainda não foi aplicada remotamente.

Na exclusão, a policy local permite somente o autor, o banco remove votos/histórico por cascade e o cliente tenta remover a foto pela Storage API. O fluxo permanece dependente da auditoria/aplicação das migrations no Supabase.

### Autenticação

```text
Modal de autenticação
├── e-mail -> envio e verificação de OTP
├── telefone -> cadastro ou login com senha
└── Google -> OAuth com callback web ou deep link nativo
```

A sessão é persistida e renovada pelo cliente Supabase. O Android possui listener para o deep link de callback.

### Mudança de status

```text
Operador interno autenticado
-> banco confirma operator_users pela RPC
-> operador escolhe uma transição e informa motivo de 10 a 500 caracteres
-> change_report_status trava e atualiza o aviso
-> trigger valida novamente a transição
-> histórico com ator e timestamp é gravado na mesma transação
-> frontend recarrega aviso e histórico
```

Todo aviso novo começa como `aberto`. O contrato local permite `aberto -> andamento/resolvido`, `andamento -> aberto/resolvido` e `resolvido -> aberto`; repetição do mesmo estado e `resolvido -> andamento` são rejeitadas. Essa regra é uma decisão conservadora inferida do produto e ainda requer confirmação do negócio e aplicação controlada da migration.

### Notificação push pretendida

```text
Status alterado no Supabase
-> webhook chama POST /api/send-push
-> função consulta push_tokens pelo autor
-> Firebase envia notificação
-> dispositivo recebe o novo status
```

O SQL local define o operador interno como origem autorizada e a função rejeita transições fora do mesmo contrato. O webhook, os operadores, as migrations e os serviços remotos ainda não estão configurados ou confirmados pelo repositório.

## Funcionalidades e situação

| Funcionalidade | Situação | Evidência principal |
| --- | --- | --- |
| Mapa, marcadores e lista | Implementada | `src/App.tsx` |
| Filtros por categoria e status | Implementada | `src/ReportList.tsx` |
| Detalhe do aviso | Implementada | `src/ReportDetail.tsx` |
| Órgão e ligação telefônica | Implementada como orientação | `src/data.ts`, `src/ReportDetail.tsx` |
| Login por e-mail OTP | Implementada no cliente | `src/auth/` |
| Google OAuth | Parcial; depende de configuração externa | `src/auth/AuthProvider.tsx` |
| Telefone e senha | Parcial; confirmação/SMS não é tratada | `src/auth/AuthModal.tsx` |
| Criação de aviso | Implementada | `src/NewReportForm.tsx`, `reportService.ts` |
| Upload e cleanup de foto | Implementados no cliente; bucket/policies remotos não verificados | `reportService.ts`, migration local |
| Votos | Atômicos no código local; migration e concorrência real não validadas | `reportService.ts`, `App.tsx`, migration `20260905000100` |
| Edição e troca de foto | Cliente e autorização local por autor implementados; remoto não validado | `ReportDetail.tsx`, migration `20260905000200` |
| Exclusão | Cliente e policy local por autor implementados; remoto não validado | `reportService.ts`, migration `20260905000200` |
| GPS web | Implementada | `src/lib/gps.ts` |
| GPS Android | Parcial; permissões declaradas, sem teste em aparelho | `AndroidManifest.xml`, `AppConfigTest.java` |
| Geocodificação reversa | Implementada | `src/lib/geocoding.ts` |
| Meus avisos | Implementada como filtro no mobile | `src/App.tsx` |
| Ciclo de status | Preparado localmente; depende de migration, operador e validação de negócio | `ReportDetail.tsx`, `reportService.ts`, `reportStatus.ts`, migration `20260904000500` |
| Push por mudança de status | Preparado, alinhado ao ciclo e inativo; integração externa pendente | `src/lib/push.ts`, `api/send-push.ts`, migrations `20260904000400` e `20260904000500` |
| Modo demonstração/offline | Parcial | `src/lib/reportService.ts` |
| Política de privacidade | Implementada e acessível na UI; validação jurídica/operacional pendente | `public/privacy.html`, `PRIVACY.md` |

## Integrações e dados compartilhados

### Supabase

Recebe autenticação, avisos, votos e fotografias; receberá tokens push somente quando o fluxo for ativado. O frontend utiliza `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

### OpenStreetMap Nominatim

Recebe latitude e longitude somente quando o usuário seleciona “Sugerir endereço”. Há alternativa manual, cache em memória e intervalo mínimo local entre requisições.

### OpenStreetMap

Fornece os tiles e dados visuais do mapa. As áreas navegadas pelo usuário geram requisições externas. O serviço padrão é comunitário, sem SLA, e seu uso deve permanecer moderado e compatível com a política oficial.

### Firebase Cloud Messaging

É usado pela função Vercel para enviar notificações aos tokens associados ao autor do aviso.

### Google

É usado para OAuth, fontes web e configuração Firebase Android.

### Vercel

Hospeda a aplicação web e a função de push; pode processar IP, User-Agent e outros metadados técnicos de requisição.

### Unsplash

Fornece fotografias dos oito avisos de demonstração.

### Órgãos públicos

A comunicação existente é apenas um link telefônico. Nenhuma API ou webhook governamental foi encontrado.

## Estado atual

### Implementado

- Experiência principal baseada em mapa.
- Consulta, filtros e detalhe.
- Formulário de publicação.
- Geocodificação e GPS no código cliente.
- Identidade pública genérica e consultas sem dados de conta.
- Política de privacidade e ciência da publicidade da localização/foto.
- Persistência Supabase.
- Upload de fotos.
- Autenticação e sessão.
- Votos e contador visual.
- Edição e exclusão na interface.
- Layout desktop/mobile.
- Empacotamento Android.
- Fallback demonstrativo.

### Parcialmente implementado

- Notificações push: infraestrutura local pronta, porém desativada e não validada externamente.
- Aplicação e validação remota da autorização por autoria.
- Fluxo de telefone/cadastro.
- GPS e notificações no Android.
- Aplicação remota das constraints e policies locais de validação/Storage.
- Modo offline, que não oferece persistência durável.

### Em desenvolvimento

O código e a documentação indicam trabalho futuro para:

- criar uma ação explícita de opt-in e ativar a integração somente após validar a migration remota;
- exibir push recebido em primeiro plano;
- navegar ao aviso a partir do payload de push e definir a experiência em primeiro plano.

### Problemas conhecidos documentados

`BUGS.md` registra como pendente a ausência de um contador de espera para novo envio do OTP de e-mail. O documento marca como resolvidos o feedback de erro de GPS no navegador e o upload/exibição de fotos.

Essas marcações não comprovam o estado da infraestrutura remota.

### Não foi possível determinar

- Quais scripts SQL foram aplicados no Supabase real.
- Quais policies estão efetivamente ativas.
- Se o bucket existe e quais são suas policies atuais.
- Se Google e telefone estão habilitados no Supabase Auth.
- Se `push_tokens` existe remotamente.
- Se o webhook do Supabase está configurado.
- Se os secrets da Vercel estão configurados.
- Se a aplicação Android foi validada em aparelho físico.
- Se existe deploy público em produção.
- Se há parceria ou processo operacional com órgãos públicos.

## Problemas e inconsistências

### 1. Contrato local de RLS ainda não foi aplicado remotamente

O baseline histórico permite escrita pública em `reports` e `votes`. A migration local `20260905000200` remove essas policies, atribui autoria por `auth.uid()`, limita grants por coluna, adiciona FKs Auth para novas referências e protege Storage, mas não foi aplicada nem comparada com o remoto.

Impactos possíveis:

- alteração de avisos por terceiros;
- falsificação de autoria;
- manipulação de avisos e autoria;
- inserção fora das validações da interface;
- exclusão indevida de votos.

### 2. Referências Auth históricas não foram validadas

As FKs de autor e voto foram adicionadas como `NOT VALID`: novas referências inválidas são bloqueadas, mas linhas antigas podem ser nulas ou órfãs. O tratamento exige auditoria e decisão de retenção antes de validar as constraints.

### 3. Identidades anônimas históricas exigem decisão

O cliente e a migration final exigem autenticação para publicar e votar. Entretanto, avisos com `author_id` nulo e votos com `user_id` nulo podem existir no histórico; `device_id` também permanece por compatibilidade. O repositório não define se esses registros devem ser mantidos, anonimizados ou removidos.

### 4. Confirmações não implementam prioridade real

A interface apresenta as confirmações como uma contagem comunitária, mas a listagem continua ordenada exclusivamente por data. Não há fila, score, SLA ou integração que transforme a contagem em prioridade operacional.

### 5. Ciclo de status depende de ativação e processo operacional

O código local restringe mudanças a operadores internos, define transições, exige motivo e grava histórico atômico. Porém, a migration não foi aplicada remotamente, nenhum operador é provisionado automaticamente e o papel e as regras ainda precisam ser confirmados pelo negócio. Até isso ocorrer, o ciclo não deve ser considerado operacional em produção.

### 6. Fluxo push preparado, mas inativo

- A migration local de `push_tokens` ainda não foi auditada nem aplicada remotamente.
- Não há webhook versionado.
- Uma consulta somente leitura confirmou `PUSH_SECRET` e `FIREBASE_SERVICE_ACCOUNT` como secrets ocultos na Vercel; seus valores e validade não foram verificados, e `PUSH_ENABLED` permanece ausente.
- Tokens inválidos são removidos pela função e o logout limpa o registro local/remoto antes de encerrar a sessão.
- O listener usa o usuário ativo e a migration reatribui um token que reapareça para outra conta.
- Cliente e servidor falham fechados por flags independentes; não existe ainda ação de opt-in na UI.
- O token não é escrito em logs; somente metadados sanitizados são registrados.

### 7. Credencial Firebase removida; rotação externa pendente

Um JSON de service account Firebase contendo chave privada foi encontrado e removido desta cópia local em 2026-09-05, sem leitura ou reprodução do conteúdo. O arquivo não era consumido diretamente pelo código, e `.gitignore`/`.vercelignore` bloqueiam o padrão correspondente.

Como esta cópia não contém `.git`, não é possível determinar se a credencial foi versionada ou publicada. A revogação/rotação também não pôde ser executada sem acesso administrativo ao Firebase. A Vercel lista `FIREBASE_SERVICE_ACCOUNT` como secret oculto de servidor, mas seu valor não foi inspecionado e não há evidência de que já seja uma chave nova. `PUSH_ENABLED` permanece ausente.

### 8. Fluxos Android sem validação em aparelho

O manifesto declara Internet, localização, câmera, leitura de imagens por versão e notificações, com justificativas. Contratos estáticos e testes Java verificam essa configuração, mas GPS, câmera/galeria, OAuth, Splash, StatusBar e push ainda não foram executados em emulador ou aparelho.

### 9. Modo demonstração separado de falhas remotas

O seed local é usado somente quando Supabase não está configurado e aparece identificado na interface. Falhas de consulta configurada preservam a lista anterior, exibem erro e oferecem nova tentativa.

### 10. Votos atômicos dependem de aplicação da migration

A interface desfaz o voto otimista, recarrega em falha e reconcilia a resposta da RPC. O banco local pretendido mantém voto e contador na mesma transação, mas produção continuará no comportamento antigo enquanto a migration não for auditada e aplicada.

### 11. Concorrência de votos ainda não foi executada em banco real

O contrato possui lock por aviso, unicidade por conta e operações incrementais no trigger. Vitest e pgTAP cobrem estrutura e idempotência, mas o pgTAP e chamadas simultâneas em sessões distintas ainda não puderam ser executados por ausência de Supabase CLI/Docker ou staging disponível.

### 12. Upload e ciclo de vida de fotos dependem de policies remotas

Falha de upload impede criação/edição; falha posterior de banco remove o upload novo. Substituição e exclusão tentam remover a foto anterior pela Storage API e apresentam alerta quando o cleanup falha. Objetos antigos sem proprietário ou policies remotas divergentes podem continuar órfãos.

### 13. Validação de conteúdo e limite geográfico ainda indefinidos

Há limites locais explícitos para textos, coordenadas, MIME e tamanho da foto, repetidos em uma migration ainda não aplicada. Não há verificação de assinatura binária, moderação de conteúdo ou restrição das coordenadas ao território do DF; essas duas últimas dependem de decisão de produto.

### 14. Privacidade revisada com dependências externas

A política descreve Supabase, Nominatim, OpenStreetMap, Google, Firebase, Vercel e Unsplash e está acessível pelo cabeçalho, autenticação e publicação. A identidade pública é fixa como `Cidadão`; a consulta geral não solicita campos de autoria e a geocodificação exige ação explícita.

Ainda faltam confirmação jurídica do controlador, bases legais, canal/prazos, auditoria de retenção dos provedores, aplicação da migration de saneamento e implementação server-side da exclusão completa da conta.

### 15. Comunicação sobre o órgão

O formulário e o detalhe apresentam o órgão como sugestão de contato e informam que a confirmação é comunitária. Nenhuma transmissão, protocolo ou prioridade oficial é prometida pela interface atual.

### 16. Indexação pública ainda não definida

O HTML e `.figma/make/site.json` desabilitam indexação de forma explícita. Metadados descritivos e um arquivo de verificação Google permanecem, mas não há domínio canônico confirmado. Uma publicação indexável depende de decisão externa e nova revisão.

### 17. Cobertura automatizada em implantação

Vitest e scripts locais cobrem autenticação, privacidade, validação, serviços de avisos/votos/fotos/status, sanitização, função push simulada, cleanup de tokens inválidos, contratos estáticos Android e a estrutura das migrations; a última execução local aprovou 78 testes em dez arquivos. O contrato pgTAP contém 68 casos de RLS para visitante, autenticado, autor, operador, votos e Storage, mas depende da stack local e ainda não foi executado. Os testes Android genéricos foram substituídos por `DeepLinkUrlTest` e `AppConfigTest` no pacote `com.zeladf.app`; a compilação Gradle e a execução instrumentada dependem de Android SDK e emulador/aparelho, ausentes nesta máquina.

### 18. TypeScript separado para a API

O frontend permanece no `tsconfig.json`; `tsconfig.api.json` verifica separadamente a função Vercel e o código compartilhado usado por ela.

### 19. Escalabilidade

A consulta agora limita os dados aos 200 avisos mais recentes do viewport e aplica filtros no Supabase. Ainda não há cursor, cache compartilhado, realtime ou medição de latência em produção.

## Decisões técnicas identificadas

### Supabase acessado diretamente pelo frontend

**Evidência:** Auth, tabelas e Storage são chamados em `src/lib`.

**Possível motivo:** reduzir backend próprio e acelerar a entrega do MVP. Esse motivo é uma hipótese.

### SPA sem roteador

**Evidência:** mapa, lista, detalhes e modais são controlados por estado em `App.tsx`.

**Possível motivo:** manter o mapa como única superfície principal. Hipótese.

### Aplicação híbrida com Capacitor

**Evidência:** configuração Capacitor e projeto Android completo.

**Possível motivo:** reutilizar o frontend web e acessar GPS, push e recursos nativos. Hipótese.

### Órgãos definidos estaticamente por categoria

**Evidência:** `CATEGORIES` contém órgão e telefone no frontend.

**Possível motivo:** o domínio inicial tem poucas categorias e não necessita administração dinâmica. Hipótese.

### Contador desnormalizado de confirmações

**Evidência:** votos ficam em `votes`; a migration local reconcilia e atualiza `reports.confirmations` por triggers, bloqueando escrita direta do cliente.

**Possível motivo:** manter leitura rápida na lista sem sacrificar a consistência da fonte canônica. O motivo original da desnormalização não está documentado; a correção transacional é uma decisão atual.

### Push orientado por webhook

**Evidência:** a função Vercel só envia quando recebe `UPDATE` com mudança de status.

**Possível motivo:** desacoplar o evento de banco do envio via Firebase. Hipótese.

### Dados demonstrativos como fallback

**Evidência:** `DEMO_REPORTS` é retornado somente sem configuração Supabase; falhas remotas geram erro visível.

**Possível motivo:** permitir demonstração e desenvolvimento sem backend. Hipótese.

### SQL histórico e migrations

**Evidência:** os SQLs históricos foram preservados e protegidos por hashes; dez migrations reconstroem a sequência conhecida e adicionam saneamento de identidade, tokens push, ciclo de status, votos atômicos e autorização, o seed está separado e `supabase/README.md` bloqueia adoção antes da auditoria remota.

**Possível motivo:** preservar o histórico conhecido e adotar evolução ordenada gradualmente. Hipótese.

### Consulta limitada pelo viewport

**Evidência:** o cliente envia bounds, categoria e status ao Supabase, limita a resposta a 200 avisos e usa RPC autenticada para filtrar autoria sem receber `author_id`; votos são buscados somente para os IDs retornados. O orçamento inicial define p95 de até 1,5 s para o carregamento completo, ainda sem medição em produção.

**Possível motivo:** controlar tráfego e renderização conforme a base cresce. Motivo confirmado pela tarefa de evolução.

### Status controlado por operador interno

**Evidência:** a migration local cria o papel interno, a RPC e o histórico; o frontend oferece a operação somente quando o banco confirma o papel, e a função push valida as mesmas transições.

**Possível motivo:** impedir mudanças arbitrárias e criar uma origem auditável para o acompanhamento e as notificações. O motivo original dos três estados não estava documentado; ator e transições ainda dependem de confirmação do negócio.

## Avaliação conceitual

### Clareza do problema

O problema é compreensível: organizar ocorrências urbanas geograficamente e orientar moradores. A documentação institucional é pequena, mas código, metadados e política de privacidade convergem para essa finalidade.

### Adequação da solução

Mapa, foto, localização e confirmação comunitária fazem sentido para visibilidade coletiva. A indicação de órgão também é útil como orientação.

A solução fecha tecnicamente o ciclo local de mudança e auditoria de status, mas ainda não define a operação real nem encaminha ocorrências ou gera protocolos. Enquanto migration, operadores e processo de negócio não forem ativados e validados, o produto continua funcionando principalmente como mural comunitário e catálogo de contatos.

### Coerência da arquitetura

React, Supabase e Capacitor são proporcionais a um MVP pequeno. A arquitetura não é excessivamente distribuída.

O desequilíbrio está nas prioridades: há três métodos de autenticação, Android e push antes de políticas de dados seguras, moderação e ciclo completo do aviso.

### Classificação do estágio

O projeto parece um **MVP funcional em evolução**, não um sistema pronto para produção. Essa avaliação se baseia na existência de fluxos reais e build mobile, combinada com lacunas de autorização, operação, testes e infraestrutura reproduzível.

## Riscos

| Severidade | Risco | Possível impacto |
| --- | --- | --- |
| Crítica | Chave Firebase removida localmente, mas sem revogação ou auditoria histórica confirmadas | Controle indevido do projeto Firebase caso uma cópia antiga continue válida |
| Alta | Migration local de RLS ainda não aplicada/auditada no remoto | Alteração, fraude ou perda de dados no estado remoto desconhecido |
| Alta | FKs Auth históricas ainda não validadas | Referências órfãs e comportamento divergente entre ambientes |
| Alta | Identidade de avisos e estado remoto dos votos não verificados | Perda de confiança nos avisos e contagens |
| Alta | Grants/policies remotos de colunas internas não verificados | Reidentificação e risco de privacidade se o remoto divergir |
| Média | Fluxos Android sem teste em aparelho | GPS, OAuth, foto ou push falharem apesar da configuração local |
| Baixa | Modo demo sem persistência | Alterações locais desaparecem ao recarregar |
| Média | Migration atômica de votos não aplicada/testada no banco | Produção pode manter divergência entre votos e confirmações |
| Média | Sem moderação | Conteúdo abusivo, impróprio ou fraudulento |
| Média | Limite por viewport sem cursor | Avisos antigos podem exigir maior aproximação do mapa |
| Média | Telefones estáticos | Orientação desatualizada ao cidadão |

## Perguntas ainda abertas

### Negócio

- O produto é um mural comunitário ou pretende gerar encaminhamento oficial?
- Quem compõe a operação interna, provisiona operadores e revisa suas ações?
- As transições locais e o motivo obrigatório representam o processo de negócio desejado?
- Há parceria prevista ou existente com órgãos públicos?
- O que “prioridade” significa operacionalmente?
- Quem modera relatos falsos, duplicados ou abusivos?

### Arquitetura

- Qual é o schema realmente instalado no Supabase de produção?
- Existem policies diferentes das fornecidas nos SQLs?
- `push_tokens`, webhook e variáveis Vercel já existem externamente?
- A credencial Firebase removida desta cópia chegou a ser versionada/compartilhada e já foi revogada?
- Qual é o ambiente e domínio considerados produção?

### Requisitos

- Linhas anônimas históricas de voto devem continuar contando ou ser removidas antes da FK com Auth?
- O serviço deve aceitar ocorrências fora do DF?
- Quais são os limites e formatos permitidos para fotos?
- Quem é formalmente o controlador e qual canal atenderá pedidos de titulares?
- Quais bases legais e prazos formais serão aprovados para cada tratamento?
- Quando a exclusão/exportação de conta documentada será implementada no servidor?

### Evolução

- Haverá painel de gestão de operadores e moderação além do controle no detalhe?
- O projeto pretende suportar iOS ou PWA?
- Está planejada integração com canais oficiais?
- Qual volume de usuários e avisos é esperado?
- Push é requisito de lançamento ou funcionalidade futura?

## Próximos passos recomendados

### Prioridade alta

#### 1. Concluir a rotação da credencial Firebase

**Problema:** o arquivo local foi removido, mas a exposição histórica e a revogação da chave não foram confirmadas.

**Impacto:** terceiros podem obter acesso administrativo ao Firebase se a chave tiver sido exposta.

**Recomendação:** auditar o repositório original e os logs de uso, revogar a chave anterior no Firebase e substituir o secret de servidor na Vercel por uma nova credencial. Manter `PUSH_ENABLED` ausente até validar o fluxo, sem restaurar arquivos de chave no projeto.

#### 2. Auditar e aplicar autorização/RLS

**Problema:** o contrato local corresponde às regras de autoria, mas o baseline e as policies remotas não foram auditados nem migrados.

**Impacto:** enquanto o remoto não for alinhado, chamadas diretas podem continuar contornando os controles locais.

**Recomendação:** auditar grants/policies e referências históricas, aplicar `20260905000200` em staging, executar os 68 casos pgTAP, validar as FKs em uma migration posterior e testar o frontend com visitante, conta comum, autor, não autor e operador.

#### 3. Tornar votos e confirmações atômicos

**Problema:** a solução local está implementada, mas a migration ainda não foi auditada/aplicada e o teste concorrente real não foi executado.

**Impacto:** o ambiente remoto pode continuar sujeito a concorrência, fraude e divergência de contagem.

**Recomendação:** auditar votos históricos, aplicar `20260905000100` em staging, executar pgTAP e concorrência com sessões distintas e só então promover frontend/migration de forma coordenada.

#### 4. Definir o ciclo de vida do aviso

**Problema:** o ciclo técnico local foi definido, mas não há confirmação do processo de negócio, provisionamento protegido de operadores ou implantação remota; moderação continua ausente.

**Impacto:** avisos permanecem sem operação real, apesar de o código já possuir autorização e trilha de auditoria preparadas.

**Recomendação:** validar atores e transições com o negócio, auditar e aplicar a migration em staging, provisionar operadores por canal privilegiado e executar os testes de RLS antes de ampliar o push.

#### 5. Concluir ou desativar temporariamente o push

**Problema:** migration, RLS e ciclo local foram preparados, mas opt-in, webhook, secrets, aplicação remota, permissões e aparelho não foram validados.

**Impacto:** falha funcional, associação incorreta de token e possibilidade de abuso.

**Recomendação:** manter as flags desativadas, auditar/aplicar a migration em staging, implementar opt-in explícito, configurar o webhook autenticado e validar logout, troca de conta, invalidação e recebimento em aparelho antes de ativar produção.

#### 6. Operacionalizar privacidade e exclusão de conta

**Problema:** minimização, política e retenção estão definidas localmente, mas migration, RLS, canal jurídico e exclusão completa ainda não operam no ambiente remoto.

**Impacto:** valores históricos ou identificadores internos podem continuar acessíveis e pedidos de titulares dependeriam de operação manual.

**Recomendação:** confirmar controlador/bases legais, auditar provedores, aplicar o saneamento após auditoria do schema e implementar o fluxo idempotente de exclusão descrito em `PRIVACY.md`.

### Prioridade média

#### 7. Criar migrations reproduzíveis

Dez migrations ordenadas, configuração local, seed separado, auditoria somente-leitura e runbook por ambiente estão versionados. O contrato estático passou, mas ainda é necessário capturar/comparar o baseline remoto, sanear/validar FKs e executar `db reset` quando CLI/Docker estiverem disponíveis. A aplicação de RLS e a ativação externa do push continuam nas tarefas específicas.

#### 8. Aplicar e validar remotamente o tratamento de falhas

O tratamento local, a preservação de formulários e o rollback visual estão implementados. Validar os cenários contra Supabase após corrigir RLS e observar falhas de cleanup.

#### 9. Ativar validações no banco e definir moderação

Auditar e aplicar a migration local, decidir se haverá verificação de assinatura binária/moderação e restringir coordenadas ao DF somente se essa for uma regra de negócio confirmada.

#### 10. Monitorar o ciclo de vida das fotos

Cleanup por URL pública está implementado. Considerar persistir o caminho do objeto em coluna própria e criar rotina administrativa para objetos antigos/órfãos após auditar o bucket remoto.

#### 11. Corrigir a configuração Android

Instalar/configurar o Android SDK e validar OAuth/deep link, GPS, câmera/seleção de foto, Splash, StatusBar e push em emulador ou aparelho nas versões suportadas.

#### 12. Adicionar testes reais

Cobrir:

- policies RLS;
- criação e edição;
- voto concorrente;
- exclusão e cleanup;
- autenticação;
- geocodificação com falhas;
- componentes e fluxos React;
- função Vercel;
- testes instrumentados Android com o pacote correto.

#### 13. Preparar crescimento

Concluído no código local: consulta por viewport, limite de 200 avisos, filtros no banco, votos restritos aos IDs carregados, debounce de 300 ms e refresh manual. A migration de índices ainda precisa de aplicação controlada e medição remota.

### Prioridade baixa

#### 14. Alinhar textos e comportamento

Concluído no estado atual: os textos descrevem sugestão de contato e contagem comunitária, sem prometer encaminhamento ou prioridade oficial.

#### 15. Alinhar SEO, indexação e domínio

A distribuição atual está coerentemente marcada como `noindex`. Antes de indexação pública, confirmar domínio, endereço de contato, verificação Google e URLs de produção.

#### 16. Organizar documentação e artefatos

Documentar setup, ambientes, deploy, Supabase e Android. Definir se `dist`, assets Android gerados, caches e configurações locais devem permanecer no versionamento.

#### 17. Decidir plataformas suportadas

Web responsiva e Android são as plataformas atuais. PWA e iOS exigem uma nova decisão e implementação antes de serem anunciados como suportados.

## Sequência sugerida de evolução

```text
1. Revogar credencial exposta
2. Confirmar regras de negócio e processo de provisionamento dos operadores
3. Corrigir schema/RLS e validar os votos atômicos em staging
4. Criar migrations e ambientes reproduzíveis
5. Corrigir erros, validações e privacidade
6. Aplicar e validar o ciclo de status; definir moderação
7. Concluir Android e push
8. Adicionar testes e observabilidade
9. Medir consultas por viewport e decidir se cursor/realtime serão necessários
10. Considerar integrações oficiais
```

## Mapa mental

```text
ZelaDF
├── Objetivo
│   └── Tornar problemas urbanos do DF visíveis e orientar cidadãos
├── Usuários
│   ├── Visitantes
│   ├── Cidadãos autenticados
│   └── Operadores internos preparados localmente
├── Frontend
│   ├── React + Tailwind
│   ├── Leaflet
│   ├── Mapa e lista
│   ├── Filtros
│   ├── Detalhe
│   ├── Novo aviso
│   └── Autenticação
├── Backend
│   ├── Supabase Auth
│   ├── PostgreSQL
│   ├── Storage
│   └── Vercel Function
├── Dados
│   ├── Reports
│   ├── Votes canônicos e contador transacional preparados localmente
│   ├── Users
│   ├── Operators e histórico de status preparados localmente
│   ├── Photos
│   └── Push tokens preparados localmente
├── Mobile
│   └── Capacitor Android
├── Integrações
│   ├── Nominatim
│   ├── OpenStreetMap
│   ├── Firebase
│   ├── Google
│   └── Unsplash
├── Lacunas
│   ├── Ativação operacional do status e moderação
│   ├── Integração com órgãos
│   ├── Push completo
│   ├── Testes de banco e concorrência real
│   └── Infraestrutura reproduzível
└── Riscos principais
    ├── Credencial privada
    ├── RLS remota não auditada
    ├── Migration de votos ainda não aplicada
    ├── Privacidade
    └── Permissões Android
```

## Grau de confiança desta análise

| Área | Confiança | Motivo |
| --- | --- | --- |
| Objetivo e frontend | Alta | Confirmados pelo código e política de privacidade |
| Arquitetura local | Alta | Módulos e configurações foram inspecionados |
| Modelo de banco pretendido | Alta | Confirmado pelos scripts SQL |
| Banco e Auth em produção | Baixa | O estado remoto não foi acessado |
| Integrações de mapa | Alta | Chamadas explícitas no código |
| Push | Média | Código existe, mas infraestrutura externa não foi confirmada |
| Android | Média | Projeto inspecionado, sem compilação ou teste em aparelho |
| Processo operacional | Média | Parte depende de inferência, pois não há documentação de negócio |
| Segurança do código local | Alta | Policies e verificações estão explicitamente definidas |
| Prontidão para produção | Média-alta | Há evidências suficientes das lacunas, mas não da infraestrutura remota |

## Validação realizada durante a análise

- Inventário dos arquivos e diretórios, incluindo configurações ocultas.
- Leitura do frontend, função serverless, scripts SQL e projeto Android.
- Comparação entre documentação, interface, serviços e schema.
- Validação local mais recente com TypeScript, 78 testes Vitest, build Vite e sincronização Capacitor Android após a autorização/RLS em 2026-09-05. O bundle principal ficou em 629,57 kB e manteve o aviso acima de 500 kB; o pgTAP com 68 casos e a comparação remota não foram executados.
- Contrato estático do Supabase aprovado; `db reset`, pgTAP e comparação remota não foram executados por ausência de CLI/Docker e acesso ao banco ativo.
- Busca por TODOs, funcionalidades incompletas e integrações externas.
- Verificação de que os assets web em `dist` e no Android correspondem.
- Execução de `tsc --noEmit`, concluída sem erros para o escopo atual do `tsconfig.json`.

O estado corrente das validações locais, builds, deploy e limitações externas está consolidado em `STATUS.md`. Migrations e testes contra serviços remotos não devem ser inferidos a partir da configuração local.
