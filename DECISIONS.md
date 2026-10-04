# ZelaDF - Decisões Técnicas

Este arquivo registra decisões observadas no código. Quando a justificativa original não está documentada, ela não é presumida.

## Comunidade e lançamento — 2026-09-13

**Confirmado no código e implantado remotamente em 2026-09-13:** aceite versionado antes de criar/enviar foto, denúncias de aviso/autor, bloqueio por conta e revisão administrativa manual. Dados ficam em tabelas privadas; RPCs recebem somente IDs públicos de aviso e derivam todos os IDs Auth da sessão/do banco. A UI continua identificando autores como Cidadão.

RLS filtra avisos bloqueados para a conta e ocultos pela administração para outros leitores; o autor preserva acesso para editar/excluir seu conteúdo. A RPC pública de voto envolve a implementação atômica privada para impedir confirmação por ID de conteúdo que o votante não pode consultar. A cláusula de autoria na policy suporta INSERT RETURNING sem depender da visibilidade da linha recém-inserida em uma subconsulta.

Moderação não equivale a exclusão física: fotos de avisos ocultos precisam ser removidas administrativamente pela Storage API quando violarem as regras. A rotina e a retenção estão em release/COMMUNITY_MODERATION.md. Rollout deve coordenar SQL e frontend: clientes antigos não registram aceite e deixam de publicar após a nova regra de banco.

## DEC-001 - Supabase como backend principal

**Status:** Ativa como infraestrutura atual; migração gradual da camada de API planejada em DEC-022.

**Contexto:** a aplicação precisa de autenticação, banco relacional e armazenamento de fotos.

**Decisão:** usar Supabase Auth, PostgreSQL e Storage.

**Consequências positivas:** uma única plataforma atende os três recursos e reduz infraestrutura própria.

**Consequências negativas:** disponibilidade e configuração externa tornam-se dependências centrais.

**Observações:** motivo original não documentado. A decisão foi identificada a partir do código atual.

## DEC-002 - CRUD principal direto do frontend para o Supabase

**Status:** Ativa durante a transição; substituição gradual planejada em DEC-022. Autorização principal aplicada e ensaiada remotamente em 2026-09-13 por reparos pontuais. Comunidade implantada coordenadamente em 2026-09-13.

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

**Decisão:** manter o fluxo inativo até decisão do produto e validação externa. O módulo FastAPI 8 preserva a função Vercel como único consumidor, sem introduzir chave administrativa na API pública. Quando habilitado, uma ação explícita no Android registra o token em `push_tokens`; o logout o remove antes de encerrar a sessão. Um trigger do histórico grava somente o ID em `push_status_events`, e o webhook autenticado dessa tabela chama `POST /api/send-push` sem enviar motivo ou ID do operador. A função reivindica o evento por RPC exclusiva de `service_role`, busca tokens, envia via FCM e remove registros definitivamente inválidos. Cliente e servidor exigem flags independentes, desligadas por padrão.

**Consequências positivas:** envio fica fora do frontend, tokens possuem RLS/ciclo de cleanup e uma configuração incompleta falha fechada sem solicitar permissão ao usuário.

**Consequências negativas:** adiciona dependências de migration, trigger privado, RLS, webhook, Vercel, secrets, Firebase, opt-in de UI e permissões Android.

**Observações:** `20260904000400_create_push_tokens.sql` e `20260925000100_push_status_event_claim.sql` não foram aplicadas por esta tarefa. A reivindicação atômica impede reenvio do mesmo ID, mas uma falha após a reivindicação pode perder a entrega; o produto deve aceitar esse limite de melhor esforço. O arquivo local de service account encontrado na raiz foi removido em 2026-09-05 e não deve ser restaurado; a função aceita a credencial somente por `FIREBASE_SERVICE_ACCOUNT` no servidor. Uma consulta somente leitura confirmou esse nome e `PUSH_SECRET` como secrets ocultos na Vercel, mas não seus valores ou rotação. `VITE_PUSH_ENABLED` continua falsa e `PUSH_ENABLED` permanece ausente; não há ação de opt-in nem webhook ativo confirmado. Não tratar o fluxo como operacional.

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

**Contexto:** o repositório contém uma aplicação web responsiva e um projeto Android Capacitor. Não há projeto iOS, manifesto/service worker de PWA ou domínio público canônico confirmado. `index.html` e `public/robots.txt` desativam a indexação.

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

