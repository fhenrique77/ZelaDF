# ZelaDF - Decisões Técnicas

Este arquivo registra decisões observadas no código. Quando a justificativa original não está documentada, ela não é presumida.

## Comunidade e lançamento — 2026-09-13

**Confirmado no código e implantado remotamente em 2026-09-13:** aceite versionado antes de criar/enviar foto, denúncias de aviso/autor, bloqueio por conta e revisão administrativa manual. Dados ficam em tabelas privadas; RPCs recebem somente IDs públicos de aviso e derivam todos os IDs Auth da sessão/do banco. A UI continua identificando autores como Cidadão.

RLS filtra avisos bloqueados para a conta e ocultos pela administração para outros leitores; o autor preserva acesso para editar/excluir seu conteúdo. A RPC pública de voto envolve a implementação atômica privada para impedir confirmação por ID de conteúdo que o votante não pode consultar. A cláusula de autoria na policy suporta INSERT RETURNING sem depender da visibilidade da linha recém-inserida em uma subconsulta.

Moderação não equivale a exclusão física: fotos de avisos ocultos precisam ser removidas administrativamente pela Storage API quando violarem as regras. A rotina e a retenção estão em release/COMMUNITY_MODERATION.md. Rollout deve coordenar SQL e frontend: clientes antigos não registram aceite e deixam de publicar após a nova regra de banco.

## DEC-001 - Supabase como backend principal

**Status:** Ativa.

**Contexto:** a aplicação precisa de autenticação, banco relacional e armazenamento de fotos.

**Decisão:** usar Supabase Auth, PostgreSQL e Storage.

**Consequências positivas:** uma única plataforma atende os três recursos e reduz infraestrutura própria.

**Consequências negativas:** disponibilidade e configuração externa tornam-se dependências centrais.

**Observações:** motivo original não documentado. A decisão foi identificada a partir do código atual.

## DEC-002 - CRUD principal direto do frontend para o Supabase

**Status:** Ativa; autorização principal aplicada e ensaiada remotamente em 2026-09-13 por reparos pontuais. Comunidade implantada coordenadamente em 2026-09-13.

**Contexto:** `src/lib/reportService.ts` executa queries e uploads usando o cliente público.

**Decisão:** não intermediar o CRUD por backend próprio.

**Consequências positivas:** fluxo simples e menor quantidade de código de servidor.

**Consequências negativas:** RLS, constraints e funções de banco precisam garantir toda autorização e integridade; controles React são contornáveis.

**Observações:** preservar a dependência crítica de RLS em qualquer mudança. Nunca usar `service_role` no cliente.

## DEC-003 - SPA React sem roteador

**Status:** Ativa.

**Contexto:** mapa, lista, detalhe, autenticação e formulários coexistem em uma única superfície.

**Decisão:** controlar painéis e modais por estado em `App.tsx`, sem rotas de página.

**Consequências positivas:** navegação simples e foco contínuo no mapa.

**Consequências negativas:** não há URLs compartilháveis para avisos e `App.tsx` concentra orquestração.

**Observações:** motivo original não documentado. Não introduzir roteador sem requisito concreto.

## DEC-004 - Capacitor para o aplicativo Android

**Status:** Ativa.

**Contexto:** o mesmo frontend é distribuído como aplicação nativa Android e usa recursos do dispositivo.

**Decisão:** empacotar `dist` com Capacitor e plugins nativos.

**Consequências positivas:** reutilização do frontend e acesso a GPS, push, deep links e UI nativa.

**Consequências negativas:** mudanças web podem exigir build/sync; permissões e configuração nativa precisam ser mantidas separadamente.

**Observações:** somente Android está presente. Não assumir suporte iOS.

## DEC-005 - Leaflet com tiles padrão do OpenStreetMap

**Status:** Ativa.

**Contexto:** a interface principal exige visualização geográfica e marcadores interativos.

**Decisão:** usar React Leaflet/Leaflet e o endpoint padrão `tile.openstreetmap.org`, com atribuição visível aos contribuidores do OpenStreetMap. O WebView Android acrescenta `ZelaDF/1.0` ao User-Agent para identificar a aplicação.

**Consequências positivas:** mapa integrado diretamente aos componentes React.

**Consequências negativas:** o serviço é comunitário, não possui SLA e pode bloquear uso pesado ou incompatível com sua política. Não permite download antecipado ou mapas offline.

