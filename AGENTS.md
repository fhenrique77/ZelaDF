# ZelaDF - Instruções para Agentes

## Antes de começar qualquer tarefa

Sempre:

1. Leia `AGENTS.md`.
2. Leia `CONTEXT.md`.
3. Leia `STATUS.md`.
4. Leia `TODO.md`.
5. Consulte `DECISIONS.md` quando a tarefa envolver arquitetura.
6. Consulte `PRIVACY.md` quando a tarefa envolver conta, autoria, localização, fotos, logs, push ou provedores externos.
7. Leia os arquivos de código relacionados à tarefa.
8. Pesquise no projeto antes de concluir que uma funcionalidade não existe.

O código atual é a principal fonte de verdade. A documentação pode estar desatualizada.

Use estes rótulos ao registrar conclusões:

- **Confirmado no código:** observado diretamente na implementação local.
- **Documentado:** descrito em um documento, sem confirmação suficiente no código.
- **Inferência:** conclusão razoável, mas não confirmada.
- **Estado externo não verificável:** depende de Supabase, Firebase, Vercel, Google, Play Console, domínio ou outro ambiente remoto.

## Ambiente de desenvolvimento

Este é um projeto React + Vite + Tailwind CSS. O servidor Vite usa `$PORT` (padrão `8443`); verifique se já está ativo antes de iniciar outro. Alterações em `src/` usam hot reload.

## Regras gerais

- Faça alterações pequenas, focadas e compatíveis com os padrões existentes.
- Não modifique arquivos não relacionados ao pedido.
- Não remova funcionalidades existentes sem necessidade explícita.
- Não altere contratos de dados sem verificar frontend, SQL, Supabase e demais consumidores.
- Não altere autenticação ou autorização sem analisar RLS, policies e autoria.
- Não trate verificações feitas somente no frontend como segurança real.
- Preserve compatibilidade web e Android quando aplicável.
- Evite dependências novas quando a stack existente resolver o problema.
- Não exponha secrets no código cliente, logs, documentação ou respostas.
- Nunca utilize `service_role` no frontend.
- Não coloque credenciais em arquivos versionados.
- A chave `anon` do Supabase não substitui RLS.
- Proteja no banco toda operação que dependa de autoria.
- Não envie nem aceite `author_id`, `author_name`, `status` ou `confirmations` na criação pelo cliente; o banco atribui autoria e valores controlados.
- Consulte autoria somente por `get_my_report_ids` ou `get_my_reports`; não libere `author_id`/`user_id` para os papéis cliente.
- Grave fotos novas em `report-photos/<auth-user-id>/...`; preserve a verificação de pasta e `owner_id` nas policies de Storage.
- Trate `votes` como fonte canônica das confirmações. Use somente a RPC `set_report_vote`; o cliente não deve escrever `votes` nem `reports.confirmations` diretamente.
- Preserve `operator_users` como papel interno do ZelaDF; nunca o descreva como agente público sem integração formal comprovada.
- Altere status somente pela RPC `change_report_status`, com motivo obrigatório; não contorne o trigger nem grave histórico pelo cliente.
- Torne operações relacionadas atômicas quando consistência for necessária.
- Não confie exclusivamente em validações do frontend.
- Preserve `Cidadão` como única identidade pública; dados da conta servem somente para autenticação e autoria interna.
- Não volte a selecionar ou exibir `author_name`, e-mail, telefone ou metadados Auth nos avisos públicos.
- Mantenha GPS, geocodificação e push opcionais e iniciados por ação do usuário.
- Não execute migrations, deploys ou alterações remotas sem pedido explícito.

## Segurança

Antes de modificar recursos relacionados a dados, verifique:

- Supabase Auth;
- Row Level Security e policies;
- autoria, roles e transições de status;
- votos e contador de confirmações;
- uploads, bucket e policies de Storage;
- funções serverless, webhooks e secrets;
- exposição de dados pessoais.
- inventário, retenção e exclusão descritos em `PRIVACY.md`.

Nunca use apenas esta condição no frontend como autorização:

```text
user.id === authorId
```

Ela pode controlar a interface, mas a autorização real deve existir no banco ou backend.

Uma credencial sensível de service account Firebase foi encontrada e removida desta cópia local em 2026-09-05 sem leitura ou reprodução do conteúdo. A cópia não contém `.git`, e a revogação/rotação no Firebase não pôde ser confirmada; portanto, trate a chave anterior como potencialmente exposta e nunca restaure o arquivo. A Vercel lista `FIREBASE_SERVICE_ACCOUNT` como secret de servidor, mas seu valor e sua rotação não foram inspecionados. Não abra nem imprima valores de `.env`, arquivos de service account ou configurações com chaves; inspecione apenas nomes e presença quando necessário.

## Supabase

Antes de alterar banco ou segurança:

- leia `supabase/README.md` e identifique o ambiente de destino;
- analise `supabase-schema.sql`, `supabase-auth-migration.sql` e `supabase/migrations/`;
- confira o contrato usado em `src/lib/reportService.ts`, `src/lib/reportStatus.ts` e `src/lib/push.ts`;
- identifique schema, constraints, relacionamentos, triggers e policies esperados;
- verifique o impacto em Auth e Storage;
- diferencie SQL local de estado remoto não verificável.