## DEC-022 - Migrar a camada de API gradualmente para FastAPI

**Status:** decisão de direção tomada em 2026-09-23; inventário e contrato local do módulo 0 preparados em 2026-09-24. Fundação local e módulos 2 a 7 implementados em `backend/`; o módulo 7 é administrativo, e as flags do cliente seguem desligadas. Staging e ativação pendentes.

**Contexto:** o proprietário decidiu substituir gradualmente o acesso direto do app aos dados por um backend próprio em Python/FastAPI. Auth, PostgreSQL, Storage, RLS e RPCs do Supabase já sustentam fluxos em produção; a migração precisa preservar web, Android e clientes antigos.

**Decisão:** criar uma API FastAPI versionada e mover um fluxo por vez. Supabase permanece inicialmente como infraestrutura de Auth, banco e fotos. As regras de autoria, votos, status e acesso continuam protegidas no banco. Cada escrita terá uma única origem ativa; a retirada do acesso direto será decidida somente após migração e validação dos clientes suportados. Ordem, critérios e limites estão em `docs/BACKEND_PRODUCAO.md`.

**Consequências:** a API permite concentrar integrações e operações administrativas, mas acrescenta hospedagem, monitoramento, contratos HTTP, validação de tokens e compatibilidade durante a transição. A escolha de provedor, configuração remota e alterações de grants dependem de etapas próprias; este plano não autoriza deploy ou migration.

**Escolha inicial de hospedagem e mídia:** API HTTP FastAPI em projeto Vercel separado do frontend, ainda não criado; fotos de até 5 MiB continuam sendo transmitidas diretamente ao Supabase Storage com JWT do usuário, pois Vercel Functions limitam o corpo da requisição a 4,5 MB. A API verificará caminho e ownership antes de associar a foto. A execução durável da exclusão de conta foi separada da API pública na DEC-025. Ver `docs/BACKEND_PRODUCAO.md`.

## DEC-023 - Criação de avisos idempotente na API FastAPI

**Status:** implementada localmente em 2026-09-24; migration e fluxo real em staging pendentes.

**Decisão:** o cliente do módulo 4 gera um UUID por conteúdo do formulário e o envia em `Idempotency-Key`. A RPC `create_report_idempotent` mantém chave, hash e aviso na mesma transação, sob trava por conta/chave. Repetição com o mesmo corpo retorna o aviso existente; corpo diferente ou aviso já excluído gera conflito. A função deriva autoria de `auth.uid()`, confere aceite de termos e foto pertencente à conta antes de inserir. A foto é enviada diretamente ao Storage com JWT da conta; a API recebe somente o caminho. Edição e exclusão continuam sujeitas à RLS e à confirmação da linha afetada.

**Consequências:** resposta perdida após commit não duplica aviso; registros de chave são removidos por cascade quando a conta Auth for excluída. A criação passa a depender da nova migration local `20260924000100_fastapi_report_create_idempotency.sql`; não ligar a flag antes de comparar e testar o schema real. Banco e Storage não formam uma única transação: falhas conhecidas de remoção entram em fila privada, cujo executor ainda precisa ser implementado; uploads que não chegam à API exigem varredura própria. Clientes antigos permanecem no contrato direto atual até migração comprovada.

## DEC-024 - Separar status operacional da revisão de denúncias na API

**Status:** implementada localmente no módulo FastAPI 6; ensaio remoto pendente.

**Decisão:** a API encaminha aceite, denúncias e bloqueios somente às RPCs públicas já protegidas por `auth.uid()`; devolve ao cliente apenas o protocolo da denúncia. O papel `operator_users` é usado para consultar o histórico operacional e alterar status por `change_report_status`, com motivo obrigatório e histórico transacional. A revisão de denúncias continua restrita ao canal administrativo privado existente, sem rota FastAPI nem concessão implícita ao operador de avisos. A flag `VITE_API_COMMUNITY_STATUS_ENABLED` inicia desligada.

**Consequências:** o cliente não recebe identidade do denunciante, do autor bloqueado nem do ator de status. A API usa o JWT da conta, a checagem de papel e RLS/RPC do banco; uma resposta perdida de status é reconciliada pelo histórico privado. A operação contínua de moderação e a remoção de fotos ocultadas continuam tarefas humanas a definir antes da ativação pública. Nenhuma migration ou privilégio novo é introduzido neste módulo.

