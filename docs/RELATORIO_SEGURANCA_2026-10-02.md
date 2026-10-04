# Relatório de segurança do ZelaDF

**Data:** 2 de outubro de 2026

**Escopo:** revisão estática local do repositório

**Scan Codex Security:** `fd0f0f92-bba6-4645-810f-637fd307c6e0`

**Commit local conferido:** `49f7a7f715825f235e1a9739a99147c464b4799d`

**Site e repositório informados no relatório adicional:** `https://zela-df.vercel.app/` e `fhenrique77/ZelaDF`

**Estado do relatório:** este documento foi criado a partir dos achados e da cobertura gravados pelo scan. A finalização automática falhou; o scan permanece sem selo e sem `report.md` gerado pelo serviço. As conclusões abaixo não comprovam o estado dos ambientes remotos. O relatório adicional fornecido pelo usuário inclui reconhecimento externo limitado; suas observações de produção foram incorporadas como informação fornecida ou documentada, sem novo teste remoto nesta atualização.

## Resumo

A consolidação contém **sete achados**: **cinco de gravidade média** e **dois de gravidade baixa**, além de dois itens de hardening. Não houve achado crítico ou alto nesta revisão. Dois achados médios adicionados dependem de condições não testadas: metadados presentes nas fotos originais e ausência de limites equivalentes no ambiente remoto. A exposição de fotos concentra quatro achados; o retorno OAuth no Android pode expor tokens de sessão se outro app receber o callback.

| ID | Gravidade | Achado |
| --- | --- | --- |
| ZDF-01 | Média | Uma conta pode manter pública a foto de outra ao referenciá-la em seu aviso |
| ZDF-02 | Média | Ocultar um aviso mantém sua foto acessível pela URL pública |
| ZDF-03 | Média | Outro app Android pode interceptar tokens no retorno do login Google |
| ZDF-04 | Baixa | Um deep link não solicitado pode trocar a conta ativa no Android |
| ZDF-05 | Baixa | URL de foto controlada pelo autor permite rastrear quem abre um aviso |
| ZDF-06 | Média, condicional | Upload publica metadados de imagens originais |
| ZDF-07 | Média, condicional | Criação de avisos e uploads sem quota por conta no código local |

## Achados

### ZDF-01 — Uma conta pode manter pública a foto de outra ao referenciá-la em seu aviso · Média

**Confirmado no código:** Uma conta autenticada pode gravar no próprio aviso a URL pública da foto de outra conta diretamente por PostgREST. A limpeza de fotos considera qualquer aviso como referência válida e, por isso, deixa de remover o objeto quando o aviso original é excluído.

**Caminho de ataque:** Com uma conta e uma URL de foto pública, o atacante publica um aviso próprio que aponta para a foto alheia. Após a exclusão do aviso original, a RPC de limpeza deixa de reivindicar o objeto.

**Impacto:** Pode prolongar a exposição pública de imagem de terceiro que deveria ser removida.

**Evidência local:** `supabase/migrations/20260926000400_normalize_cleanup_photo_paths.sql:20`; `supabase/migrations/20260905000200_secure_reports_votes_and_storage.sql:112`; `supabase/migrations/20260926000300_resume_completed_photo_cleanup.sql:34`.

**Condições e limites:** Migrations locais aplicadas no ambiente alvo. A foto é apagada por API ou worker que usa `claim_report_photo_cleanup`. Storage limita upload e DELETE ao proprietário. A exclusão direta legada pode remover o arquivo sem passar pela RPC de limpeza. A rota FastAPI de criação verifica propriedade, mas o PostgREST direto permanece disponível.

**Correção recomendada:** Validar no banco, em INSERT e UPDATE, que toda URL gerenciada em `reports.photo_url` aponta para objeto pertencente ao autor do aviso. A limpeza deve tratar referências legadas de autoria divergente sem aceitá-las como bloqueio.

**Verificação proposta:** Com duas contas, rejeitar criação e edição de aviso que referenciem a foto da outra conta por PostgREST. Com referência legada divergente, confirmar que a limpeza da foto do titular não fica bloqueada.

