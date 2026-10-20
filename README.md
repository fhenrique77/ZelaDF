# ZelaDF

Mapa colaborativo de problemas urbanos do Distrito Federal, com aplicação web responsiva e versão Android via Capacitor. Moradores podem consultar ocorrências, publicar avisos com localização e foto e confirmar problemas encontrados por outras pessoas.

As categorias incluem água, buracos, iluminação, lixo, sinalização e outros problemas. Cada categoria oferece um órgão e telefone de referência. O ZelaDF não encaminha avisos a órgãos públicos nem gera protocolos oficiais; as confirmações expressam participação comunitária.

## Funcionalidades

**Confirmado no código:**

- Mapa e lista de avisos, com filtros por categoria, status e avisos da própria conta.
- Publicação com localização manual, GPS opcional, sugestão de endereço e foto.
- Confirmação e retirada de confirmação, edição e exclusão dos próprios avisos.
- Autenticação por e-mail OTP, Google e telefone/senha, sujeita à configuração do Supabase Auth.
- Identidade pública única: **Cidadão**, sem divulgar dados da conta nos avisos.
- Aceite de regras da comunidade, denúncias, bloqueios e solicitação de exclusão da conta com protocolo.
- Mudança de status com motivo e histórico, restrita a operadores internos do ZelaDF.

A solicitação de exclusão registra um pedido; o atendimento depende da operação administrativa. Operadores internos não representam órgãos públicos. Push está preparado e desativado por padrão.

## Arquitetura atual

**Confirmado no código:** o projeto combina o cliente React, uma API Python/FastAPI separada e o Supabase. A adoção da API é gradual, controlada por flags de build para cada fluxo.

| Camada | Tecnologias e responsabilidade |
| --- | --- |
| Web | React, TypeScript, Vite e Tailwind CSS; SPA com mapa, painéis e modais controlados por estado |
| Mapa e localização | Leaflet, OpenStreetMap e Nominatim; GPS e sugestão de endereço por ação do usuário |
| API própria | FastAPI em `backend/`: leituras, avisos, votos, comunidade, status e pedidos de exclusão |
| Dados e autenticação | Supabase Auth, PostgreSQL e Storage; autorização por RLS, grants e RPCs |
| Android | Capacitor e projeto nativo em `android/`, compartilhando o frontend web |
| Push | Função TypeScript `api/send-push.ts` e Firebase Cloud Messaging, separados da API FastAPI |
| Operação administrativa | Ferramentas Python de exclusão de conta e limpeza de fotos, fora da API pública |

O cliente mantém o acesso direto ao Supabase quando as flags FastAPI estão desligadas. Quando um fluxo usa a API, ela valida a sessão e acessa dados com o JWT da conta, preservando as regras do banco. Auth e transferência dos arquivos de fotos continuam diretamente no Supabase. A API pública não usa `service_role`.

**Documentado:** [STATUS.md](STATUS.md) registra a publicação da API em projeto Vercel separado, ensaios em staging e atualizações de 3 de outubro de 2026. O cliente publicado continua com as flags FastAPI desligadas. Publicar a API não ativa seus fluxos no app; promoção de migrations e ativação seguem os critérios de [produção do backend](docs/BACKEND_PRODUCAO.md).

**Estado externo não verificável pelo código:** disponibilidade dos serviços, configuração dos provedores, schema efetivo de cada ambiente e funcionamento em Android instalado. Consulte o status para evidências datadas e limites das validações.

## Executar localmente

### Frontend

Use **Node.js 22** e **pnpm 10**, conforme [.mise.toml](.mise.toml). Na raiz do repositório:

```sh
pnpm install --frozen-lockfile
pnpm run dev
```

Antes de iniciar, verifique se já existe um servidor do projeto ativo. O endereço padrão é `http://localhost:8443`; a variável `PORT` altera a porta.

Sem configuração Supabase, a interface exibe dados de demonstração. Esse modo permite explorar o produto, mas não substitui autenticação, persistência ou validação das integrações reais.

Para usar um ambiente Supabase de desenvolvimento, crie `.env.local` na raiz com:

| Variável | Finalidade |
| --- | --- |
| `VITE_SUPABASE_URL` | URL do projeto de desenvolvimento |
| `VITE_SUPABASE_ANON_KEY` | Chave pública/anon do mesmo projeto |
| `VITE_PUSH_ENABLED` | Manter `false` até concluir a preparação do push |

Reinicie o Vite após alterar variáveis. Valores `VITE_*` entram no bundle público: nunca coloque credenciais administrativas neles nem versione `.env.local`. O ambiente precisa de schema, RPCs e policies compatíveis; siga o [guia do Supabase](supabase/README.md) antes de preparar o banco. O baseline histórico deve ser reconciliado antes de qualquer aplicação remota.

### Backend FastAPI

