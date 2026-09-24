# ZelaDF - Operação de Privacidade

Este documento descreve o comportamento técnico esperado. Ele não substitui revisão jurídica nem confirma o estado dos serviços remotos.

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
| Conta e identidades Auth | Manter enquanto a conta estiver ativa; remover após pedido verificado, salvo retenção legal obrigatória | Não há exclusão de conta automatizada |
| Solicitações de exclusão | Manter enquanto a conta existir e o pedido estiver em atendimento; excluir com a conta | Fila/RPC instaladas e ensaiadas remotamente; proprietário assumiu atendimento manual, ainda sem ensaio completo de execução |
| Avisos | Manter até exclusão pelo autor ou exclusão da conta; status resolvido não apaga automaticamente | Exclusão individual existe no cliente |
| Histórico de status | Manter enquanto o aviso existir; excluir com o aviso; anonimizar o operador quando sua conta for removida | Contrato instalado remotamente com cascade no aviso e SET NULL no ator; transição/histórico testados com fixtures revertidas |
| Fotos | Remover ao substituir ou excluir o aviso/conta | Policies remotas de pasta/proprietário corrigidas; cleanup individual é best effort e remoção real pela Storage API ainda precisa ser ensaiada |
| Votos | Manter até remoção do voto, exclusão do aviso ou da conta | Acesso restrito e FK Auth com cascade instalados; referências históricas auditadas e FK validada; contador canônico testado |
| Identificador local de dispositivo | Manter no navegador até limpeza dos dados locais e no voto enquanto ele existir | Mantido na RPC somente por compatibilidade com a coluna histórica; não define unicidade nem autorização |
| Tokens push | Manter somente enquanto a conta/dispositivo estiver inscrito; remover no logout, troca de conta, pedido de exclusão ou resposta de token inválido | RLS, reassociação, remoção própria e cascade corrigidos remotamente com fixtures sintéticas; recurso permanece desativado |
| Logs e backups de provedores | Limitar ao necessário para segurança/operação e respeitar o ciclo configurado em cada provedor | Prazos remotos não verificáveis pelo repositório |

## Estado operacional em 2026-09-13

**Documentado — confirmado pelo proprietário:** ele acompanhará e atenderá manualmente os pedidos no Supabase. A fila privada/RPC já foi instalada e testada com contas sintéticas revertidas. Não há exclusão automática. Identidade completa, canal operacional, prazo e ensaio de atendimento com Storage/Auth continuam pendentes.

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

## Atendimento a validar antes da ativação

1. Designar responsável de privacidade e substituto, confirmar canal de contato e definir periodicidade de consulta da fila e prazo de resposta. Esses dados ainda não foram fornecidos.
2. Disponibilizar acesso administrativo restrito à fila. Consultar pedidos pendentes em canal protegido, sem exportar IDs Auth para logs ou documentação. Não reutilizar o papel de operador de avisos como autorização administrativa.
3. Verificar a identidade e a intenção por canal autenticado antes de qualquer remoção. Tratar separadamente quem perdeu o acesso à conta; o formulário autenticado sozinho não atende esse caso.
4. Registrar início do atendimento alterando somente a solicitação correspondente para `in_review` por canal administrativo. Essa situação não exclui nem bloqueia a conta. O app exibe “em análise”, nunca “concluído”.
5. Executar e verificar a sequência de exclusão abaixo em ambiente isolado antes de adotá-la remotamente. Se uma etapa falhar, preservar o pedido e permitir retomada; não indicar conclusão parcial como exclusão completa.
6. Confirmar ao titular pelo canal validado e registrar somente evidência mínima do atendimento, prazo e eventual fundamento de retenção. A fila vinculada à conta é removida pela FK após exclusão Auth; eventual comprovante separado precisa de retenção e acesso definidos pelo controlador.

Este procedimento ainda não é um serviço operacional comprovado: o proprietário assumiu atendimento manual, mas faltam canal/periodicidade e execução real validada. Não há worker ou painel de privacidade.

## Exclusão efetiva de conta a implementar

A operação deve existir em backend confiável, nunca no cliente com `service_role`, e ser idempotente:

1. Reautenticar o usuário e obter o ID exclusivamente da sessão validada.
2. Bloquear novas mutações da conta durante a operação.
3. Listar apenas fotos pertencentes aos avisos do usuário e removê-las pela Storage API.
4. Em transação de banco, remover tokens push, votos e avisos do usuário; votos dos avisos devem respeitar cascade.
5. Excluir o usuário com a API administrativa do Supabase.
6. Encerrar a sessão local e invalidar o que a infraestrutura permitir.
7. Registrar apenas IDs de operação, resultado e timestamps sanitizados.

Falhas parciais devem permitir nova execução segura. A rotina precisa considerar que objetos do Storage podem impedir a exclusão do usuário e que um JWT já emitido pode permanecer válido até expirar.

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