### ZDF-02 — Ocultar um aviso mantém sua foto acessível pela URL pública · Média

**Confirmado no código:** A decisão de moderação oculta o aviso em `reports`, mas a foto permanece no bucket público `report-photos`. Quem guardou a URL antes da ocultação continua obtendo os bytes, inclusive quando a denúncia é por privacidade.

**Caminho de ataque:** Um visitante copia a URL da foto pública. Após um administrador ocultar o aviso, a URL continua apontando para o objeto público até uma limpeza administrativa separada.

**Impacto:** Fotos denunciadas por privacidade podem conter dados pessoais ou conteúdo abusivo.

**Evidência local:** `supabase/migrations/20260913000100_community_safety.sql:138`; `supabase/migrations/20260903000300_create_report_photos_bucket.sql:5`; `supabase/migrations/20260913000100_community_safety.sql:83`.

**Condições e limites:** Bucket público conforme migration local. Foto não removida ainda pela operação administrativa. O SQL documenta uma limpeza administrativa posterior pela Storage API. A pessoa precisa ter obtido a URL antes da ocultação ou por outro meio; a URL possui identificadores difíceis de adivinhar.

**Correção recomendada:** Fazer a ocultação revogar acesso à foto no mesmo fluxo operacional, com bucket privado e URLs autorizadas ou quarentena imediata com confirmação e retomada de falhas.

**Verificação proposta:** Após ocultar um aviso, confirmar que sua URL anterior não entrega mais a foto. Simular falha de Storage e confirmar que o item permanece pendente para conclusão, sem afirmar remoção.

### ZDF-03 — Outro app Android pode interceptar tokens no retorno do login Google · Média

**Confirmado no código:** O login Google retorna a um esquema privado não verificado pelo Android. O cliente Supabase instalado usa fluxo implícito, que coloca `access_token` e `refresh_token` no fragmento do callback; um app instalado que registre o mesmo esquema e host pode receber os tokens.

**Caminho de ataque:** Um app malicioso registra `com.zeladf.app://auth-callback`; a vítima inicia login Google; se o Android entregar o callback ao malicioso, ele lê `access_token` e `refresh_token` no fragmento.

**Impacto:** O par access/refresh token permite usar a conta da vítima enquanto válido.

**Evidência local:** `src/auth/AuthProvider.tsx:50-57` e `:88-104`; `android/app/src/main/AndroidManifest.xml:45-53`; `src/lib/supabaseClient.ts:18-23`.

**Detalhe do relatório adicional, confirmado no código:** o listener aceita uma URL quando ela contém `com.zeladf.app` **ou** apenas `#access_token`; isso não confere esquema e host exatos. A condição permissiva também contribui para ZDF-04.

**Condições e limites:** Login Google no Android habilitado no ambiente remoto. Outro app registrado para o mesmo esquema e host é escolhido como receptor. A entrega ao aplicativo malicioso depende do resolvedor Android, preferência ou escolha do usuário. O projeto Supabase remoto deve aceitar o redirect configurado; isso não foi verificado.

**Correção recomendada:** Usar Authorization Code com PKCE e callback HTTPS por Android App Link verificado para o domínio e certificado do app; não transportar tokens de sessão no URI.

**Verificação proposta:** Em aparelho com app concorrente para o esquema antigo, confirmar que o callback verificado é entregue somente ao ZelaDF. Confirmar que a URL de retorno contém código de uso único e nenhum access ou refresh token.

### ZDF-04 — Um deep link não solicitado pode trocar a conta ativa no Android · Baixa

**Confirmado no código:** A Activity Android exportada aceita o callback de autenticação. O listener usa tokens encontrados no fragmento para chamar `setSession` sem conferir a origem exata nem uma tentativa de login pendente. Um atacante pode enviar tokens válidos da própria conta e fazer a vítima continuar usando o app nessa conta.

