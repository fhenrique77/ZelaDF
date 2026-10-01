# Implantação web — 2026-09-25

## Estrutura do frontend — 30/09/2026

Deploy de produção `dpl_CoSqEXHv8wJoAevgXRgCDJwmAfhk` no alias https://zela-df.vercel.app. O frontend React/Vite permanece na raiz; metadados estão em `index.html` e a regra de indexação em `public/robots.txt`. A cópia limpa conferida por SHA-256 passou no dry-run e no build remoto. Home e `robots.txt` foram conferidos no alias; Chromium desktop/mobile carregou app, mapa e leitura pública do Supabase sem violações de CSP, com iframe externo bloqueado nas quatro páginas HTML. Capacitor sincronizado localmente; nenhuma migration Supabase foi necessária. Rollback web: `dpl_74kV3oEAURJZZzVLELWBtg2PY7FF`.

## Segurança web — 30/09/2026

Deploy de produção `dpl_74kV3oEAURJZZzVLELWBtg2PY7FF` no alias https://zela-df.vercel.app. A cópia limpa conferida por hash incluiu `vercel.json`; preview e build remoto concluíram. O alias público enviou CSP contra iframe, X-Frame-Options, nosniff, Referrer-Policy e Permissions-Policy nas páginas HTML e na função push. Chromium desktop/mobile carregou app, mapa e leitura pública do Supabase sem violação de CSP; iframe externo foi bloqueado nas quatro páginas. Push permaneceu 503 e flags FastAPI desligadas. Nenhuma migration Supabase foi executada. Rollback web: `dpl_AqrpQp2nC8UfFbq6cZqcNAcyYmvu`. Login autenticado, fotos e Android em aparelho continuam pendentes de smoke test controlado.

## Atualização 26/09/2026

Web de produção: `dpl_AqrpQp2nC8UfFbq6cZqcNAcyYmvu`, https://zela-df.vercel.app. FastAPI/push desligados no build. Rollback: `dpl_3afUR2huPchuiowq29beH1kNZs6x`. API de staging: `dpl_2HLzzQcx9B181ENgzPqt9y1zzL4X`, https://zeladf-api-staging.vercel.app, ensaio real aprovado. Migrations novas somente no staging; nenhum db push em produção. Portões restantes para a API em [BACKEND_PRODUCAO.md](../docs/BACKEND_PRODUCAO.md).


Deploy autorizado pelo proprietário, revisado e promovido para `https://zela-df.vercel.app`: `dpl_3afUR2huPchuiowq29beH1kNZs6x`, URL imutável `https://zela-55ltru6if-fhenrique77s-projects.vercel.app`. Build remoto concluído e domínio conferido pela CLI. Publicados o frontend atualizado e `api/send-push.ts`; API Python, migrations, Android e Play Console não fazem parte desta implantação.

As cinco flags `VITE_API_*_ENABLED`, `VITE_PUSH_ENABLED` e `PUSH_ENABLED` foram explicitamente definidas como `false` para o deployment. A função devolveu 503, sem inicializar envio. Sem mudança de schema, RLS, grants ou webhook. A ativação FastAPI continua dependendo de staging, comparação semântica do banco e ensaios Auth/Storage descritos no plano.

Validação: 169 Vitest, 16 Python, 33 Playwright desktop/mobile (3 skips previstos), typechecks frontend/API/E2E e build local/remoto aprovados. Após promoção, home, política, termos e exclusão responderam 200; desktop/mobile carregaram mapa e leitura pública real, sem erro JavaScript, sem overflow horizontal e com login exigido para publicar. Isso não substitui teste autenticado com duas contas, SQL/pgTAP ou Android em aparelho. O bundle principal ainda gera aviso de tamanho acima de 500 kB.

O deploy saiu de cópia limpa em `.tools/web-deploy-20260925`, devido a um cache `.pytest_cache` local sem acesso. Os arquivos foram copiados de uma lista explícita e conferidos por SHA-256; o dry-run confirmou 53 arquivos (~826 kB), sem `.env`, backend, ambiente virtual, testes, auditorias ou ferramenta administrativa. A cópia e seu manifesto ficam ignorados pelo Git. `.vercelignore` agora exclui backend/caches; a API tem ignore próprio para futura implantação separada.

Rollback web: promover novamente o deployment anterior `dpl_7Bxfo4qN6KJ94dDWEXa9bzVXxNut`. Como não houve migration nem ativação de flags, o rollback não exige alteração do banco. A URL candidata tinha proteção Vercel; a função foi conferida com `vercel curl`, e a navegação pública foi validada após a promoção do domínio.

## Candidato anterior — 2026-09-13

Deploy web concluído em https://zela-df.vercel.app; deployment dpl_7Bxfo4qN6KJ94dDWEXa9bzVXxNut. Não enviado à Play Console. O banco atual recebeu quatro reparos de segurança/contrato documentados em supabase/repairs/README.md. Não reaplicá-los.

## Transição FastAPI (preparação local posterior)

O módulo 9 está preparado em `docs/BACKEND_PRODUCAO.md`, sem corte de tráfego. As cinco flags FastAPI continuam desligadas. Antes de qualquer preview ou build com uma flag ligada, concluir o módulo 0, validar migrations e Auth/Storage/RLS em staging, configurar origens CORS e `API_KNOWN_CLIENT_BUILDS`, relacionar o rótulo do build ao APK/versionCode e definir responsável, observação, custos e rollback. A API registra somente método/rota normalizada, status, duração, request ID e build permitido; a adoção exige comparar contagens agregadas com a Data API/RPC do Supabase. A reversão de uma flag exige novo build web e novo APK. Manter RLS, RPCs, grants e Storage para instalações antigas; não usar este rollout histórico como autorização de deploy da API ou restrição remota.

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
