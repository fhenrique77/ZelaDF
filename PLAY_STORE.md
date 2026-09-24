# ZelaDF - Checklist final para Google Play

Última revisão: 2026-09-13.

**Revisão 2026-09-13:** banco de avisos/votos, RLS de fotos, validações/status e fila privada de exclusão reparados remotamente, com backup lógico de avisos/votos restaurado em teste e ensaios SQL revertidos. Proprietário confirmou atendimento manual de exclusão. BUG-004/005 corrigidos no banco; validação Android/Storage API ainda pendente. Passaram 145 testes Vitest, 33 cenários Playwright, typechecks e APK debug; AAB assinado pendente.

### Conteúdo gerado por usuários — código e banco implantados

**Confirmado no código:** regras/aceite antes de criar, editar ou enviar fotos, denúncias de conteúdo/autor, bloqueios e revisão administrativa privada implementados. São 25 verificações SQL locais aprovadas e ensaio remoto integral com ROLLBACK. A migration de comunidade foi aplicada e o frontend correspondente foi publicado; teste SQL pós-aplicação aprovado. Definir a operação contínua descrita em release/COMMUNITY_MODERATION.md. Referência oficial: [conteúdo gerado por usuários](https://support.google.com/googleplay/android-developer/answer/9876937?hl=pt-BR).

- [x] Termos/regras e aceite, denúncia de conteúdo/autor e bloqueio no código.
- [x] Imagem de destaque e três capturas locais em release/assets/; ficha em release/STORE_LISTING.md.
- [ ] Confirmar responsável, substituto, frequência e contato de moderação; testar remoção real de fotos impróprias.
- [x] Implantar migration e frontend coordenadamente; teste SQL pós-aplicação e URLs de produção aprovados.
- [ ] Validar a nova versão nativa em aparelho antes de distribuição.

**Evidência mais recente:** 145 testes Vitest, 33 cenários Playwright desktop/mobile e três skips intencionais; typechecks frontend/API/E2E e build web aprovados. Os fluxos de edição/aceite receberam validação adicional. Consulte STATUS.md e release/ROLLOUT.md para artefatos e sequência de implantação; os registros datados abaixo preservam verificações anteriores e não substituem o estado atual.

**Atualização local — 2026-09-13:** `pnpm run typecheck`, `pnpm run typecheck:api`, `pnpm run typecheck:e2e`, `pnpm run test:run`, `pnpm run test:e2e`, `pnpm run build`, `pnpm exec cap sync android`, `:app:testDebugUnitTest` e `:app:assembleDebug` foram executados com sucesso. Resultado: 145 testes Vitest, 33 cenários Playwright aprovados e 3 skips intencionais. APK: `android/app/build/outputs/apk/debug/app-debug.apk`. A validação de assinatura falhou como esperado porque nenhuma chave de upload foi configurada.

Este documento reúne as evidências verificadas e as pendências do lançamento Android. Uma marcação local não certifica configurações remotas nem a aprovação da Play Console. O proprietário autorizou explicitamente o deploy Vercel, concluído em 13/09/2026; a publicação na loja continua pendente.

## Situação atual

**Conclusão:** o ZelaDF ainda não está pronto para publicação pública. O próximo marco seguro é gerar um AAB assinado e validado para a faixa de teste interno, depois de concluir os bloqueadores críticos abaixo.

**Confirmado no código/repositório:** 

- aplicativo Capacitor com pacote `com.zeladf.app`;
- `versionCode 1` e `versionName 1.0`;
- `minSdk 24`, `compileSdk 36` e `targetSdk 36`;
- ícones, splash, deep link e configuração Firebase Android presentes;
- TypeScript frontend/API/E2E, build web, 145 testes Vitest e 33 cenários Playwright desktop/mobile com serviços simulados aprovados;
- assinatura preparada por quatro variáveis `ZELADF_UPLOAD_*`, sem chave ou senha criada; release sem configuração completa é bloqueado;
- build web sincronizado com Android em 2026-09-13;
- permissões amplas de mídia removidas; câmera e álbum agora têm ações separadas;
- backup e transferência de dados locais excluídos por manifesto e regras XML;
- JDK 21.0.11 existente localizado e Gradle 8.14.3 executado com ele; SDK 36, build-tools 36.0.0 e platform-tools instalados em `.tools/android-sdk` (ignorado no Git/deploy).

**Estado externo ainda não verificado:** rotação Firebase, OAuth em aparelho e formulários da loja. **Confirmado externamente:** deploy autorizado e concluído em 13/09/2026; inicial, privacy.html, account-deletion.html e terms.html retornam HTTP 200. As três páginas correspondem aos arquivos locais. Supabase com reparos e comunidade instalados; ver STATUS.md. Contato operacional e Play Console ainda não providenciados pelo proprietário.

**Documentado — informações fornecidas pelo proprietário em 2026-09-08:** projeto Supabase `jfomodkktqfvoytcihgp` e Firebase `zeladf`. Não foram fornecidos staging nem origem Git. Responsável e contato operacional ainda serão providenciados; Play Console/app/assinatura ainda não estão preparados. IDs identificam os projetos, mas não concedem acesso administrativo nem comprovam sua configuração.

Materiais preparados: [textos e ficha da loja](release/STORE_LISTING.md) e [inventário para Segurança dos dados](release/DATA_SAFETY.md). São rascunhos locais; não houve envio à Console.

## 1. Bloqueadores críticos

Nenhum AAB deve seguir para produção enquanto estes itens estiverem abertos.

### Segurança Firebase

- [ ] Auditar o histórico Git original para determinar se a antiga service account foi versionada ou compartilhada.
- [ ] Conferir administrativamente a revogação: proprietário informou conclusão após orientação para excluir a chave iniciada em `5603b52e`, criada em 19/08/2026. **Documentado:** relato recebido; ausência da chave na listagem ainda não verificada pelo agente.
- [ ] Substituir `FIREBASE_SERVICE_ACCOUNT` na Vercel sem salvar o JSON no projeto.
- [ ] Confirmar que nenhum secret aparece no AAB, código cliente, logs ou documentação.
- [ ] Manter push desativado enquanto webhook, tokens e Firebase não estiverem validados.

Verificação de 2026-09-05:

| Item | Evidência e pendência |
| --- | --- |
| Histórico original | **Estado externo não verificável:** esta cópia não contém `.git`; a busca por `ZelaDF` no conector GitHub não retornou repositórios. É necessário identificar a origem e auditar commits, branches, tags e compartilhamentos, sem reproduzir credenciais. |
| Revogação/rotação | **Documentado:** após apresentar a chave ativa iniciada em `5603b52e` (19/08/2026) e receber orientação de exclusão, o proprietário informou “pronto”. Exclusão interpretada como realizada pelo proprietário; ausência da chave na listagem e correspondência ao arquivo antigo ainda não verificadas independentemente. Não foi criada chave substituta; push continua desativado. |
| Secret Vercel | Consulta somente leitura confirmou `FIREBASE_SERVICE_ACCOUNT` oculto em Preview e Production. Nenhum valor foi lido ou substituído; a existência do secret não comprova rotação. |
| Varredura local | Nenhuma ocorrência dos padrões procurados de chave privada PEM, JSON de service account, JWT `service_role` ou tokens secretos identificáveis em 121 arquivos: 88 de código/configuração, 11 documentos, 9 do build web e 13 assets Android. Quatro configurações sensíveis foram excluídas da leitura; dependências e caches não foram inspecionados. Não foram encontrados AAB/APK nem logs locais nesse escopo. A inspeção do AAB final e dos logs remotos permanece obrigatória. |
| Push desativado | **Confirmado no código:** flags cliente/servidor falham fechadas e não existe opt-in ativo. O manifesto agora desativa `firebase_messaging_auto_init_enabled` e `firebase_analytics_collection_enabled`; testes locais cobrem os bloqueios. Na Vercel, `PUSH_ENABLED` e `VITE_PUSH_ENABLED` estão ausentes. **Implementado, mas não validado em Android:** falta verificar o manifesto mesclado, instalação limpa e atualização de instalação que já tenha registrado push. O GET antigo retornava 500 por ERR_MODULE_NOT_FOUND. Imports ESM corrigidos e testes excluídos das funções publicadas; após o deploy, GET retorna HTTP 503 controlado. Push continua desativado. |

**Verificação externa de URLs — 2026-09-13:**

- [x] Publicar o build atual na Vercel: deployment dpl_7Bxfo4qN6KJ94dDWEXa9bzVXxNut promovido para zela-df.vercel.app.
- [x] Confirmar `https://zela-df.vercel.app/privacy.html` com a atualização de 13/09/2026; conteúdo igual ao arquivo local. Contato real ainda pendente.
- [x] Confirmar `https://zela-df.vercel.app/account-deletion.html` respondendo HTTP 200; abertura do fluxo testada em navegador local. Atendimento real ainda pendente.
- [x] Repetir a verificação após o deploy; inicial, política, regras e exclusão com HTTP 200. Não enviar à Console antes de completar contato e atendimento.

Os cinco itens permanecem abertos até completar também suas verificações externas. Os testes locais não substituem a rotação da credencial, a inspeção do AAB e a validação dos serviços remotos. Nenhum AAB assinado foi gerado ou publicado nesta etapa.

Para concluir a rotação, identificar a chave antiga pelo ID no IAM, revogá-la e confirmar sua remoção na listagem de chaves; registrar somente IDs, data e resultado. A nova credencial deve ser transferida diretamente ao secret de servidor da Vercel, sem arquivo no projeto, argumento de shell ou log. Atualizar os ambientes consumidores e realizar novo deploy para aplicar o valor, mantendo push desligado. Credenciais de implantações antigas também precisam estar revogadas. Referências: [chaves de contas de serviço no Google Cloud](https://docs.cloud.google.com/iam/docs/keys-create-delete), [variáveis de ambiente na Vercel](https://vercel.com/docs/environment-variables/managing-environment-variables) e [bloqueio da inicialização automática do FCM](https://firebase.google.com/docs/cloud-messaging/android/get-started#prevent-auto-initialization).

### Banco e autorização

**Estado vigente — 2026-09-13:** quatro reparos foram aplicados e testados no Supabase remoto; ver `STATUS.md` e `supabase/repairs/README.md`. Há backup lógico protegido/restaurado de `reports`/`votes`, FKs Auth de avisos/votos validadas e fila privada de exclusão instalada. Não há backup operacional completo de Auth/Storage. Permanecem o baseline revisado, os contratos pgTAP completos, concorrência, remoção real pela Storage API e a validação nativa da comunidade já implantada.

- [x] Fazer backup e auditoria somente leitura do Supabase remoto para o fluxo atual de avisos/votos.
- [ ] Capturar e comparar o baseline remoto revisado; não reaplicar cegamente as migrations reconstruídas.
- [x] Ensaiar comunidade em PostgreSQL isolado e Supabase com ROLLBACK; aplicar e validar na implantação coordenada. Um projeto staging permanente ainda não existe.
- [ ] Executar os 84 contratos pgTAP de RLS e corrigir qualquer caso permitido/proibido divergente.
- [ ] Validar visitante, autenticado, autor, não autor e operador.
- [x] Validar `reports`, `votes`, RPCs, status, histórico e as policies principais de `report-photos` com fixtures e ensaios remotos revertidos.
- [ ] Validar a remoção de arquivo real pela Storage API e repetir a validação completa após a migration de comunidade.

Verificação histórica de 2026-09-05 — **substituída pelo estado vigente acima**:

| Etapa | Evidência atual | O que falta para concluir |
| --- | --- | --- |
| Backup e auditoria remota | Registro histórico anterior à autenticação administrativa. | Consultar o estado vigente e os reparos em `STATUS.md` e `supabase/repairs/README.md`. |
| Comparação do schema | **Confirmado no código:** auditoria inclui operadores, histórico, Storage, constraints e seu estado `VALIDATED`, permissões efetivas por tabela/coluna/RPC, funções privadas, triggers e RLS. Argumentos de webhook e corpos de funções são representados por fingerprints. | Executar no ambiente remoto e no local, comparar resultados e histórico de migrations. Fingerprints diferentes exigem revisão protegida; igualdade isolada não certifica equivalência do schema. |
| Migrations isoladas | Onze migrations locais, incluindo a nova fila de solicitações de exclusão (`20260905000300`); SQLs históricos preservados. | Docker/runtime e Supabase local ativos, ou projeto staging separado identificado e acessível. |
| 84 contratos pgTAP | Contratos reforçados com fixtures privadas, ainda não executados integralmente em uma stack isolada. | Subir o banco isolado, aplicar o baseline revisado e executar os 84 casos. |
| Papéis e policies reais | **Documentado:** visitante, autenticado, autor, não autor e operador estão representados no contrato SQL. Os testes locais cobrem verificações estáticas; o ensaio remoto usou fixtures e rollback. | Executar pgTAP e validar Auth/PostgREST/Storage com contas de teste em staging; testar também concorrência de votos, transições/histórico e uploads pela API de Storage. |
| Produção | Reparos pontuais foram aplicados e preservados em `supabase/repairs/`; não houve `db push`, seed ou reset. | Promover a migration de comunidade somente após staging, backup operacional e plano de compensação. |

**Bloqueios atuais:** o proprietário informou Supabase `jfomodkktqfvoytcihgp`. Ainda faltam staging isolado, baseline revisado, runtime para executar o pgTAP completo, concorrência, remoção real via Storage API e implantação coordenada da migration de comunidade. Não compartilhar senhas, tokens ou connection strings com credenciais na conversa. O procedimento detalhado permanece em `supabase/README.md`; os itens acima continuam abertos até suas respectivas evidências existirem.

**Registro histórico de 2026-09-06:** a checagem de acesso anterior manteve `LegacyPlatformAuthRequiredError`; esse registro foi substituído pelos reparos remotos documentados em `STATUS.md`. Os 84 contratos pgTAP continuam pendentes de execução integral em stack isolada.

### Privacidade e conta

- [ ] Definir controlador, domínio e canal real de suporte/privacidade; o endereço antes sugerido ainda não funciona.
- [x] Disponibilizar o caminho dentro do aplicativo e a página web para solicitar exclusão da conta e dados associados.
- [ ] Verificar a URL pública da página e formalizar o atendimento completo, incluindo Auth, avisos, votos, tokens e Storage.
- [ ] Definir bases legais, retenção, backups e prazos com o responsável jurídico.
- [ ] Confirmar que a política pública publicada corresponde exatamente ao comportamento do AAB.

Verificação de 2026-09-06 — **implementação local parcial; lançamento bloqueado**:

| Item | Evidência e pendência |
| --- | --- |
| Controlador e canal | **Documentado em 2026-09-08:** o proprietário informou que ainda serão providenciados. O endereço sem operação foi retirado da política local; falta publicar a versão validada com contato real. |
| Caminho no app e na web | **Confirmado no código e no banco remoto:** botão “Conta”, página `public/account-deletion.html`, login, confirmação de intenção, consulta e protocolo protegido. A URL publicada ainda precisa ser verificada. |
| Registro e atendimento | **Confirmado no código e no banco remoto:** `request_account_deletion()` usa `auth.uid()`, deduplica pedidos e protege leitura por RLS/colunas. **Documentado:** o proprietário confirmou atendimento manual. **Pendente:** ensaio completo de exclusão de Auth/Storage, acompanhamento da fila, recuperação de acesso e comprovação do canal operacional. Registrar um pedido não conclui a exclusão. |
| Retenção e bases legais | Inventário atualizado com a fila; o registro é removido com a conta Auth. Prazos, bases legais, retenção de comprovantes e backups dependem do controlador e da revisão jurídica. |
| Política e AAB | Política local atualizada com o novo pedido e suas limitações; build web e APK debug aprovados. Política e exclusão atualizadas no deploy e HTTP 200 confirmados; aparência e fluxo em aparelho ainda não foram validados. |

Preparação concluída localmente:

- [x] Criar entrada de solicitação no aplicativo e página web identificada como ZelaDF.
- [x] Exigir confirmação e protocolo persistido, tratar erro sem falso sucesso e descartar resposta tardia de outra conta.
- [x] Criar migration nova com identidade derivada, RLS e idempotência; preparar 16 contratos SQL adicionais.
- [x] Atualizar política, inventário, decisão arquitetural e procedimento de atendimento.
- [x] Aprovar a suíte local atual, os três typechecks e o build web.

Os critérios operacionais desta seção continuam abertos. A orientação da loja exige acesso ao pedido pelo app e pela web; implementar essas entradas não comprova atendimento nem aprovação na Play Console. Referência: [requisitos de exclusão de conta do Google Play](https://support.google.com/googleplay/android-developer/answer/13327111).

## 2. Adequação Android e políticas

### Permissões

- [x] Remover `READ_MEDIA_IMAGES` do manifesto fonte; conferir também o artefato final.
- [x] Remover `READ_EXTERNAL_STORAGE`: o seletor do sistema concede acesso ao arquivo escolhido.
- [ ] Confirmar em aparelho que câmera e seletor funcionam sem acesso amplo à galeria.
- [x] Solicitar localização somente por ação do usuário e apenas enquanto o aplicativo está em primeiro plano; validar no aparelho permanece pendente.
- [x] Não solicitar `POST_NOTIFICATIONS` em runtime enquanto push estiver desativado; a permissão declarada no manifesto deve ser reavaliada antes do AAB final.
- [x] Desativar `allowBackup` e excluir dados locais pelas regras de backup e transferência Android.
- [ ] Validar em aparelho que backup/restauração e transferência não restauram sessão ou dados locais.

O Google Play restringe `READ_MEDIA_IMAGES` para aplicativos que realmente precisam de acesso amplo e recorrente. Para uso pontual, a orientação é remover a permissão e usar o seletor do sistema: <https://support.google.com/googleplay/android-developer/answer/15800983>.

**Confirmado no código em 2026-09-08:** ações separadas “Tirar foto” (`image/*` + capture, reconhecido pelo Capacitor) e “Escolher foto do álbum” (MIMEs restritos, sem capture). Ambos mantêm validação de tipo/tamanho. `allowBackup=false` e regras de exclusão cobrem armazenamento WebView, arquivos, preferências e bancos, tanto no backup quanto na transferência Android. Os testes DOM/estáticos passaram; câmera, permissões e restauração ainda exigem aparelho. Referência: [controle de backup Android](https://developer.android.com/identity/data/autobackup).

### Compatibilidade

- [x] Usar `targetSdk 36`, exigido para novos aplicativos e atualizações desde 31/08/2026.
- [ ] Verificar o AAB final para compatibilidade com páginas de memória de 16 KB.
- [ ] Conferir o manifesto mesclado e as permissões reais do bundle, não apenas o manifesto fonte.
- [ ] Executar o relatório de pré-lançamento da Play Console sem falhas bloqueadoras.

Referências: <https://developer.android.com/google/play/requirements/target-sdk> e <https://developer.android.com/guide/practices/page-sizes>.

## 3. Preparar o ambiente Android

- [x] Localizar JDK 21 e confirmar `java -version` (Temurin 21.0.11).
- [x] Instalar Android SDK 36 pelas ferramentas oficiais de linha de comando; Android Studio não é necessário para compilar pela CLI.
- [x] Definir `ANDROID_HOME` no processo de build para `.tools/android-sdk`, sem versionar caminhos pessoais.
- [x] Instalar build-tools e platform-tools compatíveis (36.0.0; Gradle instalou também 35.0.0).
- [ ] Instalar imagem de emulador compatível ou conectar aparelho para os ensaios nativos.
- [x] Confirmar que `android/gradlew.bat` executa com o JDK correto (Gradle 8.14.3 / Java 21).

O mínimo do AGP 8.x é JDK 17, mas o código gerado e as dependências Capacitor deste projeto compilam com `JavaVersion.VERSION_21`; use JDK 21. Referência: <https://developer.android.com/build/jdks>. Ferramentas CLI 22.0 obtidas do site oficial e SHA-256 conferido. Build-tools e platform-tools instalados; imagem de emulador ainda pendente.

## 4. Gerar e sincronizar o aplicativo

Executar na raiz, após validar as variáveis públicas do frontend:

```powershell
pnpm run typecheck
pnpm run typecheck:api
pnpm run test:run
pnpm run build
pnpm exec cap sync android
```

Depois, executar em `android/`:

Nesta máquina, prepare primeiro o terminal na raiz do projeto (valores de ambiente apenas nesta sessão):

```powershell
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot'
$env:ANDROID_HOME = Join-Path (Get-Location) '.tools/android-sdk'
Set-Location android
```

```powershell
.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug :app:assembleDebugAndroidTest
.\gradlew.bat :app:connectedDebugAndroidTest
```

- [x] Confirmar que `dist/` e os assets Android representam o mesmo build; 19 arquivos conferidos também dentro do APK debug.
- [ ] Gerar um upload key/keystore e guardá-lo fora do repositório, com backup seguro.
- [x] Preparar assinatura por variáveis de ambiente; preencher e validar com a chave real permanece pendente.
- [ ] Gerar o AAB de release assinado; `bundleRelease` sozinho não basta sem uma assinatura configurada.
- [ ] Guardar com segurança alias, senhas e certificado do upload key.
- [ ] Nunca colocar `.jks`, `.keystore`, senhas ou propriedades de assinatura no Git.

Novos aplicativos usam Android App Bundle e Play App Signing: <https://developer.android.com/studio/publish/upload-bundle>.

`android/app/build.gradle` lê somente `ZELADF_UPLOAD_STORE_FILE`, `ZELADF_UPLOAD_STORE_PASSWORD`, `ZELADF_UPLOAD_KEY_ALIAS` e `ZELADF_UPLOAD_KEY_PASSWORD` do ambiente. O keystore deve existir fora do projeto. `preReleaseBuild` falha quando a configuração está incompleta ou o arquivo está dentro do repositório. Não passar senhas por argumentos de shell nem registrar seus valores. Nenhuma chave foi criada e nenhum AAB assinado foi gerado nesta preparação.

### Validação executada em 2026-09-13

- [x] 145 testes Vitest, 33 cenários Playwright desktop/mobile, TypeScript frontend/API/E2E e build web aprovados; bundle principal 645,42 kB, com aviso de tamanho conhecido.
- [x] `:app:testDebugUnitTest`: 3 testes, zero falhas.
- [x] `:app:assembleDebug` e `:app:assembleDebugAndroidTest`: APKs compilados. O módulo do produto passou; avisos de `flatDir` das bibliotecas Capacitor não bloqueiam o build.
- [x] Manifesto debug mesclado: sem permissões amplas de mídia, backup desativado, regras XML incluídas e consulta específica ao app de câmera adicionada. Câmera/GPS não filtram obrigatoriamente dispositivos na loja.
- [x] Varredura de 541 entradas do APK: nenhuma ocorrência de chave privada PEM, JSON `private_key`, token `sb_secret_` ou JWT `service_role` nos padrões procurados. Isso não audita histórico Git nem logs remotos.
- [x] `zipalign -c -P 16 4` passou; os segmentos LOAD das quatro bibliotecas `libdatastore_shared_counter.so` têm alinhamento de 16384 bytes. Evidência limitada ao debug; repetir no AAB final e em aparelho de 16 KB.
- [x] `:app:validateUploadSigning` falhou conforme esperado por ausência das quatro variáveis de assinatura; não gerou release.
- [ ] Executar os testes instrumentados compilados e validar os fluxos em aparelho; `adb devices` não encontrou aparelho nem emulador configurado.

Artefatos locais: `android/app/build/outputs/apk/debug/app-debug.apk` e `android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk`. São artefatos de desenvolvimento, não o AAB exigido para lançamento. SHA-256 do APK debug: `F7B738603EFFDF5E85BFA35292C4A6C6B89E0D918B44F7118D84E4E565003866`.

## 5. Testes obrigatórios antes do envio

**Confirmado na execução local:** 33 cenários Playwright desktop/mobile aprovados, sem retries, além de 145 testes Vitest, os três typechecks e o build web. Foram exercitados visitante, login OTP/logout, autor/não autor/operador, criação com consentimento e foto, edição/exclusão, votos com falha e latência, status/histórico, solicitação de exclusão, páginas de privacidade, falha de leitura e GPS negado. As respostas de Auth, banco, Storage e provedores continuam simuladas.

- [x] Implementar e executar a suíte web isolada, sem carregar `.env` nem alterar serviços reais; instruções e matriz em `e2e/README.md`.
- [x] Registrar relatório em `playwright-report/index.html` e screenshots em `test-results/`, ignorados no Git/deploy.

As respostas de Auth, banco, Storage e provedores são simuladas. Os itens abaixo continuam exigindo integração real e/ou Android; a aprovação da suíte não os conclui. O APK debug mais recente foi sincronizado após as correções locais, mas ainda não é um AAB assinado de produção.

- [ ] Instalar o release assinado em aparelho ou por faixa interna da Play Console.
- [ ] Testar Android 7/API 24, uma versão intermediária e Android 16/API 36 quando possível.
- [ ] Testar inicialização, rotação, retorno do segundo plano e ausência de rede.
- [ ] Testar login por e-mail, telefone e Google conforme os provedores realmente habilitados.
- [ ] Testar deep link de retorno do OAuth.
- [ ] Testar GPS permitido, negado, indisponível e localização manual.
- [ ] Testar câmera, seletor de foto, upload, substituição e exclusão.
- [ ] Testar criação, edição, exclusão e voto com RLS real.
- [ ] Testar conta autora, outra conta, visitante e operador.
- [ ] Testar o pedido de exclusão de conta de ponta a ponta.
- [ ] Confirmar que falha do Supabase não apresenta dados demonstrativos como se fossem reais.
- [ ] Verificar logs e relatórios para garantir ausência de tokens, localização, texto livre e dados pessoais.

## 6. Preparar a Play Console

### Conta e aplicativo

- [ ] Confirmar que a conta de desenvolvedor e sua identidade estão verificadas.
- [ ] Confirmar se a conta pessoal foi criada após 13/11/2023; nesse caso, planejar teste fechado com pelo menos 12 participantes por 14 dias contínuos.
- [ ] Criar o aplicativo usando `com.zeladf.app`; o package name não deve ser tratado como facilmente alterável depois da publicação.
- [ ] Ativar Play App Signing e registrar o certificado do upload key.

Regra de teste para novas contas pessoais: <https://support.google.com/googleplay/android-developer/answer/14151465>.

### Ficha da loja

- [x] Preparar nome, descrição curta, descrição completa e categoria proposta em `release/STORE_LISTING.md`.
- [x] Preparar ícone de 512 px, imagem de destaque e três capturas locais em `release/assets/`; validar em aparelho real continua pendente.
- [ ] Usar imagens do aplicativo real, sem prometer encaminhamento oficial a órgãos públicos.
- [ ] Informar claramente que o ZelaDF é um mapa comunitário e não um aplicativo oficial do governo.
- [x] Publicar a política atualizada e confirmar URL HTTPS; antes do envio, acrescentar identidade/contato operacional e revisar novamente.
- [ ] Informar e-mail de suporte operacional e, se aplicável, site e telefone.

### Conteúdo do aplicativo

- [x] Preparar o inventário de Data Safety em `release/DATA_SAFETY.md`; preencher e confirmar a declaração final na Console ainda é obrigatório.
- [ ] Declarar corretamente localização precisa/aproximada, fotos, IDs de usuário, autenticação e conteúdo enviado pelo usuário.
- [x] Publicar a página de exclusão de conta e confirmar HTTP 200; informar à Console após validar atendimento completo.
- [ ] Preencher classificação indicativa, público-alvo, anúncios e acesso ao aplicativo.
- [ ] Fornecer uma conta ou instrução válida para a equipe de revisão acessar fluxos autenticados.
- [ ] Responder às declarações de permissões conforme o manifesto final.

Todos os aplicativos publicados devem preencher Data Safety e fornecer política de privacidade: <https://support.google.com/googleplay/android-developer/answer/10787469>. Aplicativos com criação de conta precisam oferecer solicitação de exclusão no app e pela web: <https://support.google.com/googleplay/android-developer/answer/13327111>.

## 7. Ordem de publicação

1. Criar o aplicativo como rascunho na Play Console.
2. Enviar o primeiro AAB para **teste interno**.
3. Corrigir avisos do App Bundle Explorer e do relatório de pré-lançamento.
4. Executar testes reais e registrar resultados.
5. Iniciar **teste fechado** quando a ficha e as declarações estiverem completas.
6. Cumprir os requisitos de testadores aplicáveis à conta.
7. Solicitar acesso à produção, quando exigido.
8. Publicar inicialmente com rollout gradual, se a Play Console disponibilizar essa opção.
9. Monitorar Android Vitals, falhas, ANRs, autenticação, API e Storage.
10. Interromper o rollout se houver regressão de dados, segurança, login ou crash.

## Critério final de liberação

O ZelaDF estará pronto para produção somente quando:

- [ ] todos os bloqueadores críticos deste documento estiverem concluídos;
- [ ] o AAB estiver assinado, instalado e testado;
- [ ] o Supabase de produção estiver auditado e protegido;
- [ ] privacidade e exclusão de conta estiverem operacionais;
- [ ] não houver permissão ampla sem justificativa aprovada;
- [ ] a Play Console não apresentar erro ou declaração pendente;
- [ ] o teste interno/fechado não revelar falha bloqueadora;
- [ ] houver plano de monitoramento e rollback.

Até lá, a classificação correta é: **MVP web funcional e Android em preparação para teste interno**.

## Mensagem de revisão obrigatória

**Todo o trabalho descrito neste checklist deverá passar por revisão completa antes do lançamento.** A revisão deve abranger o código, o AAB assinado, o manifesto mesclado, permissões, declarações da Play Console, políticas de privacidade e exclusão de conta, RLS/Storage, secrets, testes em aparelho e o plano de monitoramento/rollback. Nenhum item marcado como preparado localmente substitui essa revisão final.
