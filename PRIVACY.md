# ZelaDF - Operação de Privacidade

Este documento descreve o comportamento técnico esperado. Ele não substitui revisão jurídica nem confirma o estado dos serviços remotos.

## Situação atual — 26/09/2026

**Documentado — informado pelo proprietário:** ainda não há responsável/contato definido para privacidade e moderação. Menções anteriores a intenção de atendimento manual não equivalem a operação estabelecida.

**Confirmado por execução em staging:** exclusão de contas sintéticas removeu fotos físicas pela Storage API, avisos/votos e Auth, verificou a conclusão e preservou a outra conta. Produção ainda não recebeu esse executor nem novas migrations. A limpeza de órfãos também foi ensaiada: apenas arquivos gerenciados sem referência com mais de 24 horas; fotos recentes ou vinculadas são preservadas. Reserva privada contém conta, caminho e timestamps, impede reuso e é removida em cascade com a conta. Não há cron de produção nem nova coleta pública. Retenção operacional dos comprovantes e backups permanece por definir.

Região de produção/staging: São Paulo; a consulta de backups não listou restauração disponível e PITR está desligado. Auditoria de logs/contratos e backup completo de Auth/Storage continuam pendentes. Evidências: [validação atual](docs/BACKEND_PRODUCAO.md).

**Confirmado no código local (ZDF-02, ainda não implantado):** o bucket de fotos passa a privado e visitantes obtêm somente fotos de avisos visíveis pela Storage API. Ocultar um aviso reserva o caminho gerenciado da foto do autor e impede o download público; remover bytes físicos e lidar com cache anterior continuam atividades operacionais. O estado remoto atual não foi verificado nesta tarefa.

**Confirmado no código local (ZDF-03):** o retorno do login Google no Android usa código PKCE e não carrega tokens Supabase no deep link. O verificador e a sessão ficam no armazenamento do app; o código recebido é aceito somente para uma tentativa local recente. Não registrar URL de retorno nem código em logs. A entrega real em aparelho e a configuração remota do provedor ainda não foram verificadas.

**Confirmado no código local (ZDF-05):** avisos reais deixam de carregar imagens de URL externa diretamente no dispositivo do visitante; fotos do bucket autorizado são baixadas pelo app. Fotos de demonstração fixas continuam usando Unsplash. URLs externas legadas permanecem no banco até inventário e tratamento coordenado, e clientes instalados antigos podem continuar solicitando-as.

**Confirmado no código local (ZDF-07, ainda não implantado):** os contadores de quota guardam somente UUID Auth, ID do aviso quando aplicável e horário; não guardam imagem, texto nem localização. São tabelas privadas sem acesso do cliente. Eventos vencidos saem na próxima escrita da conta; conta inativa pode manter eventos vencidos até nova escrita ou exclusão Auth, que os remove em cascade.

**Confirmado no código local (ZDF-06, mitigação parcial):** antes de enviar uma foto, o cliente oficial passa a recodificar os pixels como JPEG e descarta metadados de origem como EXIF. A proteção ainda pode ser contornada pelo upload direto ao Storage, e fotos antigas podem conter metadados; não presumir que todo objeto armazenado foi higienizado.

## Regras preservadas

- A identidade pública permitida é somente `Cidadão`.
- Nome, e-mail, telefone e metadados do provedor de login não pertencem ao conteúdo público do aviso.
- `author_id` e `user_id` são identificadores internos para autoria e autorização. Não devem aparecer na interface nem em consultas públicas gerais.
- Localização exata, endereço, texto e foto do aviso são públicos. A interface deve informar isso antes da publicação.
- GPS, geocodificação e push devem ser opcionais e iniciados por uma ação do usuário.
- Não registrar tokens, coordenadas, textos livres, telefone, e-mail ou outros dados pessoais em logs.
- Motivos de mudança de status são visíveis somente a operadores e não devem conter dados pessoais desnecessários.

## Retenção adotada

**Comunidade — implementada e implantada em 2026-09-13:** consentimentos (versão/data), denúncias/decisões e bloqueios são privados. Consentimentos e vínculos de bloqueio são removidos com a conta; desbloqueio remove os próprios vínculos. Denúncias são removidas com o aviso ou a conta denunciante; ocultações com o aviso. Não retornar IDs Auth ao cliente, não registrar detalhes em logs e não identificar denunciante para o autor. Migration instalada e contrato SQL testado; operação contínua por definir. Procedimento em release/COMMUNITY_MODERATION.md.

