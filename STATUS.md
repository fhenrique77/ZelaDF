# ZelaDF — Status atual

Revisão: 2026-09-23. O código local e as evidências abaixo prevalecem sobre registros anteriores.

## Repositório

**Confirmado no código:** a cópia foi preparada como repositório Git para `fhenrique77/ZelaDF`. O primeiro commit inclui código, projeto Android, SQL, documentação e testes. `.env*`, backups em `.tools/`, builds, resultados de testes e configurações pessoais da IDE são ignorados. Os arquivos candidatos foram verificados por padrões comuns de chaves privadas e tokens; essa verificação não substitui auditoria de credenciais ou de um histórico Git anterior.

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