**Observações:** a CARTO foi removida após passar a exigir chave. Preservar atribuição, Referer no navegador, identificação no Android e cache HTTP. Reavaliar o provedor antes de uso comercial ou crescimento relevante.

## DEC-006 - Nominatim para geocodificação reversa

**Status:** Ativa.

**Contexto:** o usuário marca coordenadas, mas o formulário precisa de RA e endereço legíveis.

**Decisão:** consultar Nominatim diretamente do cliente somente após ação explícita para sugerir endereço, com alternativa de preenchimento manual, cache em memória, mapeamento de aliases e intervalo mínimo local.

**Consequências positivas:** preenchimento automático sem backend geográfico próprio.

**Consequências negativas:** coordenadas são enviadas a terceiro; limite é local por instância e disponibilidade externa afeta o formulário.

**Observações:** a ação explícita e a transparência sobre o envio das coordenadas foram adotadas na revisão de privacidade de 2026-09-04. Revisar política de uso e provedor antes de aumentar volume.

## DEC-007 - Categorias e órgãos configurados no frontend

**Status:** Ativa.

**Contexto:** cada categoria precisa de aparência, órgão, sigla e telefone.

**Decisão:** manter `CATEGORIES` em `src/data.ts`, sem tabela administrativa.

**Consequências positivas:** leitura simples, tipos fechados e nenhuma consulta adicional.

**Consequências negativas:** mudança de órgão/telefone exige nova versão; dados podem ficar desatualizados e não há gestão por operador.

**Observações:** a associação é orientação. Não representa integração ou encaminhamento ao órgão.

## DEC-008 - Confirmações persistidas em `votes`

**Status:** Ativa no código local; migrations e validação externa pendentes.

**Contexto:** o sistema registra quais ocorrências foram confirmadas. A UI exige autenticação, enquanto o contrato histórico também aceitava identidade por dispositivo.

**Decisão:** usar `votes` como fonte canônica e aceitar novas mutações somente pela RPC idempotente `set_report_vote`, que obtém o usuário de `auth.uid()`. A regra é um voto por conta e aviso. `device_id` permanece apenas por compatibilidade histórica e não participa mais da unicidade.

**Consequências positivas:** repetição da mesma intenção não duplica votos; clientes não escolhem `user_id`; contas diferentes no mesmo aparelho não entram em conflito.

**Consequências negativas:** linhas anônimas históricas continuam existindo e contando; a FK Auth local está `NOT VALID` até o saneamento do histórico; aplicação depende de migrations e auditoria remota.

**Observações:** `20260905000100_make_votes_atomic.sql` centraliza a mutação, e `20260905000200_secure_reports_votes_and_storage.sql` adiciona FK e privilégio de leitura somente de `report_id`. Nenhuma foi aplicada remotamente.

## DEC-009 - Contador desnormalizado em `reports`

**Status:** Ativa como cache materializado no código local; migration pendente.

**Contexto:** lista e detalhe leem o total de confirmações junto ao aviso.

**Decisão:** manter `reports.confirmations` para leitura, mas derivá-lo exclusivamente de `votes`. A migration reconcilia valores existentes, inicia novos avisos em zero, atualiza o contador por triggers na mesma transação e bloqueia alterações diretas.

**Consequências positivas:** leitura continua direta e as atualizações concorrentes usam operações incrementais serializadas na linha do aviso.

**Consequências negativas:** o contador continua desnormalizado e exige que migrations/triggers permaneçam ativos; alterações administrativas fora do fluxo precisam preservar esse contrato.

**Observações:** `votes` é a fonte canônica. A RPC trava o aviso com `FOR UPDATE`, o trigger aplica incrementos/decrementos atômicos e a resposta devolve o valor materializado ao cliente. O contrato ainda não foi executado sob concorrência em banco local/staging.

## DEC-010 - Push via Supabase, Vercel e Firebase

**Status:** Preparada localmente e inativa por padrão.

**Contexto:** o autor deve ser avisado quando o status de seu aviso mudar.

**Decisão:** manter o fluxo inativo até validação externa. Quando habilitado, uma ação explícita no Android registra o token em `push_tokens`; o logout o remove antes de encerrar a sessão. Um webhook autenticado chama `POST /api/send-push`, que busca tokens com `service_role`, envia via FCM e remove registros definitivamente inválidos. Cliente e servidor exigem flags independentes, desligadas por padrão.

