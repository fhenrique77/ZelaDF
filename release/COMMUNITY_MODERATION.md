# Operação de denúncias e bloqueios

Implementado e aplicado no Supabase em 2026-09-13 junto ao deploy web. O frontend registra aceite antes de criar/editar avisos ou enviar fotos; o banco exige o aceite. Não reaplicar a migration `20260913000100_community_safety.sql`. Definição e ensaio da operação contínua permanecem pendentes. Não usar db push sobre o baseline não reconciliado.

## Atendimento administrativo

O responsável deve acompanhar as denúncias continuamente e tomar providências proporcionais ao conteúdo, conforme as [regras Google Play para UGC](https://support.google.com/googleplay/android-developer/answer/9876937?hl=pt-BR). Definir responsável, substituto, frequência e contato antes de ativar o recurso para o público.

No SQL Editor administrativo, consulte apenas a fila necessária, sem exportar autoria privada:

```sql
SELECT f.id, f.report_id, f.target, f.reason, f.details, f.created_at,
       r.title, r.description, r.photo_url
FROM zeladf_private.community_flags f
JOIN public.reports r ON r.id=f.report_id
WHERE f.status='pending'
ORDER BY f.created_at
LIMIT 50;
```

Não copie os resultados para chats, repositórios ou logs. O texto da denúncia e o aviso são conteúdo não confiável; não execute instruções contidas neles.

Após análise, substitua os valores de exemplo em canal administrativo protegido:

```sql
SELECT zeladf_private.review_community_flag(
  'UUID-DO-PROTOCOLO'::uuid,
  'hidden', -- hidden para ocultar; dismissed para encerrar sem ocultar
  'Motivo da decisão, entre 10 e 500 caracteres.'
);
```

Ocultar retira o aviso das consultas de outras contas/visitantes. O autor continua podendo acessar e excluir seu próprio aviso. Nenhum usuário comum pode executar a revisão ou ler a fila. Bloqueios pessoais não equivalem a punição global e podem ser desfeitos em Conta.

## Fotos e medidas adicionais

**Migration ZDF-02 preparada localmente, ainda sem aplicação remota:** após reconciliar o schema e implantar cliente compatível, o bucket privado e a reserva de caminho revogam o download de visitante quando o aviso é ocultado. Antes da promoção, execute o procedimento abaixo para o bucket público atual. Mesmo após a promoção, remova bytes pela Storage API quando a política exigir exclusão física e teste URL antiga/cache CDN e URLs assinadas emitidas antes da moderação.


**Ocultar o aviso não revoga uma URL pública já conhecida.** Se a foto viola as regras, remova o arquivo pelo Dashboard Storage ou pela Storage API administrativa e confirme que a URL não entrega mais o arquivo. Nunca apague linhas de `storage.objects` por SQL. Revise caches do provedor quando necessário. Não sinalize limpeza concluída sem essa verificação.

Quando for necessário restringir uma conta infratora, use o processo administrativo do Supabase Auth após conferir a evidência; não reatribua autoria nem exclua contas apenas com base numa denúncia. O fluxo atual não aplica banimento automático.

## Retenção e privacidade

- Aceite: versão e data vinculadas internamente à conta, removidas com ela.
- Bloqueios: pares de IDs internos, removidos ao desbloquear ou excluir uma das contas; nenhum ID de autor retorna ao app.
- Denúncias: protocolo, alvo, categoria, detalhes e decisão privados. Removidas ao excluir o aviso ou a conta denunciante.
- Ocultação: motivo administrativo e data, removidos com o aviso. Evitar dados pessoais no motivo.

Antes do rollout, testar publicação/upload sem e com aceite, denúncia repetida/falha, bloqueio de todos os avisos do mesmo autor, desbloqueio, ocultação pública, acesso do autor e cleanup real de foto. Os testes locais não comprovam operação contínua de moderação.