**Confirmado no código em 2026-09-08:** o Android usa `allowBackup=false`, `backup_rules.xml` e `data_extraction_rules.xml` para excluir dados locais (inclusive sessão WebView) de backup em nuvem e transferência entre aparelhos. Manifesto debug mesclado e recursos compilaram; restauração em aparelho não foi ensaiada. Isso não altera os backups do Supabase/Vercel ou os prazos dos demais provedores.

| Dado | Regra do produto | Estado técnico atual |
| --- | --- | --- |
| Conta e identidades Auth | Manter enquanto a conta estiver ativa; remover após pedido verificado, salvo retenção legal obrigatória | Executor administrativo ensaiado com Auth/Storage reais em staging; produção pendente |
| Solicitações de exclusão | Manter enquanto a conta existir e o pedido estiver em atendimento; excluir com a conta | Fila/RPC instaladas e ensaiadas remotamente; proprietário assumiu atendimento manual, ainda sem ensaio completo de execução |
| Avisos | Manter até exclusão pelo autor ou exclusão da conta; status resolvido não apaga automaticamente | Exclusão individual existe no cliente |
| Histórico de status | Manter enquanto o aviso existir; excluir com o aviso; anonimizar o operador quando sua conta for removida | Contrato instalado remotamente com cascade no aviso e SET NULL no ator; transição/histórico testados com fixtures revertidas |
| Eventos privados de quota de avisos e uploads | Usar para limitar criações por 24 horas; excluir eventos vencidos na próxima escrita e todos na exclusão Auth | Migration local ZDF-07; sem aplicação remota; contas inativas podem reter eventos vencidos até nova escrita/exclusão |
| Fotos | Remover ao substituir ou excluir o aviso/conta | Policies remotas de pasta/proprietário corrigidas; cleanup individual é best effort e remoção real pela Storage API ainda precisa ser ensaiada |
| Votos | Manter até remoção do voto, exclusão do aviso ou da conta | Acesso restrito e FK Auth com cascade instalados; referências históricas auditadas e FK validada; contador canônico testado |
| Identificador local de dispositivo | Manter no navegador até limpeza dos dados locais e no voto enquanto ele existir | Mantido na RPC somente por compatibilidade com a coluna histórica; não define unicidade nem autorização |
| Tokens push | Manter somente enquanto a conta/dispositivo estiver inscrito; remover no logout, troca de conta, pedido de exclusão ou resposta de token inválido | RLS, reassociação, remoção própria e cascade corrigidos remotamente com fixtures sintéticas; recurso permanece desativado |
| Eventos push | Manter somente enquanto existir a entrada de histórico de status do aviso; remover em cascade com esse histórico | Migration local do módulo 8, sem aplicação remota; webhook previsto recebe somente ID do evento, sem motivo ou operador |
| Reivindicações de evento push | Manter somente enquanto existir a entrada de histórico de status do aviso; remover em cascade com esse histórico | Migration local do módulo 8, sem aplicação remota; guarda apenas ID do evento e horário da reivindicação |
| Logs e backups de provedores | Limitar ao necessário para segurança/operação e respeitar o ciclo configurado em cada provedor | Prazos remotos não verificáveis pelo repositório |

**Confirmado no código — observação FastAPI:** as chamadas à API enviam somente plataforma e versão do pacote, sem identificador de instalação. O logger próprio registra método, template da rota, status, duração, ID aleatório da requisição e build presente na lista permitida; não registra parâmetros, corpo, Bearer ou mensagens de exceção. As respostas de produto usam `Cache-Control: no-store`, inclusive leituras com autoria/votos próprios. O logger HTTP genérico não é habilitado pela aplicação. Retenção, acesso e logs de infraestrutura dos provedores ainda precisam de conferência antes da ativação da API.

**Confirmado no código:** o módulo FastAPI 5 recebe somente o UUID do aviso e o estado desejado da confirmação, valida a sessão e chama `set_report_vote` com o JWT da conta. A resposta contém apenas voto próprio e contador; a API não expõe `votes.user_id` nem adiciona dado de retenção. A flag `VITE_API_VOTES_ENABLED` permanece desligada e o fluxo não foi ensaiado em staging.

**Confirmado no código:** o módulo FastAPI 6 recebe aceite, denúncia e bloqueio com JWT da conta e encaminha às RPCs existentes. A denúncia retorna só protocolo; o bloqueio não devolve ID Auth. Histórico de status passa por checagem do papel interno e RLS, e sua resposta contém somente status, motivo e data, sem `changed_by`. Mudança de status usa exclusivamente a RPC transacional. A fila privada de denúncias e as decisões de moderação permanecem no canal administrativo descrito em `release/COMMUNITY_MODERATION.md`, sem acesso concedido ao operador de avisos. A flag permanece desligada e o novo caminho não foi ensaiado com dados remotos.