**Caminho de ataque:** O atacante envia à vítima um callback `com.zeladf.app://auth-callback` com tokens da própria conta. Se aberto no app, o listener troca a sessão; publicações ou pedidos feitos em seguida são atribuídos à conta do atacante.

**Impacto:** Ações posteriores podem ser atribuídas à identidade errada, inclusive avisos, fotos e pedidos de exclusão.

**Evidência local:** `src/auth/AuthProvider.tsx:89`; `android/app/src/main/AndroidManifest.xml:38`; `src/lib/supabaseClient.ts:20`.

**Condições e limites:** Vítima abre o link ou um app local envia intent. A vítima segue usando o app após a troca. `setSession` precisa de tokens válidos aceitos pelo Supabase. O atacante não obtém a sessão anterior da vítima. O cabeçalho privado pode exibir um rótulo da conta, permitindo que a vítima perceba a troca.

**Correção recomendada:** Aceitar apenas URI com esquema e host exatos e concluir login somente com transação OAuth pendente e estado correspondente; preferir código PKCE de uso único ao par de tokens no fragmento.

**Verificação proposta:** Enviar deep link com tokens válidos sem login pendente e confirmar que a sessão não muda. Enviar callback com esquema/host incorretos e confirmar rejeição. Confirmar que um callback legítimo com estado esperado conclui login uma única vez.

### ZDF-05 — URL de foto controlada pelo autor permite rastrear quem abre um aviso · Baixa

**Confirmado no código:** Uma conta autenticada pode gravar uma URL de imagem escolhida em seu aviso diretamente no Supabase. Quando outra pessoa abre os detalhes, o aplicativo solicita a imagem, permitindo ao servidor escolhido observar IP, User-Agent, horário e um identificador presente na URL.

**Caminho de ataque:** Conta grava URL externa em photo_url; o detalhe carrega essa URL no dispositivo de quem abre o aviso.

**Impacto:** IP, User-Agent e horário da visualização podem ser coletados, sem token ou GPS preciso.

**Evidência local:** `supabase/migrations/20260926000400_normalize_cleanup_photo_paths.sql:13`; `supabase/migrations/20260905000200_secure_reports_votes_and_storage.sql:123`; `src/ReportDetail.tsx:231`.

**Condições e limites:** Migrations locais aplicadas. Pessoa abre o aviso em Android ou em origem permitida pela CSP web. A imagem só carrega quando o detalhe é aberto. Na web, a CSP restringe `img-src` a origens permitidas; um atacante pode usar projeto próprio em `*.supabase.co`. A política de Referer limita a referência entre origens; o Bearer do Supabase e a localização GPS não são enviados no atributo img.

**Correção recomendada:** Restringir no banco `reports.photo_url` a objetos existentes em `report-photos` pertencentes ao autor e gerar uma URL canônica. Limitar as origens de imagem no Android e reduzir o curinga da CSP web.

**Verificação proposta:** Rejeitar URL externa por INSERT e UPDATE direto no PostgREST. Confirmar que detalhe de aviso só carrega foto autorizada do bucket.

### ZDF-06 — Upload publica metadados de imagens originais · Média, condicional

**Confirmado no código:** o formulário conserva o `File` escolhido após validar MIME e tamanho. Tanto o fluxo direto quanto o fluxo da FastAPI enviam esse mesmo arquivo ao Storage, sem decodificação e nova codificação da imagem. O bucket `report-photos` é público. A FastAPI recebe o caminho da foto, não seus bytes, e por isso não remove metadados do upload atual.

**Inferência:** se um JPEG de origem trouxer EXIF com GPS, data, modelo do aparelho ou outros dados, esses metadados poderão ser obtidos por quem baixar a imagem pública. Não foi examinada uma foto real nem confirmado que os dispositivos usados preservam EXIF; a severidade média considera a possibilidade de localização precisa involuntária.