O baseline em `supabase/migrations/` foi reconstruído dos SQLs históricos, não extraído do projeto remoto. Nunca execute `db push` nem `migration repair` antes de comparar o schema real pelo procedimento de `supabase/README.md`. Nunca use `db reset --linked` em produção nem aplique `supabase/seed.sql` fora de ambiente local/descartável.

Não modifique silenciosamente SQLs históricos. Se migrations estruturadas forem adotadas, mudanças futuras devem ser novas migrations.

## Frontend

O frontend usa React, TypeScript, Vite, Tailwind e Leaflet. Antes de alterar um fluxo:

- localize o componente, serviço e tipos envolvidos;
- verifique estado local e o contexto de autenticação;
- confira dependências diretas do Supabase;
- valide desktop e mobile;
- mantenha regras críticas fora da interface.

Arquivos de entrada: `src/main.tsx`, `src/App.tsx` e `src/index.css`. Não há roteador; mapa, painéis e modais são controlados por estado.

## Android e Capacitor

Ao modificar comportamento nativo, verifique:

- `capacitor.config.ts` e `android/`;
- `PLAY_STORE.md` quando a tarefa envolver build de release, teste interno ou publicação;
- `AndroidManifest.xml`, Gradle e plugins Capacitor;
- permissões, deep links, Firebase e Google OAuth;
- GPS, seleção/captura de foto e push;
- sincronização dos assets web com o projeto Android.

Mudanças no frontend podem exigir novo build web e sincronização do Capacitor. Essas operações geram arquivos; execute-as apenas quando fizerem parte do pedido.

## Integrações externas

Integrações confirmadas ou preparadas: Supabase, Nominatim, tiles padrão do OpenStreetMap, Firebase, Google e Vercel. Unsplash é usado nos dados de demonstração.

Antes de alterar uma integração, verifique timeout, erros, limites, dados enviados, privacidade e comportamento offline. Nomes e telefones de órgãos são orientação local; não existe integração governamental confirmada.

## Comandos do projeto

| Objetivo | Comando | Situação |
| --- | --- | --- |
| Instalar | `pnpm install --prefer-offline --no-frozen-lockfile` | Instala as dependências do projeto |
| Desenvolvimento | `pnpm run dev` | Servidor normalmente já iniciado pelo ambiente |
| Build web | `pnpm run build` | Declarado em `package.json` |
| Preview | `pnpm run preview` | Declarado em `package.json` |
| Formatação | `pnpm run format` | Declarado em `package.json` |
| TypeScript frontend | `pnpm run typecheck` | Inclui `src/` e configuração Vite |
| TypeScript API | `pnpm run typecheck:api` | Inclui `api/` e código compartilhado usado pela função |
| Testes em desenvolvimento | `pnpm run test` | Vitest em modo interativo |
| Testes automatizados | `pnpm run test:run` | Vitest em execução única, incluindo contratos estáticos Android |
| Contrato RLS | `supabase test db` | Requer Supabase CLI, stack local e baseline estabilizado; ainda não validado neste projeto |
| Iniciar Supabase local | `supabase start` | Requer Supabase CLI e Docker; indisponíveis nesta máquina na última verificação |
| Reconstruir banco local | `supabase db reset --local` | Destrutivo somente para o banco local; aplica migrations e seed |
| Sincronizar Android | `pnpm exec cap sync android` | Executar na raiz após build web |
| Teste JVM Android | `.\gradlew.bat testDebugUnitTest` | Executar em `android/`; requer Android SDK |
| APK de debug | `.\gradlew.bat assembleDebug` | Executar em `android/`; requer Android SDK |
| Testes instrumentados | `.\gradlew.bat connectedDebugAndroidTest` | Executar em `android/`; requer SDK e emulador/aparelho conectado |
| Inspecionar deploy Vercel | `npx --yes vercel@latest deploy --dry` | Requer projeto vinculado e autenticação Vercel |
| Deploy Vercel em produção | `npx --yes vercel@latest deploy --prod --yes` | Publica e atualiza o alias de produção |

O Capacitor CLI e o Gradle wrapper existem, mas não há scripts Android em `package.json`. Os comandos Gradle devem partir de `android/`; sem Android SDK configurado eles falham antes da compilação. O projeto web vinculado usa a CLI Vercel para publicação. Não execute deploy sem autorização explícita.

## Antes de concluir uma tarefa

Quando aplicável:

1. Execute `pnpm run typecheck` e `pnpm run typecheck:api`.
2. Execute testes existentes e declare as lacunas de cobertura; o teste RLS não conta como aprovado enquanto `supabase test db` não passar em ambiente isolado.
3. Execute o build web se a alteração afetar o frontend e geração de artefatos estiver autorizada.
4. Verifique erros de compilação/formatação.
5. Avalie impacto Android.
6. Revise todos os arquivos alterados.
7. Confirme que nenhum secret entrou nas alterações.

Não afirme que algo funciona sem validação. Use “Implementado, mas não validado em ambiente X” quando necessário.

## Atualização da documentação

Depois de uma mudança relevante:

- atualize `STATUS.md` para refletir o estado atual;
- atualize `TODO.md` quando uma tarefa for concluída, criada ou repriorizada;
- atualize `DECISIONS.md` quando houver nova decisão arquitetural;
- atualize `CONTEXT.md` somente após mudança estrutural importante.

Não transforme esses documentos em diário de desenvolvimento e não replique o README inteiro.
