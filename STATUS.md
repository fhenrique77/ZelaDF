# ZelaDF — Status atual

Revisão: 2026-10-01. Pendências para produção em [docs/BACKEND_PRODUCAO.md](docs/BACKEND_PRODUCAO.md).

**Confirmado no código local e por execução:** o frontend permanece na raiz com Vite, metadados estáticos em `index.html` e `public/robots.txt` para bloquear indexação. A configuração mantém `base: './'` para web e Capacitor. Três typechecks, 171 Vitest, build, teste de CSP/iframe e 41 cenários Playwright passaram (três skips); assets Android sincronizados. **Confirmado externamente em 30/09:** web publicada no alias https://zela-df.vercel.app pelo deployment `dpl_CoSqEXHv8wJoAevgXRgCDJwmAfhk`; home e `robots.txt` conferidos. Chromium desktop/mobile carregou app, mapa e leitura pública do Supabase sem violações de CSP; iframe externo bloqueado nas quatro páginas HTML. Rollback web: `dpl_74kV3oEAURJZZzVLELWBtg2PY7FF`. Nenhuma migration Supabase foi necessária para esta mudança.

**Pré-vistoria somente leitura de 01/10:** produção ativa em São Paulo, sem backup físico listado e com PITR desligado. Auditorias principal/privada idênticas a 30/09 (823/136 itens); histórico `supabase_migrations.schema_migrations` ausente. Os 14 objetos principais das migrations de backend planejadas faltam em produção e existem em staging. Persistem diferenças em `push_tokens`, `reports.author_name` e validação das FKs Auth. Os 118 contratos SQL passaram novamente em staging com rollback; `supabase test db` oficial e backup/restauração completa continuam pendentes. Nenhuma migration ou alteração permanente de schema/dados de aplicação foi aplicada. **Documentado:** proprietário informou que ainda não possui destino protegido de backup nem ambiente isolado de restauração. Ver [preparação do banco](docs/BACKEND_PRODUCAO.md).

**Verificação de 30/09:** três typechecks, 171 Vitest, 18 testes Python e build web passaram. Playwright teve 39 aprovações, duas expirações ao carregar a página e três skips na execução integral; os dois casos expirados passaram em reexecução isolada. Capacitor sincronizado, três testes JVM e APK debug compilados. O ensaio integrado da API hospedada e do Supabase staging passou novamente em 66 verificações com contas sintéticas. Home, política e exclusão web de produção, além de `/health` e `/ready` da API de staging, responderam HTTP 200. Isso não valida aparelho Android nem carga de produção.

**Auditoria somente leitura de 30/09:** o relatório principal de produção (823 itens) e o das tabelas privadas (136 itens) são idênticos aos de 26/09. Produção e staging continuam divergentes no relatório principal: há diferenças em `push_tokens`, `reports.author_name`, FKs Auth e objetos novos do backend. O histórico remoto de ambos não registra as 19 versões locais; não houve reconciliação do baseline/histórico. Em staging, somente o fingerprint de `guard_photo_cleanup` mudou desde 26/09; a comparação em memória confirmou que o corpo atual coincide com a migration final `20260926000400`. A consulta de backups físicos de produção retornou lista vazia e PITR desligado. `supabase test db --linked` foi tentado no staging, mas a CLI parou antes dos testes por ausência de Docker/Podman. Nenhuma migration ou deploy de produção foi executado nesta verificação.

**Avaliação ofensiva de 30/09:** o site é incorporável por iframe externo (risco de clickjacking); faltam CSP e outros cabeçalhos de defesa. Consultas anônimas de colunas privadas foram negadas; nenhum XSS foi executado no teste sintético do bundle publicado. `pnpm audit --prod` apontou seis advisories locais transitivas de `firebase-admin`, cuja exposição no push desativado não foi demonstrada. Evidências e limites em [docs/SEGURANCA_SITE_2026-09-30.md](docs/SEGURANCA_SITE_2026-09-30.md).