## DEC-025 - Exclusão administrativa retomável fora da API pública

**Status:** implementada localmente no módulo 7; migration, Auth e Storage reais ainda não validados em staging.

**Decisão:** a execução da exclusão é uma ferramenta Python operada por responsável de privacidade, sem rota FastAPI nem chave administrativa no cliente ou na hospedagem web. Antes de começar, o responsável verifica identidade e intenção por canal autenticado e registra um UUID aleatório em controle restrito. A ferramenta exige protocolo e UUID Auth esperado; a RPC confere ambos com o pedido e armazena apenas o hash da referência. Um job privado e triggers bloqueiam novas mutações da conta; a mesma trava transacional coordena o início com escritas concorrentes. Fotos são removidas pela Storage API e ambiguidades de ownership param o fluxo. A purga de votos, avisos e tokens push é transacional. A conclusão só ocorre depois de conferir ausência em Auth, Storage, banco e fila, e apaga o UUID Auth do comprovante.

**Consequências:** `service_role` fica restrita ao ambiente do operador e quatro RPCs administrativas recebem EXECUTE somente desse papel. Falhas deixam estágio persistente para retomada; uma segunda execução não repete a remoção confirmada. A exclusão Auth não revoga imediatamente JWTs já emitidos, por isso o bloqueio de escrita também rejeita identidade Auth inexistente. O job não pode ser descartado como rollback depois do início. A operação depende da migration local `20260924000200_account_deletion_execution.sql`, da reconciliação do schema e de ensaio com duas contas e fotos reais. Responsável, canal de recuperação de acesso, prazo e retenção do comprovante ainda exigem decisão humana antes de pedidos reais.

## DEC-026 - Encerrar a transição somente por evidência de adoção

**Status:** preparação local do módulo 9; nenhum corte aprovado ou implantado.

**Decisão:** manter os caminhos diretos e as cinco flags desligadas até validar cada fluxo FastAPI em staging e observar versões web/Android suportadas. Pedidos à API incluem apenas plataforma e versão do build web; o servidor registra o rótulo somente se estiver em uma lista configurada, junto ao template da rota, status e duração. Comparar contagens agregadas da API com a Data API/RPC do Supabase antes de remover código legado. Auth e fotos continuam com Supabase sob JWT e RLS. A restrição da Data API é decisão posterior e separada.

**Consequências:** a instrumentação não identifica pessoas ou instalações e não prova sozinha ausência de clientes antigos; exige correlação com versões Android distribuídas e métricas agregadas do Supabase. Rollback de flag compilada exige novo build web e APK, então RPCs, RLS, grants e Storage devem permanecer compatíveis durante a observação. O processo e os portões estão em `docs/BACKEND_PRODUCAO.md`.

## DEC-027 — Reservar fotos antes da remoção física

**Status:** implementada e ensaiada em Supabase staging; produção pendente.

A API e o executor administrativo reivindicam somente fotos gerenciadas sem referência a um aviso do proprietário da foto ou a um aviso histórico sem autor, inclusive oculto. A migration local `20261002000100` exige que novas associações de fotos gerenciadas pertençam ao autor; referências legadas de outras contas deixam de bloquear a limpeza. Essa correção ainda não foi aplicada nem ensaiada em PostgreSQL. Uma trava por caminho coordena a reivindicação com anexação/reupload, e um registro privado impede reutilizar o caminho após a remoção. O worker varre órfãos com mais de 24 horas, apaga bytes somente pela Storage API e confirma ausência antes de concluir; a próxima execução reconcilia interrupções após remoção física. Registros são removidos com a conta Auth. Não há nova chave administrativa na API pública nem cron de produção. URLs com sufixos são normalizadas e caminhos percent-encoded recusados para evitar variantes que contornem a trava. Clientes normais já geram nomes UUID sem encoding.

A hospedagem de staging foi separada em projeto Vercel e Supabase próprios; produção mantém flags desligadas até backup, reconciliação, operação humana e observação. Ver `docs/BACKEND_PRODUCAO.md`.

## DEC-028 — Cabeçalhos de segurança do projeto web

**Status:** implementada e ensaiada localmente em 2026-09-30; deploy e validação de produção pendentes.

