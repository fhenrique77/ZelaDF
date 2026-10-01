# Avaliação de segurança do site — 2026-09-30

Alvo: https://zela-df.vercel.app/. Testes de baixo volume no deploy público e na API Supabase usada pelo bundle publicado. Não houve teste de carga, alteração de avisos/contas de produção nem leitura de dados privados. O bundle remoto difere do build local atual; a revisão do código local serve como apoio, não como prova do código implantado.

## Achados

### 1. Site pode ser incorporado por outro domínio — prioridade média

**Confirmado no site:** home, política e página de exclusão não enviam `Content-Security-Policy` com `frame-ancestors` nem `X-Frame-Options`. Um Chromium carregou a home em iframe de uma página de outra origem e renderizou o título ZelaDF. Isso permite preparar uma página de clickjacking sobre o app. Não foi demonstrado um clique sobre sessão autenticada, portanto o efeito em publicação, voto ou exclusão ainda é potencial.

**Correção sugerida:** configurar `Content-Security-Policy: frame-ancestors 'none'` no deploy web (ou `'self'` se houver incorporação legítima), com `X-Frame-Options: DENY` para navegadores antigos. Validar a web e o Android antes de publicar. Referências: [defesa de clickjacking da OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Clickjacking_Defense_Cheat_Sheet.html) e [configuração de cabeçalhos da Vercel](https://vercel.com/docs/project-configuration/vercel-json).

### 2. Cabeçalhos de defesa do navegador ausentes — prioridade baixa

**Confirmado no site:** home, páginas estáticas, bundle e função push não enviam CSP, `X-Content-Type-Options`, `Referrer-Policy` ou `Permissions-Policy`. HSTS está presente. A ausência de CSP aumenta o impacto de eventual XSS, mas nenhum XSS foi demonstrado: um aviso sintético com `img onerror`, inserido apenas na resposta interceptada pelo navegador, apareceu como texto e não criou elemento HTML nem executou o código.

**Correção sugerida:** adicionar CSP gradualmente, conferindo Supabase, OpenStreetMap, Nominatim e fontes Google. Adicionar `nosniff` e políticas explícitas de referência/permissões. Preservar o Referer de origem necessário aos tiles OpenStreetMap.

### 3. Advisories em dependências locais de servidor — verificar antes de ativar push

**Confirmado no lockfile local por `pnpm audit --prod`:** seis advisories (três high, duas moderate, uma low). Todos os caminhos observados passam por `firebase-admin`, usado pela função push: `@grpc/grpc-js` 1.14.4, `brace-expansion` 2.1.4 e `uuid` 9.0.1. As correções indicadas pelo audit são, respectivamente, 1.14.5+, 2.1.7+ e 11.1.1+. Referências: [gRPC](https://github.com/advisories/GHSA-m9gg-hp2v-232j), [brace-expansion](https://github.com/advisories/GHSA-qhr7-859c-m2p7), [uuid](https://github.com/advisories/GHSA-w5hq-g745-h8pq).

**Limite:** a função push respondeu 503 para GET e POST vazio, como recurso desativado. Não foi comprovado que essas condições são exploráveis no deploy atual. Atualizar a árvore de dependências, rodar os testes e conferir o pacote da função antes da ativação.

## Controles que resistiram aos testes

- **Confirmado no site:** `/.env`, `/.git/config`, os caminhos conhecidos de código fonte, SQL e documentação interna testados, e o source map do bundle responderam 404. O caminho `/api/v1/reports` no projeto web também respondeu 404, compatível com a API FastAPI separada.
- **Confirmado no bundle publicado:** um JWT incorporado com papel `anon`; nenhum JWT de papel administrativo, marcador de chave privada ou valor com formato `sb_secret_...` foi identificado. A chave pública é esperada no cliente e depende de RLS.
- **Confirmado na API de produção com o papel `anon`:** leitura de uma linha de aviso público respondeu 200; seleção de `author_id`, `author_name`, `votes.user_id`, fila de exclusão, operadores e histórico privado respondeu 401/42501. O schema privado não foi exposto pela Data API (406/PGRST106). Seleção `*` e relação aninhada com `votes.user_id` também foram negadas.

## Limites e próximos testes

A revisão automática rejeitou POSTs a RPCs de produção, inclusive a de solicitação de exclusão, porque poderiam ter efeito colateral. Eles não foram executados. É necessário testar autorização entre duas contas, criação/edição/exclusão, votos, Storage e RPCs de mutação em staging sintético e, depois, fazer smoke tests de produção com um procedimento explicitamente aprovado. Os 66 ensaios integrados de staging registrados em STATUS.md não substituem essa validação de produção.

Esta avaliação é pontual; não certifica ausência de outras falhas, integridade de provedores externos ou disponibilidade sob carga.

## Correções locais após a avaliação — 2026-09-30

- **Confirmado no código:** `vercel.json` aplica CSP com `frame-ancestors 'none'` e `X-Frame-Options: DENY` a todas as rotas web, além de `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` e `Permissions-Policy`. A CSP permite explicitamente Supabase, tiles OpenStreetMap, Nominatim, fontes Google, imagens de demonstração e a API isolada de staging. O Referrer-Policy preserva a origem enviada aos tiles.
- **Confirmado por execução local:** o build web renderizou em Chromium com essa CSP; a incorporação por iframe de outra origem foi bloqueada na home, privacidade, exclusão e termos. Os 41 fluxos Playwright desktop/mobile passaram, com três skips intencionais; 171 Vitest e três typechecks passaram.
- **Confirmado no lockfile local:** `firebase-admin` 14.5.0, `@grpc/grpc-js` 1.14.5, `brace-expansion` 2.1.7 e `uuid` 11.1.1 na cadeia `gaxios` de produção. `pnpm audit --prod` retornou zero advisories. O override restrito a `gaxios@6.7.1>uuid` exige regressão da função push antes de sua ativação; a função permanece desativada.
- **Estado externo não verificável:** as correções ainda não foram implantadas no site publicado. O dry-run da Vercel CLI não concluiu porque a varredura local recebeu `EPERM` em `.pytest_cache`. Faltam validação no alias de produção e teste em aparelho Android; a política de cabeçalhos HTTP do site web não é aplicada aos arquivos locais do Capacitor.

### Publicação e verificação — 2026-09-30

- **Confirmado externamente:** Vercel produção `dpl_74kV3oEAURJZZzVLELWBtg2PY7FF`, alias https://zela-df.vercel.app. O preview passou no build; o dry-run de uma cópia limpa incluiu `vercel.json` e 54 arquivos de deploy. Deployment anterior `dpl_AqrpQp2nC8UfFbq6cZqcNAcyYmvu` preservado como opção de rollback.
- **Confirmado no site:** home, privacidade, exclusão, termos e `/api/send-push` enviam CSP, `X-Frame-Options`, `nosniff`, Referrer-Policy e Permissions-Policy. A função push continua 503. Chromium desktop/mobile carregou o mapa e obteve leitura pública HTTP 200 do Supabase sem violação da CSP. Iframe de outra origem foi bloqueado nas quatro páginas HTML.
- **Limites:** login autenticado, uploads/fotos, Android instalado e mutações/RPCs de produção não foram exercitados nesta publicação. Nenhuma migration Supabase foi aplicada; as correções deste relatório são do deploy web e do lockfile da função Vercel. Migrations de backend continuam sujeitas ao backup e à reconciliação exigidos por `supabase/README.md`.