**Consequências positivas:** envio fica fora do frontend, tokens possuem RLS/ciclo de cleanup e uma configuração incompleta falha fechada sem solicitar permissão ao usuário.

**Consequências negativas:** adiciona dependências de migration, trigger privado, RLS, webhook, Vercel, secrets, Firebase, opt-in de UI e permissões Android.

**Observações:** `20260904000400_create_push_tokens.sql` existe apenas localmente. O arquivo local de service account encontrado na raiz foi removido em 2026-09-05 e não deve ser restaurado; a função aceita a credencial somente por `FIREBASE_SERVICE_ACCOUNT` no servidor. Uma consulta somente leitura confirmou esse nome e `PUSH_SECRET` como secrets ocultos na Vercel, mas não seus valores ou rotação. `VITE_PUSH_ENABLED` continua falsa e `PUSH_ENABLED` permanece ausente; não há ação de opt-in nem webhook versionado. A origem local de mudanças de status foi definida na DEC-018, mas não foi aplicada remotamente. Não tratar o fluxo como operacional.

## DEC-011 - Dados demonstrativos como fallback

**Status:** Ativa.

**Contexto:** a interface precisa funcionar sem configuração Supabase durante demonstração/desenvolvimento.

**Decisão:** retornar oito avisos locais somente quando Supabase não está configurado e identificar esse modo na interface. Quando uma consulta configurada falha, preservar os dados anteriores e apresentar erro com ação de nova tentativa.

**Consequências positivas:** permite apresentar a interface offline.

**Consequências negativas:** criação offline não persiste após recarga e os exemplos ainda dependem de imagens externas.

**Observações:** motivo original do modo demo não documentado. A separação entre demonstração e erro foi implementada em 2026-09-04.

## DEC-012 - SQL histórico na raiz e novas migrations ordenadas

**Status:** Em transição.

**Contexto:** schema inicial, seed, autoria e Storage eram instruções manuais. O estado remoto não está acessível para produzir um `db pull` confiável.

**Decisão:** preservar e verificar por hash os SQLs históricos; reconstruir sua evolução em migrations anteriores às mudanças novas; manter dados demo em `supabase/seed.sql`; e exigir auditoria/comparação remota antes de reparar histórico ou executar `db push`.

**Consequências positivas:** uma instalação nova tem sequência explícita, seed separado e procedimento consistente por ambiente, sem invalidar o histórico conhecido.

**Consequências negativas:** o baseline reconstruído pode divergir do banco real e não pode ser adotado remotamente até comparação e alinhamento do histórico. As policies inseguras existem na reconstrução histórica e são substituídas somente pela migration final de autorização.

**Observações:** `supabase/README.md` define auditoria, promoção e rollback. Nenhuma migration foi aplicada remotamente e `db reset` local não foi executado por ausência de CLI/Docker.

## DEC-013 - Órgãos públicos como orientação, não integração

**Status:** Comportamento atual confirmado.

**Contexto:** a UI apresenta órgão e telefone por categoria.

**Decisão:** oferecer contato por link `tel:` sem transmitir o aviso.

**Consequências positivas:** orientação simples sem depender de APIs governamentais.

**Consequências negativas:** não existe protocolo, acompanhamento oficial ou garantia de recebimento; o texto da UI pode sugerir mais do que o sistema faz.

**Observações:** qualquer encaminhamento oficial futuro será uma nova decisão arquitetural e de negócio, não uma extensão implícita do comportamento atual.

## DEC-014 - Plataformas atuais e indexação

**Status:** Ativa para o estado atual.

**Contexto:** o repositório contém uma aplicação web responsiva e um projeto Android Capacitor. Não há projeto iOS, manifesto/service worker de PWA ou domínio público canônico confirmado. A configuração do Figma Make desativa indexação.

**Decisão:** tratar web responsiva e Android como as plataformas suportadas e manter a distribuição atual como `noindex`. Não anunciar PWA ou iOS e não declarar URL canônica até que essas decisões sejam tomadas e implementadas.

**Consequências positivas:** comunicação e metadados correspondem ao que pode ser confirmado no repositório.

**Consequências negativas:** descoberta por mecanismos de busca permanece desativada e uma futura publicação exigirá revisar robots, domínio, contato e metadados.

**Observações:** o domínio e o endereço de contato operacionais são estado externo não verificável. O arquivo de verificação Google foi preservado por poder depender de configuração externa.

## DEC-015 - Consultas limitadas pelo viewport

**Status:** Ativa.