## Estado operacional em 2026-09-13

**Documentado — confirmado pelo proprietário:** ele acompanhará e atenderá manualmente os pedidos no Supabase. A fila privada/RPC já foi instalada e testada com contas sintéticas revertidas. O executor do módulo 7 existe apenas no repositório; não é um serviço automático implantado. Identidade completa, canal operacional, prazo e ensaio de atendimento com Storage/Auth continuam pendentes.

**Confirmado no código:** a espera de OTP armazena somente o timestamp zeladf:otp-retry-at, sem e-mail/código. Vale por até 60 segundos; o valor vencido é removido na próxima consulta do controle. Armazenamento indisponível usa memória.

## Pedido de titular

**Documentado — informado pelo responsável em 2026-09-08:** ainda não há responsável identificado nem canal de suporte/privacidade operacional. O endereço anteriormente sugerido, `contato@zeladf.com.br`, não deve ser apresentado como canal de atendimento. A política local foi corrigida; domínio, controlador e atendimento continuam bloqueadores do lançamento.

Para cada pedido de acesso, correção ou exclusão:

1. Registrar o pedido sem copiar credenciais, tokens ou conteúdo desnecessário.
2. Confirmar a identidade por sessão autenticada ou desafio enviado ao método de login já cadastrado.
3. Identificar ambientes e dados relacionados sem exportar linhas de outros usuários.
4. Informar o resultado e eventual retenção legal dentro do prazo aplicável.
5. Manter somente evidência mínima do atendimento e do fundamento de eventual retenção.

## Canal de solicitação implementado localmente

**Confirmado no código:** `public/account-deletion.html` abre o fluxo web sem exigir instalação Android. O botão “Conta” do aplicativo abre o mesmo formulário. O usuário precisa autenticar e confirmar a intenção; não informa motivo, documento, e-mail adicional nem ID de outra conta. A interface confirma recebimento somente quando recebe um protocolo válido do banco e permite consultar novamente o pedido.

`request_account_deletion()` deriva autoria de `auth.uid()`, deduplica pelo usuário e preserva protocolo/data original. RLS permite ler somente o próprio protocolo, data e situação; o cliente não recebe `user_id` e não escreve diretamente na fila. Operadores de avisos não recebem acesso adicional a pedidos de privacidade. A intenção de reabrir a tela após OAuth usa apenas um indicador em `sessionStorage`, removido ao fechar a tela; isso não comprova envio.

**Implementado e ensaiado em SQL remoto; atendimento real e Android pendentes:** o contrato de fila da migration `20260905000300` foi incorporado ao reparo remoto de 2026-09-13; os 16 contratos pgTAP completos ainda não foram executados. Sem a migration ou com falha de acesso, o formulário apresenta indisponibilidade, sem inventar protocolo. A exclusão efetiva não é automática e o lançamento depende de responsável, canal de recuperação de acesso, prazo definido e ensaio completo do atendimento.

**Confirmado no código:** o módulo FastAPI 3 oferece consulta própria e envio pela mesma RPC, atrás de `VITE_API_DELETION_REQUESTS_ENABLED=false`. O POST não aceita corpo ou identidade escolhida pelo cliente e só devolve protocolo validado; falhas não acionam automaticamente o caminho legado. A API ainda não foi ensaiada em staging e não executa a remoção da conta.

**Confirmado no código:** o módulo FastAPI 4 mantém o envio de bytes das fotos diretamente ao Storage com JWT, em pasta da conta. A API recebe o caminho, consulta metadados sob a RLS da conta e usa RPC/RLS para associar e alterar avisos. A criação guarda UUID de idempotência, hash do conteúdo, ID do aviso e data numa tabela privada vinculada à conta; esses registros somem por cascade na exclusão Auth. Falhas conhecidas de remoção registram caminho e conta numa fila privada, também vinculada por cascade. Respostas públicas não incluem autoria interna. A nova migration não foi aplicada e o fluxo não foi ensaiado em staging. Como Storage e banco não compartilham transação, um upload sem chamada à API ou uma remoção malsucedida pode manter arquivo público órfão; executor da fila e varredura dos demais órfãos ainda precisam de desenho e validação antes de ativar a flag.

## Atendimento a validar antes da ativação

