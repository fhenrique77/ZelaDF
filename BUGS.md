# ZelaDF — Bugs e validação

Revisão: 2026-09-13. “Corrigido no banco” não substitui teste final no Android instalado.

| Bug | Correção e evidência | Estado |
| --- | --- | --- |
| BUG-001 — GPS negado sem explicação | Mensagens específicas de permissão, timeout e indisponibilidade; teste de navegador aprovado. | Corrigido no frontend |
| BUG-002 — reenvio OTP ao reabrir | Prazo de 60 s persistido sem e-mail/código; bloqueio de envio simultâneo, tratamento de 429 e reenvio após espera. Vitest e navegador desktop/mobile aprovados. | Corrigido no frontend |
| BUG-003 — fotos e limpeza | Bucket público já existia; policies remotas corrigidas para pasta/proprietário, consulta e exclusão pelo dono e limite de formato/tamanho. | Banco corrigido; validar remoção pela Storage API |
| BUG-004 — Meus avisos indisponível | RPCs de autoria instaladas; consulta própria e isolamento entre duas contas passaram no Supabase. Fallback mobile também testado. | Corrigido no banco; reteste Android pendente |
| BUG-005 — falha da confirmação inicial | set_report_vote instalada; publicação/voto inicial, idempotência, duas contas, contador e exclusão testados em transações revertidas. | Corrigido no banco; reteste Android pendente |
| BUG-006 — falha de votos esconde avisos | Preserva a consulta de avisos, explica a falha e bloqueia voto até recuperar o estado. Regressão React aprovada. | Corrigido no frontend |
| BUG-007 — falha Google sem resposta | Erro do provedor chega ao modal; exceções liberam nova tentativa. Dois testes React aprovados. | Corrigido no frontend |
| BUG-008 — lista mobile muda de posição no filtro | Painel mantém altura estável ao atualizar resultados. A suíte final passou em desktop/mobile. | Corrigido no frontend |
| BUG-009 — pedidos de exclusão indisponíveis | Fila/RPC privadas instaladas e testadas: protocolo idempotente, isolamento e cascade. Proprietário assumiu atendimento manual. | Corrigido no banco; atendimento completo por ensaiar |
| BUG-011 — função push falha ao iniciar na Vercel | Imports ESM com extensão .js e exclusão dos arquivos de teste do deploy. Node real e produção confirmaram resposta 503 controlada, mantendo push desativado. | Corrigido e publicado |
| BUG-010 — limpeza de token bloqueada | Remoção própria, reassociação por dispositivo e cascade Auth corrigidas e testadas com tokens sintéticos. | Corrigido no banco; push permanece desativado |

## Segurança do reparo

O patch antigo supabase/patches/fix_bug_004_005_create_rpcs.sql foi descontinuado: preservava policies inseguras. Agora ele aborta antes de qualquer alteração; teste verifica preservação de dados/policies. Não executá-lo nem reaplicar os reparos já instalados.

O procedimento e as limitações estão em supabase/repairs/README.md. Foram aprovadas 39 verificações locais do reparo de avisos, quatro de bloqueio do patch antigo, 145 testes Vitest e 33 testes de navegador. A atualização de comunidade recebeu 25 verificações SQL locais e ensaio Supabase revertido. Não há confirmação de execução no emulador do usuário; ADB não lista dispositivo.

**Compatibilidade do candidato de lançamento:** o APK novo contém aceite, denúncias e bloqueios, cuja migration já foi aplicada em implantação coordenada. O build anterior foi preservado em .tools/artifacts/zeladf-core-bugfix-debug.apk. Use o candidato novo nos testes; clientes antigos sem aceite precisam atualizar para publicar/editar. Consulte release/ROLLOUT.md antes de distribuir.

## Validação final do Android

1. Instalar/executar o APK atualizado e entrar na conta.
2. Publicar um único aviso; conferir confirmação inicial e presença em Meus avisos.
3. Atualizar, remover/repetir o voto e trocar de conta; a segunda conta não pode editar/excluir o aviso da primeira.
4. Anexar/substituir foto e excluir o aviso; conferir a limpeza pela Storage API.
5. Enviar OTP, fechar/reabrir e verificar a espera; conferir que falhas de rede permitem recuperação.

Pendências de lançamento e funcionalidades novas são mantidas em PLAY_STORE.md e TODO.md.