**Evidência local:** `src/NewReportForm.tsx:66-83` e `:132-143`; `src/lib/reportValidation.ts:50-62`; `src/lib/reportService.ts:509-519` e `:742-748`; `src/lib/reportWriteApi.ts:70-74`; `supabase/migrations/20260903000300_create_report_photos_bucket.sql:5-7`.

**Correção recomendada:** publicar apenas uma imagem normalizada, decodificada e recodificada sem metadados. A transformação no cliente reduz o risco para o aplicativo oficial, mas um cliente pode enviar bytes diretamente ao Storage; para garantir a propriedade, usar processamento antes da publicação ou quarentena privada com validação do arquivo final. Testar com JPEG sintético contendo EXIF e confirmar que o objeto público não preserva os campos.

### ZDF-07 — Criação de avisos e uploads sem quota por conta no código local · Média, condicional

**Confirmado no código:** `POST /api/v1/reports` valida sessão, campos e UUID de idempotência e chama `create_report_idempotent`. A RPC guarda a chave por usuário e requisição, mas não limita novas chaves por intervalo. O caminho direto ao PostgREST também permite `INSERT` em `reports` ao autor autenticado. As policies locais de Storage limitam formato, tamanho e proprietário, sem quota de número de objetos ou bytes por conta. O limite de 20 denúncias por hora protege `flag_report`, não a publicação de avisos.

**Inferência:** uma conta pode repetir upload e criação com novos UUIDs para produzir spam e consumo de banco, Storage e tráfego. Os limites gerais e controles antifraude eventualmente configurados em Supabase ou Vercel não foram verificados; não houve teste de carga. Por isso a severidade média é condicional ao ambiente.

**Evidência local:** `backend/server.py:572-621`; `supabase/migrations/20260924000100_fastapi_report_create_idempotency.sql:14-89`; `supabase/migrations/20260905000200_secure_reports_votes_and_storage.sql:112-145`; `supabase/migrations/20260904000200_add_report_validation_and_photo_policies.sql:49-53`; `supabase/migrations/20260913000100_community_safety.sql:99-103`.

**Correção recomendada:** aplicar no banco uma quota transacional de criação por conta que cubra também o PostgREST direto. Definir e aplicar limite de objetos/bytes na fronteira de upload; a quota da RPC de avisos, sozinha, não bloqueia uploads órfãos. Medir limites com contas sintéticas em staging e confirmar comportamento sob concorrência antes de ativar em produção.

## Cobertura

**Confirmado no código:** foram revisadas as fronteiras de autenticação, grants e RLS, votos, status, Storage, moderação, exclusão de conta, FastAPI, webhook de push, clientes web e Android, CI e reparos SQL. Nas áreas abaixo não foi demonstrado outro caminho de exploração:

- RLS de relatórios, votos e status: Investigador SQL confirmou substituição de policies históricas, grants por coluna e RPCs vinculadas a auth.uid(). Estado remoto não verificado.
- Filas privadas de exclusão/moderação e push tokens: Investigador SQL confirmou RLS/grants e operações administrativas restritas no SQL local.
- FastAPI, webhook e CLIs administrativas: Revisão dirigida confirmou JWT do usuário, RLS/RPC e webhook secreto; nenhum bypass adicional validado.
- Push, GPS, logs, backup e imagens no cliente: Revisão não sustentou XSS por img src; push exige flag/permissão e RLS, GPS é acionado pelo usuário, logs sanitizam erros e backup local está desativado.
- CI, scripts de teste e execução: Confirmado no código: workflows de PR com permissões de leitura e sem interpolação de entrada em shell; E2E isola variáveis sintéticas. Precedência de flags da CLI Supabase no runner staging não verificada externamente.
- SQL histórico, patches e reparos: Confirmado no código: reparos removem policies legadas e recriam grants limitados; patch de RPC antigo aborta antes de executar. Aplicação no Supabase remoto não verificada.

**Cobertura parcial:** dependências, builds, caches, mídia e parte dos testes, páginas estáticas e documentos não foram auditados individualmente. A revisão foi estática: não houve reprodução em banco, navegador ou aparelho Android. Nenhum teste automatizado foi executado como parte desta análise.