**Decisão:** configurar os cabeçalhos em `vercel.json` para todas as rotas do projeto web, com CSP em modo de bloqueio e `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy que preserva a origem para OpenStreetMap e Permissions-Policy que mantém geolocalização/câmera na própria origem. A lista de origens da CSP cobre os provedores usados pelo build atual e a API separada de staging; qualquer nova origem web, incluindo analytics, exige revisão da política antes da ativação. O shell local do Capacitor não recebe esses cabeçalhos da Vercel.

**Consequências:** o navegador bloqueia incorporação externa e recursos não autorizados; a CSP ainda permite estilos inline usados pelo aplicativo e pelas páginas estáticas. O teste local serve o build com os cabeçalhos do manifesto e verifica renderização e bloqueio de iframe. Publicação e smoke test remoto continuam necessários; uma mudança de domínio Supabase/API, mapas ou fontes deve ser conferida contra a CSP.

## DEC-029 — Configuração do frontend na raiz

**Status:** implementada e publicada em 2026-09-30; build web, navegador desktop/mobile, sincronização Android e smoke test remoto aprovados.

**Decisão:** manter o frontend React/Vite na raiz do repositório, preservando a raiz do projeto Vercel, o `webDir: dist` do Capacitor e os scripts `pnpm`. `vite.config.ts` contém apenas a configuração necessária ao build e ao servidor local. Metadados de página ficam em `index.html` e a política de indexação em `public/robots.txt`.

**Consequências:** a estrutura não exige mover `src/`, `public/` e `api/` nem alterar os projetos web e Android. O build deve preservar os caminhos relativos dos assets, os metadados e o bloqueio de indexação.

## DEC-030 - Fotos de avisos em bucket privado (preparado localmente em 2026-10-03)

**Atualização 03/10:** aplicada somente no staging. O Storage executa `object.get_authenticated_info` antes de servir bytes; a migration corretiva `20261003000400` usa a visibilidade do aviso para essa leitura e remove a exceção de metadados que deixava o autor baixar foto ocultada. Visitante abriu foto visível e visitante/autor receberam negação após moderação no ensaio HTTP. Produção e cache/CDN real seguem pendentes.

**Contexto:** a ocultação de um aviso remove a linha das consultas públicas, mas não revoga a URL de um objeto em bucket público.

**Decisão:** tornar `report-photos` privado. Um download de visitante pela Storage API requer objeto gerenciado, proprietário válido e vínculo com aviso visível; o caminho gerenciado e pertencente ao autor de uma foto ocultada recebe uma reserva durável na mesma transação da moderação. A reserva nega leituras públicas mesmo se outro aviso usar a mesma foto, e impede reupload no mesmo caminho. O autor conserva acesso aos metadados Storage das próprias fotos para limpeza, mas o download de bytes ocultados é negado. O cliente usa `download` e URL `blob:`; `photo_url` mantém o formato legado como identificador.

**Limites e rollout:** fotos de avisos visíveis continuam acessíveis a visitantes pela API. Fotos externas não são controladas pelo bucket. Caminhos antigos fora do formato gerenciado deixam de ter download; URLs assinadas emitidas antes da ocultação podem persistir até expirar. Cache/CDN de URL pública antiga e clientes Android instalados exigem ensaio real; aplicação SQL e distribuição do cliente devem ser coordenadas. A correção está apenas no repositório local.

## DEC-031 - Retorno OAuth Android com PKCE (preparado localmente em 2026-10-03)

**Contexto:** o esquema privado do Android pode ser registrado por outro aplicativo; o fluxo implícito anterior colocava tokens Supabase no fragmento do retorno.

**Decisão:** usar PKCE para Google OAuth na web e no Android. No Android, abrir a URL de autorização no Browser nativo, manter o verificador PKCE no armazenamento isolado do app e trocar apenas o `code` recebido por URL exata, com tentativa local pendente e prazo de cinco minutos. Rejeitar fragmentos com tokens e retornos alheios; recuperar também o link de abertura a frio. O redirect `com.zeladf.app://auth-callback` permanece por compatibilidade com o manifesto e allowlist existentes.

**Limites:** um app concorrente ainda pode capturar o código e impedir o login, mas não obtém o verificador necessário para resgatar a sessão. Associação exclusiva exige App Link HTTPS verificado, domínio e SHA-256 do certificado Play, indisponíveis nesta cópia. Provedor Google, allowlist remota e retorno em aparelho não foram verificados; distribuir somente após ensaio real. Não houve mudança remota.

