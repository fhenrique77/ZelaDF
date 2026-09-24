# ZelaDF — preparação de Segurança dos dados

**Documentado:** inventário para revisão, não declaração enviada ou aprovada. Confrontar o AAB, as configurações reais de cada provedor e `PRIVACY.md`. As respostas finais dependem do responsável e da validação remota.

| Informação | Uso observado no código | Verificação necessária na Console |
| --- | --- | --- |
| Localização precisa e endereço do aviso | Ponto escolhido no mapa ou GPS opcional; publicação no Supabase e exibição pública | Declarar localização e conteúdo compartilhado; revisar as exceções da loja para compartilhamento iniciado pelo usuário. |
| Foto | Upload opcional para `report-photos`; foto do aviso pública | Declarar fotos e propósito de funcionalidade; ensaiar remoção, substituição e exclusão da conta. |
| Texto enviado | Título, descrição e endereço públicos; motivos de status restritos a operadores | Classificar conteúdo gerado pelo usuário e evitar dados pessoais nos textos. |
| IDs de usuário | Autoria interna, votos, pedidos de exclusão e autorização | Declarar identificadores; confirmar leitura restrita e remoção real no backend. |
| Aceite, denúncias e bloqueios | Versão/data de aceite; conteúdo privado de denúncia e decisão; vínculos internos de bloqueio | Declarar funcionalidade e segurança/moderação; não expor denunciante ao autor. A migration de comunidade ainda depende do rollout coordenado. |
| E-mail, telefone e metadados de login | Tratados no Supabase Auth e, se habilitado, Google; não pertencem aos avisos públicos | Declarar somente provedores e campos efetivamente usados na versão final; revisar associação à conta. |
| Tokens push e identificadores do dispositivo | Código preparado; push desativado por padrão, Firebase ainda requer validação | Verificar SDK/instalação limpa e atualização; não presumir ausência de coleta somente pela flag da interface. |
| IP, dados técnicos e requisições | Vercel, Supabase, tiles OpenStreetMap e Nominatim podem recebê-los | Confirmar registros, retenção, regiões e práticas de cada provedor; distinguir prestador de serviço de compartilhamento conforme a definição da loja. |
| Dados demonstrativos | Imagens Unsplash no modo de demonstração | Conferir se o release admite demonstração e quais requisições externas esse modo faz. |

## Respostas que exigem evidência

- Criptografia em trânsito: conferir endpoints efetivos, redirects e tráfego do release; HTTPS no código não substitui essa validação.
- Exclusão: fila/RPC instaladas no Supabase em 2026-09-13, e proprietário confirmou atendimento manual. Ainda falta ensaiar a remoção completa por Auth/Storage e definir contato/prazo. Não declarar atendimento concluído apenas pelo protocolo.
- Coleta opcional: GPS e foto são opcionais; isso não torna opcionais os dados indispensáveis à criação da conta ou à publicação.
- Retenção e segurança: confirmar backups e logs dos provedores. As novas regras Android excluem armazenamento local do backup/transferência, com ensaio em aparelho ainda pendente.
- Revisar todos os SDKs do AAB e a política pública antes de assinar as declarações.

Referência para o responsável: [formulário Segurança dos dados do Google Play](https://support.google.com/googleplay/android-developer/answer/10787469).