**Estado externo não verificável:** a aplicação das migrations, as policies e as configurações efetivas de Supabase, Google, Firebase e Vercel não foram comparadas com o código local. Valores de `.env`, arquivos de service account e outros secrets não foram abertos.

**Questões abertas:**
- Estado efetivo das migrations, policies, bucket e configurações OAuth no Supabase/Firebase/Vercel é externo e não foi verificado.
- A resolução de intent e a exploração OAuth/deep link precisam de reprodução em Android com app malicioso.
- A precedência de `--linked` e `--project-ref` na versão da CLI Supabase usada pelo runner staging não foi confirmada sem executar a CLI.
- A CSP local lista a API de staging, enquanto a documentação cita API de produção; o efeito depende do ambiente implantado.

## Controles observados no relatório adicional

**Confirmado no código:** o backend público usa a chave pública do Supabase e encaminha o JWT da pessoa; a autoria de edição e exclusão também é conferida por `get_my_report_ids` e RLS. A revisão não identificou IDOR evidente nessas rotas. As operações de banco do backend usam PostgREST/RPC com parâmetros estruturados, sem composição direta de SQL a partir da entrada examinada. Os textos de avisos passam pela renderização normal do React; não foi demonstrado XSS armazenado. A configuração web inclui `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy e Permissions-Policy. O webhook de push exige segredo, compara-o com `timingSafeEqual` e reivindica o evento no banco.

**Limite:** ausência de exploração identificada nestes caminhos não equivale a uma garantia geral. A validação da mesma foto em múltiplos avisos existe na RPC da FastAPI, mas não substitui a checagem de propriedade de `reports.photo_url` no caminho direto ao Supabase descrita em ZDF-01. O valor e a configuração remota dos secrets não foram inspecionados.

## Hardening e estado de produção

**Firebase no Android — informativo.** Confirmado no código local apenas que `android/app/google-services.json` está presente; seus valores não foram abertos. A chave de API cliente desse arquivo não deve ser tratada automaticamente como segredo de servidor. **Estado externo não verificável:** restrições de aplicativo, certificado, APIs e quotas no Google Cloud. `AGENTS.md` documenta que uma credencial sensível de service account foi removida desta cópia em 05/09/2026; revogação e rotação não foram confirmadas. O relatório adicional não ter encontrado o arquivo atual não resolve esse histórico.

**CSP para API de produção — informativo.** Confirmado no código: `vercel.json:9` permite `https://zeladf-api-staging.vercel.app` em `connect-src`, mas não `https://zeladf-api.vercel.app`. Documentado em `STATUS.md` e `docs/BACKEND_PRODUCAO.md`: a API de produção foi publicada, enquanto as flags do cliente seguem desligadas e objetos de banco necessários ao backend ainda não haviam sido promovidos em 01/10/2026. Antes de ativar as flags, reconciliar e testar o schema real, validar Auth/Storage e atualizar a CSP no build implantado. O estado atual do deploy não foi verificado nesta atualização.

## Ordem de tratamento sugerida

1. Proteger o callback OAuth Android com PKCE e App Link verificado; rejeitar callbacks sem login pendente (ZDF-03 e ZDF-04).
2. Impor no banco a propriedade e a origem de `photo_url`, tratar referências legadas e testar o acesso direto ao PostgREST (ZDF-01 e ZDF-05).
3. Normalizar as imagens antes de torná-las públicas e impedir a publicação direta de bytes não processados (ZDF-06).
4. Vincular a ocultação por moderação à revogação do acesso à foto (ZDF-02).
5. Aplicar quotas de criação e de upload por conta em todas as rotas de escrita (ZDF-07).
6. Conferir restrições da chave cliente Firebase e corrigir a CSP quando houver promoção do backend. Comparar o estado remoto com as migrations locais conforme `supabase/README.md` antes de qualquer mudança no banco ou deploy.

Nenhum arquivo de aplicação, migration ou serviço remoto foi alterado para produzir este relatório.