**Confirmado no código local após a avaliação:** `vercel.json` define CSP com `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy e Permissions-Policy em todas as rotas do projeto web. `firebase-admin` foi atualizado para 14.5.0 e o lockfile usa versões corrigidas de `@grpc/grpc-js`, `brace-expansion` e `uuid`; `pnpm audit --prod` retorna zero advisories. Três typechecks, 171 Vitest, build web, 41 testes Playwright (três skips) e o ensaio de CSP/iframe no build passaram. **Confirmado externamente em 30/09:** web de produção publicada em `dpl_74kV3oEAURJZZzVLELWBtg2PY7FF` no alias https://zela-df.vercel.app; rollback web: `dpl_AqrpQp2nC8UfFbq6cZqcNAcyYmvu`. Cabeçalhos conferidos na home, privacidade, termos, exclusão e função push (503 desativada). Chromium desktop/mobile carregou app, mapa e leitura pública do Supabase sem violação de CSP; iframe externo foi bloqueado nas quatro páginas HTML. O dry-run passou em uma cópia limpa de 54 arquivos; a pasta `.pytest_cache` impede varrer diretamente o workspace. **Estado externo não verificável:** Android instalado ainda não foi validado. Nenhuma migration Supabase foi aplicada neste rollout: a correção web não altera o banco, e as migrations de backend pendentes exigem backup completo e reconciliação do schema/histórico de produção.

## Deploy e validação atuais

**Confirmado por execução:** web promovida para https://zela-df.vercel.app, deployment `dpl_AqrpQp2nC8UfFbq6cZqcNAcyYmvu`, com FastAPI/push desligados no produto. API isolada publicada em https://zeladf-api-staging.vercel.app; ensaio completo de 66 verificações aprovado usando Auth, RLS e Storage reais com contas sintéticas removidas ao final. Novas migrations aplicadas somente no staging criado no plano Free.

**Confirmado no código e por execução:** worker de fotos órfãs com reserva transacional, proteção contra reassociação e retomada; retry do upload corrigido para o erro real 400 Duplicate. 118 assertions pgTAP passaram pela Management API. O comando oficial `supabase test db` segue pendente por ausência de Docker/Podman, conforme portão do AGENTS.md. CI preparado, sem execução GitHub comprovada.

Validação local: 171 Vitest, 18 Python, três typechecks, build web local/remoto, 41 cenários Playwright aprovados entre execução integral e reexecução dos dois novos casos de foto (três skips intencionais), sync Capacitor, APK debug e três testes JVM. Aparelho/AAB não disponíveis. CORS web/Capacitor validado; p95 de leitura pública em staging vazio 700 ms (20 amostras), sem equivalência a carga de produção.

**Pendências para promoção do backend:** backup completo com restauração de Auth/Storage, reconciliação integral do schema/histórico, portão oficial pgTAP, atendimento de privacidade/moderação, validação nativa e observação de adoção. Não houve migration nova em produção nem encerramento do módulo 9. Responsável/contato e Play Console continuam indisponíveis segundo o proprietário.

## Repositório

**Confirmado no código:** a cópia foi preparada como repositório Git para `fhenrique77/ZelaDF`. O primeiro commit inclui código, projeto Android, SQL, documentação e testes. `.env*`, backups em `.tools/`, builds, resultados de testes e configurações pessoais da IDE são ignorados. Os arquivos candidatos foram verificados por padrões comuns de chaves privadas e tokens; essa verificação não substitui auditoria de credenciais ou de um histórico Git anterior.

## Backend FastAPI

**Confirmado no código:** módulos 1 a 7 implementados; executores administrativos de exclusão e limpeza de fotos separados da API pública. As cinco flags por fluxo mantêm compatibilidade com o cliente atual. Módulo 8 permanece na função TypeScript, desativado; reivindicação concorrente de evento foi ensaiada em staging sem FCM. Módulo 9 possui log por build/rota e roteiro de observação, ainda sem corte de tráfego.

**Confirmado por execução:** criação/repetição concorrente, votos, comunidade, operador/status, fotos e exclusão Auth/Storage/banco passaram no staging e na API hospedada. O deploy contém somente o backend público, Python 3.12 e configuração FastAPI explícita, sem service role ou executores administrativos. Operação contínua, restauração e dispositivo não foram certificados. Consulte [pendências de produção](docs/BACKEND_PRODUCAO.md) para os próximos passos e critérios de ativação.

## Banco remoto

**Confirmado por execução administrativa no Supabase:** o projeto usado pelo app foi auditado e recebeu quatro reparos pontuais, preservados em supabase/repairs/. O proprietário autorizou concluir o banco. Não foi executado db push, seed, reset ou alteração artificial do histórico de migrations.

- RPCs set_report_vote, get_my_report_ids e get_my_reports instaladas, com assinaturas e EXECUTE autenticado conferidos.
- Leitura pública sem autoria privada; autoria de novos avisos derivada da sessão; edição/exclusão limitadas ao autor; votos somente pela RPC.
- Os 19 avisos e 5 votos foram preservados. Treze contadores divergentes foram reconciliados; a verificação final retornou zero divergências e zero referências Auth órfãs.
- Quinze avisos históricos continuam sem autor; o reparo não inventa autoria nem confirmações que nunca foram registradas.
- Validações de conteúdo e coordenadas, índices de consulta e fluxo de status/histórico instalados. Nenhum operador real foi criado. FKs Auth de reports/votes validadas; CHECKs históricos permanecem NOT VALID, protegendo novas escritas.
- Fotos: envio exige pasta e proprietário da conta, leitura de metadados/exclusão restritas ao dono, bucket público preservado, limite de 5 MiB e JPEG/PNG/WebP.
- Fila privada de pedidos de exclusão instalada. **Documentado:** o proprietário confirmou que acompanhará e atenderá manualmente. Receber protocolo não significa exclusão concluída.
- Tokens: RLS por conta, remoção pelo dono, reassociação e cascade na exclusão Auth corrigidos; push continua desativado.

**Backup:** o provedor não listou backups físicos disponíveis. Foi salva cópia lógica protegida de reports/votes e metadados em .tools/backups/report-flow-20260913, excluída de Git/deploy. Restauração integral e reparo foram testados em PostgreSQL isolado em memória. Essa cópia não inclui Auth, tokens reais ou arquivos Storage e não substitui backup operacional completo.

**Validação:** os quatro reparos foram ensaiados no banco remoto em transações com fixtures sintéticas e ROLLBACK antes do commit definitivo. Testes posteriores confirmaram avisos/votos, isolamento, status e fila/limpeza de tokens. O teste de fotos confirmou upload/leitura RLS e o predicado de exclusão; remoção de arquivo real pela Storage API ainda requer ensaio. Os 84 contratos pgTAP originais e concorrência entre conexões não foram executados.

## Aplicativo

**Confirmado no código:** recuperação do filtro Meus avisos quando RPC faltar; avisos continuam visíveis se a consulta de votos falhar, com votação bloqueada até recuperar o estado; espera OTP de 60 segundos preservada ao fechar/recarregar; falhas Google visíveis e sem travar o botão; altura da lista mobile estável ao mudar filtros. Detalhes em BUGS.md.

**Validação local em 2026-09-13:** 145 testes Vitest, 33 Playwright desktop/mobile (três skips intencionais: cenário somente mobile e duas capturas opcionais), TypeScript frontend/API/E2E, build web, sincronização Capacitor, APK debug e três testes JVM aprovados. A checagem de assinatura falhou conforme esperado sem as quatro variáveis de upload. Nenhum dispositivo acessível por ADB; instalação/fluxo real Android pendente.

**Confirmado externamente em 2026-09-13:** deploy dpl_7Bxfo4qN6KJ94dDWEXa9bzVXxNut publicado em https://zela-df.vercel.app. Inicial, política, regras e exclusão respondem HTTP 200; as três páginas correspondem exatamente aos arquivos locais. Imports ESM da função push corrigidos; produção responde HTTP 503 controlado com o recurso desativado. O APK está em android/app/build/outputs/apk/debug/app-debug.apk; ainda não é o AAB assinado da loja. Foram conferidos 19 assets contra dist e 541 entradas do APK, sem ocorrências dos padrões de credenciais sensíveis procurados.

## Lançamento

**Documentado — Firebase:** proprietário informou conclusão após orientação para excluir a chave iniciada em `5603b52e`, criada em 19/08/2026. A revogação foi relatada, mas sua ausência na listagem e a correspondência ao arquivo removido ainda não foram verificadas independentemente. Nenhuma chave nova foi criada; push permanece desativado.

**Confirmado no código:** regras públicas, aceite versionado antes de publicação/edição/upload, denúncia de conteúdo/autor, bloqueio/desbloqueio e revisão administrativa privada implementados. A migration nova passou em 25 verificações PostgreSQL isoladas e em ensaio remoto com ROLLBACK, incluindo edição de avisos antigos. Aplicada permanentemente em implantação coordenada com o frontend; teste SQL pós-aplicação com ROLLBACK aprovado. Seis RPCs autenticadas, quatro tabelas privadas com RLS e dois triggers de aceite confirmados. Operação contínua de moderação ainda precisa ser definida. Ocultar aviso não remove a foto pública; cleanup administrativo pela Storage API permanece obrigatório.

Imagem de destaque 1024 × 500 e três capturas 1080 × 1920 estão em release/assets/, com texto da ficha em release/STORE_LISTING.md. Capturas usam a interface web mobile real e conteúdo sintético, não comprovam execução nativa. APK anterior preservado somente como referência em .tools/artifacts/zeladf-core-bugfix-debug.apk; a migration exigida pelo candidato novo está instalada. Clientes antigos que não registram aceite precisam atualizar para publicar/editar.

Ainda faltam identidade e contato operacional, responsável/rotina de denúncias, ensaio completo de exclusão e fotos, rotação da credencial Firebase anterior, AAB assinado, testes nativos e requisitos da Play Console. O proprietário informou que ainda não possui os dados de contato/conta solicitados. Ver PLAY_STORE.md e release/ROLLOUT.md. Deploy Vercel concluído; nenhum envio à Play Console.

O baseline remoto difere das onze migrations reconstruídas (inclusive push_tokens histórico). Os reparos não tornam seguro aplicar novamente as migrations antigas; capturar e reconciliar um baseline revisado antes de adotar db push.
