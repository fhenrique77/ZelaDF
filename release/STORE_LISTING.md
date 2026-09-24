# ZelaDF — ficha da loja preparada para revisão

**Documentado:** rascunho local; nenhum campo foi enviado à Play Console. Confirmar o comportamento no release e concluir `PLAY_STORE.md` antes do envio.

## Textos

Nome: **ZelaDF**

Descrição curta: **Mapa comunitário de problemas urbanos no Distrito Federal.**

Descrição completa:

O ZelaDF é um mapa comunitário para consultar e compartilhar avisos sobre problemas urbanos no Distrito Federal.

Explore o mapa, consulte os detalhes dos avisos e filtre por categoria ou situação. Com uma conta, você pode registrar um problema, adicionar uma foto opcional, apoiar avisos com seu voto e acompanhar suas próprias contribuições.

Você escolhe o ponto no mapa e pode preencher o endereço manualmente. A localização do aparelho e a sugestão de endereço são opcionais. Antes de publicar, o aplicativo informa que o ponto, o texto e a foto do aviso ficarão públicos. A identidade exibida nos avisos é “Cidadão”.

O ZelaDF não é um aplicativo oficial do governo. Não representa órgãos públicos, não encaminha automaticamente os avisos e não garante atendimento ou resolução. As sugestões de contato são orientações para o cidadão.

## Classificação proposta

- Tipo: aplicativo.
- Categoria sugerida: Ferramentas; confirmar na Console antes de salvar.
- Idioma principal: português do Brasil.
- Anúncios: não há SDK publicitário próprio identificado no código; revisar o bundle e os SDKs finais antes da declaração.
- Público-alvo e classificação indicativa: pendentes de decisão do responsável e questionário IARC; não inferir a idade apenas pelo tema do aplicativo.

## Materiais

- Ícone existente: `public/icon-512.png`; dimensões 512 × 512 conferidas. Revisar identidade visual e critérios da loja antes de enviar.
- Imagem de destaque: [feature-graphic.jpg](assets/feature-graphic.jpg), JPEG 1024 × 500; fonte editável em feature-graphic.svg. Texto alternativo: “ZelaDF. O seu bairro, no mapa. Avisos comunitários no Distrito Federal.”
- Três capturas JPEG 1080 × 1920: [mapa](assets/01-mapa.jpg), [lista](assets/02-avisos.jpg) e [detalhe](assets/03-detalhe.jpg). Interface real em Chromium mobile, com avisos sintéticos e tiles OpenStreetMap com atribuição. Revisadas visualmente; não são evidência de teste Android e precisam de aprovação editorial antes do envio.
- Textos alternativos das capturas: “Mapa de Brasília com marcadores de avisos”; “Lista de avisos com filtros por categoria e situação”; “Detalhe de aviso com localização, situação e orientação de contato”.
- Política proposta: `https://zela-df.vercel.app/privacy.html`; versão atual publicada e HTTP 200 confirmado; identidade, contato e operação ainda precisam ser concluídos.
- Exclusão proposta: `https://zela-df.vercel.app/account-deletion.html`; fila instalada, página atual publicada e HTTP 200 confirmado; atendimento completo ainda precisa ser verificado.
- E-mail de suporte e identidade do responsável: ainda serão providenciados pelo proprietário.

## Acesso da revisão

Visitantes podem consultar o mapa. Criar, editar, excluir, votar e solicitar exclusão da conta exigem autenticação. Confirmar os provedores habilitados, preparar uma conta dedicada de revisão e validar o login antes do envio. Não inserir credenciais neste documento; fornecer as instruções no campo protegido de acesso ao aplicativo na Console. O papel de operador é interno e não deve ser concedido à conta de revisão de cidadão.