O backend é opcional para explorar o frontend com os fluxos diretos. Para desenvolvê-lo, use **Python 3.12**. Exemplo em PowerShell, a partir da raiz:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m uvicorn server:app --reload
```

Em Linux/macOS, use `.venv/bin/python` no lugar de `.venv\Scripts\python.exe`. Configure no ambiente do processo `SUPABASE_URL` (HTTPS), `SUPABASE_PUBLIC_KEY` e `API_CORS_ORIGINS` (origens exatas permitidas) antes de iniciar. A API atende por padrão em `http://127.0.0.1:8000`; `/health` verifica o processo e `/ready` verifica a dependência Auth.

Para conectar um build de teste, configure `VITE_API_URL` e habilite somente as flags dos fluxos em ensaio. Contratos, cinco flags, configuração e ferramentas administrativas estão em [backend/README.md](backend/README.md). Os critérios de ativação e rollback estão no [guia de produção](docs/BACKEND_PRODUCAO.md).

### Android

O aplicativo reutiliza o build web. Preparação do SDK/JDK, sincronização Capacitor, builds, assinatura e testes em aparelho estão em [PLAY_STORE.md](PLAY_STORE.md). Uma mudança no frontend precisa de novo build e sincronização para chegar ao pacote Android. Emulação mobile no navegador não valida os recursos nativos.

## Verificações e CI

**Confirmado no código:** há dois workflows declarativos no GitHub Actions:

- [Application checks](.github/workflows/application.yml): typechecks, build web, sincronização Android, Vitest, cabeçalhos de segurança e Playwright; um job separado inicia Supabase local e executa os contratos pgTAP.
- [Backend checks](.github/workflows/backend.yml): compilação Python e pytest, acionados por alterações no backend ou no próprio workflow.

Esses workflows executam CI; não publicam a aplicação automaticamente. Procedimentos de publicação e critérios de promoção estão na documentação técnica.

Comandos úteis na raiz:

| Objetivo | Comando |
| --- | --- |
| TypeScript frontend | `pnpm run typecheck` |
| TypeScript da função push | `pnpm run typecheck:api` |
| TypeScript E2E | `pnpm run typecheck:e2e` |
| Build web | `pnpm run build` |
| Sincronizar Android após o build | `pnpm exec cap sync android` |
| Testes unitários e contratos estáticos | `pnpm run test:run` |
| Instalar Chromium para testes | `pnpm exec playwright install chromium` |
| Testes no navegador | `pnpm run test:e2e` |
| Cabeçalhos de segurança | `pnpm run test:security-headers` |
| Preview do build | `pnpm run preview` |

Em checkout limpo, execute build e sincronização Android antes do Vitest: os contratos estáticos leem a configuração Capacitor gerada. Para pytest, execute `python -m pytest` dentro de `backend/`, usando o ambiente virtual. Testes de banco exigem Supabase CLI e Docker; preparação em [supabase/README.md](supabase/README.md). A suíte de navegador usa serviços simulados; veja [e2e/README.md](e2e/README.md).

Resultados, datas, limitações e implantações ficam em [STATUS.md](STATUS.md), evitando contagens de testes desatualizadas nesta página.

## Estrutura

```text
src/                  Interface React, autenticação e serviços do cliente
backend/              API FastAPI, ferramentas administrativas e testes Python
api/                  Função Vercel de push em TypeScript
supabase/             Migrations, auditoria, reparos e contratos de banco
android/              Projeto nativo Capacitor
public/               Assets e páginas públicas de privacidade e comunidade
e2e/                  Testes Playwright
.github/workflows/    CI da aplicação, banco e backend
docs/                 Produção do backend e relatórios de segurança
release/              Procedimentos e materiais de lançamento
```

## Documentação técnica

| Documento | Conteúdo |
| --- | --- |
| [STATUS.md](STATUS.md) | Estado atual, histórico de validações e implantações |
| [TODO.md](TODO.md) | Pendências e prioridades |
| [CONTEXT.md](CONTEXT.md) e [DECISIONS.md](DECISIONS.md) | Contexto do produto e decisões arquiteturais |
| [backend/README.md](backend/README.md) | API, configuração, contratos e ferramentas administrativas |
| [Produção do backend](docs/BACKEND_PRODUCAO.md) | Ambientes, migração gradual, ativação e rollback |
| [supabase/README.md](supabase/README.md) | Banco, migrations, RLS, auditoria e testes |
| [PRIVACY.md](PRIVACY.md) | Dados pessoais, retenção e operação de exclusão |
| [Relatório de segurança](docs/RELATORIO_SEGURANCA_2026-10-02.md) e [avaliação web](docs/SEGURANCA_SITE_2026-09-30.md) | Achados, evidências e limites; andamento das correções em STATUS.md |
| [PLAY_STORE.md](PLAY_STORE.md) e [rollout](release/ROLLOUT.md) | Preparação Android e lançamento |
| [Moderação](release/COMMUNITY_MODERATION.md) | Operação de denúncias e revisão administrativa |
| [BUGS.md](BUGS.md) | Bugs conhecidos e correções |
| [AGENTS.md](AGENTS.md) | Regras de trabalho e validação para agentes |

As evidências técnicas e operacionais são datadas. Para avaliar prontidão ou promover mudanças, consulte primeiro as atualizações mais recentes de STATUS.md e os critérios do ambiente de destino.
