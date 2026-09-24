# Candidato de lançamento — 2026-09-13

Deploy web concluído em https://zela-df.vercel.app; deployment dpl_7Bxfo4qN6KJ94dDWEXa9bzVXxNut. Não enviado à Play Console. O banco atual recebeu quatro reparos de segurança/contrato documentados em supabase/repairs/README.md. Não reaplicá-los.

## Artefatos

- android/app/build/outputs/apk/debug/app-debug.apk: candidato com comunidade, para testes; não é AAB de produção.
- .tools/artifacts/zeladf-core-bugfix-debug.apk: build anterior preservado como referência; sem o aceite novo, não deve ser usado para testar publicação/edição após a implantação de comunidade.
- dist/: frontend candidato, sincronizado no Android após build.
- supabase/migrations/20260913000100_community_safety.sql: atualização nova, ensaiada com ROLLBACK, aplicada permanentemente e validada após aplicação. Não reaplicar.
- release/STORE_LISTING.md e release/assets/: textos, imagem de destaque e capturas para revisão.
- release/DATA_SAFETY.md: inventário para preenchimento da Console; confirmar declarações no artefato final.

Migration instalada e domínio promovido. O candidato novo pode seguir para testes em aparelho. Clientes antigos que nunca aceitaram as regras precisam atualizar para publicar/editar. A publicação na Play Store continua bloqueada pelos itens operacionais e de assinatura abaixo.

## Sequência de lançamento (implantação web já concluída)

1. Receber nome do responsável, contato operacional, informações da Play Console/chave de upload e rotina de moderação. Atualizar a política pública; não inventar contatos.
2. Ensaiar o atendimento completo de exclusão e a remoção de arquivos pela Storage API com conta dedicada. Confirmar rotação da credencial Firebase anterior. Manter push desligado.
3. Conferir versão do candidato e backup operacional antes da janela. A cópia lógica existente não inclui arquivos Storage ou Auth completos.
4. Deploy Vercel explicitamente autorizado pelo proprietário em 2026-09-13. Preparar o build remoto mantendo o domínio atual, atualizar somente a migration nova e promover o candidato verificado. Não repetir pedido de autorização. Isso não autoriza nem comprova publicação na Play Console.
5. Na janela combinada, aplicar somente a migration nova ao projeto auditado e publicar o frontend correspondente. Não usar db push nem alterar o histórico reconstruído. Validar RPCs via PostgREST, criação/edição, bloqueios, denúncia, voto e página de exclusão. Se qualquer etapa falhar, interromper distribuição e corrigir; não desabilitar RLS ou aceite para contornar o erro.
6. Sincronizar e compilar com as configurações finais, instalar em aparelho e testar login/OTP/Google, GPS permitido/negado, câmera/galeria, avisos próprios, votos, edição/exclusão, denúncia/bloqueio, rede indisponível e retorno do segundo plano.
7. Gerar AAB assinado com a chave de upload guardada fora do projeto, sem senha/token no chat. Verificar pacote, versionCode, alinhamento de 16 KB no artefato final e relatórios do teste interno.
8. Concluir declarações da Console (Data safety, acesso de revisão, público-alvo/IARC, política/exclusão e ausência de vínculo governamental), materiais e requisitos de teste aplicáveis à conta. Só solicitar produção após os resultados reais.

## Evidências e limites

145 testes Vitest, 33 Playwright desktop/mobile, TypeScript frontend/API/E2E e build web aprovados. A captura opcional usa avisos sintéticos e tiles reais, sem dados de contas. SQL: 25 verificações isoladas de comunidade e ensaio Supabase com fixtures/DDL revertidos. Os 84 contratos pgTAP originais, concorrência entre conexões, atendimento real de exclusão, Storage API completa e fluxos Android em aparelho ainda não estão comprovados. APK debug/compilação JVM não substituem esses testes.

Ocultar um aviso pela moderação não remove sua foto pública: o responsável precisa removê-la via Storage API/Dashboard e verificar a URL/cache, conforme COMMUNITY_MODERATION.md.