## DEC-032 - Fotos de avisos reais somente do Storage do projeto (preparado localmente em 2026-10-03)

**Contexto:** o autor podia gravar uma URL externa diretamente em `reports.photo_url`; o detalhe requisitava essa imagem no dispositivo de visitantes, permitindo rastrear a visualização.

**Decisão:** nova guarda de INSERT/UPDATE exige URL canônica do bucket `report-photos` no mesmo projeto que emitiu o JWT autenticado. A guarda de propriedade existente continua verificando caminho, objeto e autor. Valor vazio continua válido; uma edição de texto não revalida URL legada inalterada. O detalhe só baixa fotos gerenciadas pela Storage API; fotos externas ficam restritas aos IDs fixos de demonstração e prévias locais. `img-src` deixa de permitir `*.supabase.co` e também é declarada no HTML empacotado para Android.

**Limites:** a alteração local não elimina valores externos já salvos no banco. O cliente novo não os carrega, mas versões antigas podem fazê-lo. A promoção requer inventário, tratamento dos legados, migração e distribuição coordenadas. Não houve alteração remota; pgTAP, PostgREST real e aparelho ainda precisam de validação.

## DEC-033 - Recodificação de fotos no cliente como mitigação parcial (2026-10-03)

**Contexto:** o arquivo original, possivelmente com EXIF de GPS, era enviado sem alteração ao Storage pelo cliente direto e pelo fluxo da API. Uma conta autenticada também pode enviar bytes sem passar pelo aplicativo.

**Decisão local:** os dois caminhos do cliente oficial usam a mesma rotina antes do upload: conferir assinatura JPEG/PNG/WebP, decodificar pixels e recodificar em JPEG até 2048 px por lado, com fundo branco para transparência. Falha de decodificação ou codificação interrompe o envio; a foto original nunca é usada como fallback. O mesmo arquivo selecionado reutiliza o resultado em tentativas repetidas para preservar o contrato de idempotência.

**Limite e próxima fronteira:** a policy atual de `report-photos` ainda permite upload direto por conta autenticada e o PostgreSQL não inspeciona os bytes do objeto. Para garantir a propriedade, implementar quarentena privada e processador de imagens no servidor, publicar somente o resultado atestado, negar escrita direta no bucket de publicação e tratar objetos legados antes de declarar ZDF-06 encerrado. Essa mudança exige ensaio em Supabase e distribuição coordenada web/Android; nenhuma migration ou deploy foi executado.


## DEC-034 - Quotas por conta na fronteira do banco e do Storage (preparado localmente em 2026-10-03)

**Atualização 03/10:** aplicada somente no staging. O Storage grava objetos em contexto de serviço, portanto a migration corretiva `20261003000500` cobra a quota pelo `owner_id` e caminho verificados, inclusive para uploads administrativos atribuídos à conta. O 31º upload foi negado por HTTP e os contratos SQL passaram; o Storage mapeia `PT429` para HTTP 500 `DatabaseError`, exigindo ajuste de resposta antes de produção.

**Contexto:** novas chaves de idempotência e o INSERT direto em `reports` permitem publicações repetidas; o upload direto permite fotos órfãs. A validação da interface ou da API não cobre esses caminhos.

**Decisão:** triggers de INSERT no banco impõem 20 avisos e 30 uploads por conta em qualquer janela de 24 horas, além de 40 objetos ativos em `report-photos`. O limite do bucket de 5 MiB por novo arquivo limita a 200 MiB o acervo composto por uploads conformes; objetos legados maiores exigem inventário e tratamento antes de afirmar esse teto para todo o acervo. Eventos privados duráveis preservam o consumo da janela após exclusão; locks transacionais por conta serializam novas escritas. O mesmo limite vale para RPC FastAPI, PostgREST e Storage diretos. Manutenção confiável preserva acesso; contas cliente recebem erro 429.

**Limites e rollout:** quotas têm valores iniciais de produto a medir em staging. Um atacante com muitas contas continua exigindo limites globais e controles antifraude externos. O backfill inclui apenas linhas e objetos existentes; atividade já excluída antes da migration não pode ser recuperada. Eventos com mais de 24 horas são apagados na próxima escrita da conta, e todos somem na exclusão Auth. Validar concorrência, Storage HTTP e retenção em ambiente isolado antes de aplicar; nenhuma migration remota foi executada.
