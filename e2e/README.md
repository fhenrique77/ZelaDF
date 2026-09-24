# Testes críticos no navegador

**Confirmado na execução local em 2026-09-09:** 26 testes Playwright aprovados, sem retries: 13 cenários em Chromium desktop (1440 × 900) e os mesmos 13 com emulação Pixel 7. Também passaram 133 testes Vitest, TypeScript frontend/API/E2E e build web.

## Executar

Com as dependências do projeto instaladas, instale o navegador uma vez:

```powershell
npx.cmd playwright install chromium
npm.cmd run typecheck:e2e
npm.cmd run test:e2e
```

Para consultar o relatório ou executar somente um layout:

```powershell
npm.cmd run test:e2e:report
npm.cmd run test:e2e -- --project=mobile-chromium
```

O Playwright inicia e encerra um Vite exclusivo em `127.0.0.1:4178`. A porta precisa estar livre; um servidor existente não é reutilizado. Não é preciso iniciar `npm run dev`. Em ambiente com sandbox, o processo precisa ter acesso ao cache do Chromium instalado; ausência de acesso ao executável é falha de infraestrutura, não resultado de teste do app.

## Isolamento e evidências

`server.mjs` ignora arquivos `.env`, remove variáveis `VITE_*` herdadas e fornece somente configuração sintética. `fixtures.ts` intercepta Auth, PostgREST, Storage, geocodificação, tiles e fontes. Chamadas externas inesperadas são bloqueadas e fazem o teste falhar. Push permanece desativado. Nenhum usuário, aviso, voto, foto ou solicitação real é criado.

O SDK Supabase, os componentes React e o mapa Leaflet executam no navegador real; as respostas de rede são simuladas. Os tokens das fixtures são sintéticos e não autorizam acesso a nenhum serviço real. Cada teste recebe dados e contexto de navegador próprios.

O relatório fica em `playwright-report/index.html`. Screenshots de detalhe e protocolo ficam em `test-results/`; falhas preservam screenshot e trace. Esses diretórios são ignorados no Git e no deploy. As capturas usam dados fictícios, tiles substituídos e fontes locais; não constituem comparação visual automatizada com um baseline.

## Cobertura

**Regressão adicionada em 2026-09-10:** `filtro Meus avisos indisponível recupera o mapa mobile` passou no Chromium mobile com usuário autenticado e RPC simulando `PGRST202`. Verifica aviso explicativo, filtro desligado e retorno da lista geral. O cenário é exclusivo do mobile, onde o controle existe; a suíte completa não foi reexecutada nesta correção.

| Cenário | Verificação |
| --- | --- |
| Visitante | Mapa, filtro de status, detalhe, identidade pública `Cidadão`, consulta sem colunas privadas e ausência de rolagem horizontal no detalhe |
| Contribuição anônima | Publicação e voto exigem login, sem enviar mutações |
| Autenticação | Falha e nova tentativa de envio de OTP, verificação de código e logout |
| Indisponibilidade | Erro de leitura visível, recuperação e ausência de dados demonstrativos durante falha |
| Votos | Bloqueio durante resposta lenta, rollback, nova tentativa, remoção e uso exclusivo da RPC |
| Novo aviso | Seleção no mapa, geocodificação somente por ação, endereço manual após falha, consentimento, rejeição de SVG, upload de PNG na pasta da conta e payload sem campos controlados pelo banco |
| Autor | Edição, confirmação antes de excluir e limpeza da foto somente após o banco retornar a linha excluída |
| Não autor | Ausência de edição/exclusão/status na interface, mantendo voto disponível |
| Operador | Motivo obrigatório, transição pela RPC e histórico retornado |
| Solicitação de exclusão | Consentimento, fundo inerte, navegação por teclado, retorno do foco ao fechar por Escape/botão, protocolo e recuperação do pedido sem nova criação |
| Falha na solicitação | Não inventar protocolo e permitir nova tentativa |
| Privacidade web | Navegação política → página de exclusão → app e acesso ao login dentro do diálogo |
| GPS | Ausência de solicitação automática, permissão negada reconhecida e mapa utilizável |

Todas as execuções também verificam ausência de exceções JavaScript não tratadas. Os erros provocados pelos testes aparecem no logger como falhas sintéticas esperadas.

## Correções encontradas

- `gps.ts`: reconhecer códigos do objeto `GeolocationPositionError`, que não precisa ser uma instância de `Error`. Cinco regressões Vitest cobrem negativa, timeout e indisponibilidade, inclusive mensagens localizadas. Referência: [códigos de erro de geolocalização](https://developer.mozilla.org/en-US/docs/Web/API/GeolocationPositionError/code).
- `AccountDeletion.tsx`: fechar o diálogo nativo antes de desmontá-lo para restaurar o foco ao botão que o abriu; regressão validada nos dois layouts.

## Limites para lançamento

Esta suíte valida o comportamento web e os pedidos enviados pelo cliente. Não certifica RLS, grants, triggers, concorrência real, entrega de OTP, OAuth Google, telefone/SMS, Storage remoto ou exclusão efetiva de conta. Os 84 contratos pgTAP e a validação de staging continuam pendentes.

A emulação mobile não executa Android/Capacitor: câmera, permissões nativas, GPS real, push, deep links, ciclo de vida e instalação do AAB precisam de aparelho/emulador. Também faltam testes de rede realmente desconectada, substituição de foto no navegador, GPS permitido/indisponível no navegador e outros motores/tamanhos de tela. O build web desta revisão não foi sincronizado novamente com Android nem publicado; os APKs de 2026-09-08 não contêm as duas correções acima.

Referências de implementação: [interceptação de APIs no Playwright](https://playwright.dev/docs/mock) e [servidor de testes](https://playwright.dev/docs/test-webserver).