**Contexto:** a consulta original carregava toda a tabela `reports` e aplicava filtros no navegador, causando crescimento linear de tráfego, memória e renderização.

**Decisão:** consultar no máximo os 200 avisos mais recentes dentro dos bounds visíveis. Categoria, status e autoria são enviados ao Supabase; votos são buscados somente para os avisos retornados. O mapa consulta após 300 ms sem movimento, preserva refresh manual e ignora respostas antigas. Realtime não faz parte desta etapa.

**Consequências positivas:** volume por resposta é limitado, índices podem atender filtros e o cliente não precisa materializar toda a base.

**Consequências negativas:** avisos além dos 200 mais recentes exigem aproximar o mapa; não há cursor, visão global exata ou atualização automática de mudanças externas.

**Observações:** a migration `supabase/migrations/20260904000100_add_report_query_indexes.sql` prepara índices, mas não foi aplicada remotamente. Orçamento inicial: até 200 linhas por resposta, apenas uma consulta após 300 ms de estabilização do viewport e p95 de até 1,5 s para carregar `reports` e `votes`. A latência de produção ainda precisa ser medida.

## DEC-016 - Validação compartilhada e cleanup de fotos via API

**Status:** Ativa no código local; migration pendente de aplicação.

**Contexto:** o frontend acessa Supabase diretamente, uploads podiam falhar sem interromper a criação e fotos substituídas ou excluídas não eram removidas.

**Decisão:** centralizar limites em `reportValidation.ts`, repetir constraints no PostgreSQL, restringir o bucket por tamanho/MIME e remover objetos exclusivamente pela Storage API. Criação e edição fazem cleanup do novo upload quando a escrita no banco falha; substituição e exclusão removem a foto anterior após a mutação principal.

**Consequências positivas:** entradas inválidas são bloqueadas cedo, falhas ficam visíveis e o risco de arquivos órfãos diminui.

**Consequências negativas:** cleanup após sucesso no banco é best effort; falhas de rede/policy ainda podem deixar objeto órfão e exigem alerta/limpeza posterior. O caminho continua derivado da URL pública porque o modelo não possui coluna própria para o caminho do objeto.

**Observações:** a migration `supabase/migrations/20260904000200_add_report_validation_and_photo_policies.sql` não foi aplicada remotamente. Policies existentes devem ser auditadas porque policies permissivas são combinadas por `OR`.

## DEC-017 - Identidade pública genérica e autoria interna

**Status:** Ativa no código local; saneamento remoto pendente.

**Contexto:** `displayName()` podia persistir metadados Google, prefixo de e-mail ou telefone em `reports.author_name`, tornando dados de conta visíveis em um aviso público.

**Decisão:** usar somente `Cidadão` como identidade pública. A consulta geral seleciona apenas colunas com `GRANT` público; RPCs autenticadas derivam o ator de `auth.uid()` e retornam somente IDs/campos públicos dos avisos da própria conta para calcular `isOwner` e “meus avisos”. Dados da conta permanecem restritos à autenticação e ao rótulo privado do próprio usuário.

**Consequências positivas:** telefone, e-mail e nome de perfil deixam de integrar novas publicações e de aparecer no detalhe; a carga pública do cliente não inclui `author_id` ou `author_name`.

**Consequências negativas:** há uma consulta/RPC adicional para descobrir autoria; a coluna legada continua no schema por compatibilidade; o contrato depende de aplicar e auditar grants, policies e funções no ambiente remoto.

**Observações:** `20260904000300_minimize_public_author_identity.sql` apaga irreversivelmente valores históricos de `author_name`; `20260905000200_secure_reports_votes_and_storage.sql` restringe leitura das colunas internas. Nenhuma foi aplicada remotamente, e a rotina server-side de exclusão descrita em `PRIVACY.md` continua pendente.

## DEC-018 - Status controlado por operador interno e histórico atômico

**Status:** Ativa no código local; validação de negócio e aplicação remota pendentes.

**Contexto:** os avisos exibiam `aberto`, `andamento` e `resolvido`, mas nenhuma operação autorizada alterava esses estados e o push não possuía origem confiável.

**Decisão:** criar `operator_users` como papel interno do ZelaDF, sem atribuição automática. Todo aviso nasce aberto. Operadores confirmados pelo banco alteram status somente por `change_report_status`, com motivo obrigatório de 10 a 500 caracteres. São aceitas as transições aberto → andamento/resolvido, andamento → aberto/resolvido e resolvido → aberto. Um trigger valida a operação e grava status anterior/novo, motivo, ator e timestamp na mesma transação.