1. Designar responsável de privacidade e substituto, confirmar canal de contato e definir periodicidade de consulta da fila e prazo de resposta. Esses dados ainda não foram fornecidos.
2. Disponibilizar acesso administrativo restrito à fila. Consultar pedidos pendentes em canal protegido, sem exportar IDs Auth para logs ou documentação. Não reutilizar o papel de operador de avisos como autorização administrativa.
3. Verificar a identidade e a intenção por canal autenticado antes de qualquer remoção. Tratar separadamente quem perdeu o acesso à conta; o formulário autenticado sozinho não atende esse caso.
4. Registrar início do atendimento alterando somente a solicitação correspondente para `in_review` por canal administrativo. Essa situação não exclui nem bloqueia a conta. O app exibe “em análise”, nunca “concluído”.
5. Executar e verificar a sequência de exclusão abaixo em ambiente isolado antes de adotá-la remotamente. Se uma etapa falhar, preservar o pedido e permitir retomada; não indicar conclusão parcial como exclusão completa.
6. Confirmar ao titular pelo canal validado e registrar somente evidência mínima do atendimento, prazo e eventual fundamento de retenção. A fila vinculada à conta é removida pela FK após exclusão Auth; eventual comprovante separado precisa de retenção e acesso definidos pelo controlador.

Este procedimento ainda não é um serviço operacional comprovado: o proprietário assumiu atendimento manual, mas faltam canal/periodicidade e execução real validada. Não há worker ou painel de privacidade.

## Exclusão efetiva de conta — rotina local

A rotina administrativa `backend/account_deletion.py` e a migration local `20260924000200_account_deletion_execution.sql` implementam a sequência abaixo. A chave `service_role` existe apenas no ambiente do operador, nunca no cliente ou nas rotas públicas. A rotina foi ensaiada em Supabase staging com contas sintéticas; produção pendente:

1. O responsável confirma novamente identidade e intenção em canal autenticado e mantém uma referência UUID aleatória em registro restrito; recuperação de acesso exige procedimento separado. A rotina recebe protocolo e UUID Auth esperado, confere ambos com a fila e guarda só o hash da referência.
2. Um job privado e triggers bloqueiam novas escritas da identidade, inclusive com JWT antigo; uma trava transacional fecha a corrida com escritas já iniciadas.
3. O inventário considera objetos do bucket pertencentes à conta e sua pasta, inclusive uploads órfãos; ownership conflitante, outros buckets e URLs legadas suspendem o job para revisão. A remoção é feita somente pela Storage API, em lotes.
4. Uma RPC transacional remove votos, avisos e tokens push depois de confirmar que não restou objeto. As demais referências usam as FKs/cascades auditadas.
5. A ferramenta exclui o usuário pela API administrativa de Auth, consulta novamente Auth e chama a RPC de conclusão, que confere Storage, banco e fila. O comprovante privado guarda protocolo, hash de verificação, resultado e timestamps; o UUID Auth é apagado dele.
6. O operador confirma o resultado ao titular pelo canal verificado. O cliente aberto precisa encerrar a sessão local quando Auth a invalidar; isso ainda deve ser ensaiado em web/Android. Refresh tokens são invalidados pela exclusão Auth, enquanto access tokens emitidos antes podem persistir até expirar.

Falhas parciais deixam o estágio `frozen` ou `database_done` para retomada segura; nunca apresentam `in_review` como conclusão. O início não deve ocorrer sem verificação humana, responsável e ambiente validados. A migration não deve ser removida enquanto existir job em andamento. A retenção do comprovante e dos backups ainda depende de decisão do controlador.

## Antes de ativar em produção

- [ ] Confirmar controlador, encarregado/canal e domínio oficiais.
- [ ] Definir bases legais e prazos com responsável jurídico.
- [ ] Auditar região, logs, backups, retenção e contratos dos provedores.
- [ ] Auditar/aplicar a migration local de autorização para `reports`, `votes` e Storage; sanear referências históricas, validar as FKs Auth e executar os contratos de banco, incluindo `push_tokens`.
- [ ] Aplicar e verificar a migration de identidade pública em ambiente controlado.
- [ ] Implementar e testar exclusão/exportação de conta no servidor.
- [ ] Verificar em aparelho e ambiente remoto que logout e troca de conta removem/reatribuem tokens push; o ciclo local e os testes estáticos estão implementados.
- [ ] Confirmar base legal, acesso e retenção dos motivos e histórico de status antes de provisionar operadores.
- [ ] Revisar a política pública sempre que dados ou provedores mudarem.