**Consequências positivas:** frontend não define autorização, mudanças possuem autoria e trilha de auditoria, resolução/reabertura exigem justificativa e o webhook de push pode reagir somente ao ciclo reconhecido.

**Consequências negativas:** é necessário provisionar/revogar operadores por processo administrativo protegido; o motivo passa a ser dado operacional retido; não existe painel de gestão de papéis; o contrato adotado ainda precisa de confirmação do negócio.

**Observações:** operador significa equipe interna do ZelaDF, não servidor ou representante de órgão público. A migration `20260904000500_create_status_workflow.sql` não foi aplicada remotamente. O motivo original das três opções de status não estava documentado; as transições são uma decisão conservadora inferida do produto atual.

## DEC-019 - Autorização por identidade Auth, RLS e menor privilégio

**Status:** Ativa no código local; auditoria e aplicação remota pendentes.

**Contexto:** o baseline histórico permitia escrita pública, o cliente escolhia `author_id` e grants amplos permitiam solicitar colunas internas. Como o CRUD é direto do frontend, a interface não pode ser a fronteira de autorização.

**Decisão:** visitantes leem somente colunas públicas de avisos. Uma conta autenticada cria avisos cuja autoria é atribuída por trigger a partir de `auth.uid()`, vota somente pela RPC e lê apenas o `report_id` dos próprios votos. O autor atualiza categoria, título, descrição e foto e exclui o próprio aviso. Operadores não ganham edição de conteúdo; alteram status somente pela RPC específica. Consultas de autoria usam `get_my_report_ids`/`get_my_reports`, sem liberar `author_id`. Fotos novas usam pasta com o ID Auth e policies verificam pasta e `owner_id`.

**Consequências positivas:** chamadas diretas com a chave pública não podem escolher autoria, alterar campos internos, editar/excluir conteúdo de terceiros ou acessar identidades de votos. Conta, avisos e votos passam a ter relacionamentos com cascade para novas referências.

**Consequências negativas:** o frontend e a migration precisam ser promovidos de forma coordenada; clientes antigos que enviam campos internos ou fotos na raiz deixam de funcionar. FKs `NOT VALID` não certificam o histórico, e policies adicionais existentes no Storage remoto podem ampliar acesso por combinação permissiva.

**Observações:** a matriz foi inferida do comportamento atual da UI e das decisões de privacidade. A migration `20260905000200_secure_reports_votes_and_storage.sql` não foi aplicada; antes disso, auditar policies/grants remotos, sanear referências Auth, validar FKs e executar os 68 casos pgTAP em staging.

## DEC-020 - Solicitação autenticada de exclusão com protocolo

**Status:** implementada localmente; validação de banco e operação pendentes.

**Decisão:** a web e o aplicativo usam `request_account_deletion()` para registrar um pedido por conta, identificado exclusivamente por `auth.uid()`. A tabela `account_deletion_requests` expõe ao usuário somente protocolo, data e situação da própria solicitação. Repetições preservam o pedido original. Não coletar justificativa ou contato adicional nem conceder a operadores de avisos acesso à fila de privacidade.

**Consequências:** recebimento é verificável por protocolo persistido, sem simular exclusão imediata. A fila permanece até exclusão Auth por cascade. Não existe processamento automático; atendimento, reautenticação antes da remoção, recuperação de acesso e retenção do comprovante devem ser definidos pelo controlador e testados antes do lançamento. `PRIVACY.md` descreve os passos e bloqueios. A migration nova não altera SQLs históricos nem foi aplicada remotamente.

## DEC-021 - Excluir armazenamento local do backup Android

**Status:** implementada e compilada em debug; ensaio de restauração em aparelho pendente.

**Decisão:** excluir todos os domínios locais do app do backup e da transferência entre aparelhos. O manifesto desativa backup e referencia regras para Android antigo e Android 12+. A sessão persistida pela WebView não deve ser restaurada em outra instalação. O estado persistente do produto é recuperado dos serviços após autenticação; os backups remotos mantêm seu procedimento próprio.

**Consequências:** reinstalação/troca de aparelho exige novo login e não restaura preferências ou arquivos locais. Testes estáticos conferem os domínios excluídos, mas não substituem restauração real nem comprovam o comportamento de todas as fabricantes.
