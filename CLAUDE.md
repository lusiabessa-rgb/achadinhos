# Manual da Máquina de Ofertas (para o Claude e o agente mecanico-app)

Leia isto antes de mexer no app. Fale com a dona sempre em português simples.

## O que a máquina faz
1. **Caça ofertas da Shopee**: pela Open API, quando houver chaves, ou pela lista manual `contas/<conta>/shopee-produtos.txt`.
2. **Faz as artes e os textos**: arte 1080x1350 na cor #b0294a, legendas com #publi, textos para grupo e Pinterest e pedido de vídeo com IA.
3. **Monta o site "link na bio"**, publicado no GitHub Pages: https://lusiabessa-rgb.github.io/achadinhos/
4. **Publica no Instagram @achadinhoabessa** pela API oficial: carrossel de ofertas, story e post de conteúdo sem venda.
5. **Monta o painel do dia** em `POSTAR-HOJE/<conta>/ABRIR-HOJE.html`. A dona posta à mão no TikTok Shop e na Shopee Vídeos, porque essas plataformas não têm API oficial para anexar a sacolinha.
6. **Manda os vídeos de aquecimento para o TikTok @shopabessa** pela API oficial (`app/tiktok.js`, desligado até a dona criar o app no portal).

## Arquivos
| Arquivo | Para que serve |
|---|---|
| `app/maquina.js` | Rodada principal: ofertas, artes, textos, site e painel (`node app/maquina.js lusia [--teste]`) |
| `app/shopee.js` | Open API de afiliados da Shopee (GraphQL, assinatura SHA256, productOfferV2 e generateShortLink) |
| `app/cacador.js` | Filtros e nota dos produtos, nos modos API e manual |
| `app/textos.js` | Todas as legendas e as REGRAS_ORIGINALIDADE |
| `app/artes.js` | Artes das ofertas (sharp) |
| `app/aquecimento-tiktok.js` | Vídeos do TikTok: `node app/aquecimento-tiktok.js lusia --dias 4 [--sacolinha-por-dia 1] [--inicio AAAA-MM-DD]`. Saída em `POSTAR-HOJE/tiktok-aquecimento/` (precisa do ffmpeg). Desde 19/10: 12 a 18 s, cena nova a cada ~2 s, **gancho de problema** grande no 1º quadro (segundo 0), texto só na **área segura** do TikTok (`ZONA`: nada nos 480 px de baixo, nos 150 px da direita nem nos 150 px do topo), final que **emenda no começo** (loop), legenda com **frase de busca** e no máximo 5 hashtags. **Clipe .mp4** com o mesmo começo de nome da foto (ex.: `fotos/presepio-mdf.mp4`, `presepio-mdf-2.mp4`) entra no lugar da foto parada, com trechos diferentes em cada vídeo (clipe = IA, a não ser que tenha `-real` no nome). Nomes: `<hora>-video-aquecimento.mp4` (fotos, **sem sacolinha**) e `<hora>-video-sacolinha.mp4` (só clipes de 1 produto, **pode ir com sacolinha**, legenda com #publi); o LEIA.txt marca os dois. Música de Natal original de `contas/<conta>/musicas`. Fotos de fora: `contas/<conta>/nao-usar-em-video.txt`. Também usa as fotos da cortina de LED (só as amarelas) |
| `app/placar.js` | Placar do TikTok: `node app/placar.js lusia`. Lê `contas/<conta>/metricas-tiktok.txt` (`data \| gancho \| views \| % completo ou tempo médio \| curtidas \| compartilhamentos \| salvos \| cliques \| vendas`) e mostra os 3 vencedores, os piores e "faça 3 variações do vencedor X". Nota = % completo + 10 x (compart. + salvos) por 100 views. `--api arquivo.json` aceita a lista de vídeos da API oficial (video.list; o escopo ainda não foi pedido) |
| `app/conteudo.js` | Posts sem venda: lê `contas/<conta>/conteudo/<nome>.jpg/png` + `.txt` (linha 1 = título) e cria `publico/<conta>/conteudo/fila.json` |
| `app/publicar.js` | Publica no Instagram e evita repetir post (anota em `contas/<conta>/publicados.json`) |
| `app/instagram.js` | API do Instagram (graph.instagram.com v25.0; o erro 190 quer dizer token vencido) |
| `app/campanhas.js` | Calendário de campanhas (11.11, Black Friday, 12.12, Natal, Dia das Mães...): título e cor da arte, frase, hashtags e buscas mudam sozinhos. Desligar ou criar campanhas: `"campanhas": { "desligadas": [...], "extras": [...] }` no config |
| `app/respostas.js` | "Comentou QUERO, recebe o link no direct": resposta privada oficial (até 7 dias) e resposta pública. Anota em `contas/<conta>/respondidos.json`. Liga com `instagram.respostas.ativo` |
| `app/tiktok.js` | TikTok Content Posting API oficial: OAuth, cofre com o token criptografado (`contas/<conta>/tiktok-cofre.json`, chave = TIKTOK_CLIENT_SECRET), renovação sozinha, envio por FILE_UPLOAD em pedaços e checagem de status. Lê a fila `contas/<conta>/tiktok-fila/<data>/<hora>-video.mp4` + `-legenda.txt` e manda só os de hoje cuja hora chegou (`porRodada`). Anota em `tiktok-publicados.json`. Comandos: `--link`, `--codigo` (lê o código da área de transferência), `--checar`, `--simular`. Liga com `tiktok.ativo` |
| `publico/termos.html`, `publico/tiktok-retorno.html` | Termos de uso e página de retorno do login do TikTok (mostra o botão "Copiar código"; o código não sai da tela) |
| `PASSO-A-PASSO-TIKTOK.md` | O que a dona faz no portal developers.tiktok.com |
| `app/painel.js`, `app/vitrine.js` | Painel do dia e site link na bio |
| `app/teste-automatico.js` | Testes. **Rode sempre depois de mexer** (`node app/teste-automatico.js`) |
| `.github/workflows/maquina.yml` | Robô na nuvem: 12h e 18h (ofertas) e 20h (conteúdo), no horário de Brasília |
| `app/conferencia.js` | Conferência das 21h30: publicados de hoje (publicados.json + API do Instagram), dias de fila, dias até o token vencer (`instagram.tokenVenceEm` no config), rodadas que falharam em 24 h (API do GitHub) e "TikTok: conferir no app". Manda o resumo pelo Telegram (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID); sem eles, só imprime. `--simular` não envia; `--ligar-telegram` (no PC, uma vez) descobre o CHAT_ID e grava os 2 secrets |
| `app/produtos-semana.js` | **Produtos da semana** (pedido de 20/10: ela fica confusa com listas soltas): junta `tiktok-em-alta.txt` (FastMoss) + `shopee-produtos.txt` (+ Open API no futuro), marca o que vende NAS DUAS (2+ palavras iguais no nome = mesmo tipo; o vídeo de cada loja mostra o produto idêntico ao do link), vê o que já está na vitrine (`tiktok-produtos.txt`) e manda UMA mensagem no Telegram com no máximo 4 produtos e o que ela faz. `--simular` só mostra. Saída em `contas/<conta>/produtos-da-semana.txt` (ignorado pelo git) |
| `.github/workflows/produtos-semana.yml` | Robô da lista: toda segunda 10h de Brasília. Usa o `tiktok-em-alta.txt` que está no GitHub (a skill cacar-produtos-tiktok envia) |
| `.github/workflows/conferencia.yml` | Robô da conferência: todo dia 21h30 de Brasília (00:30 UTC). Substitui a tarefa do PC "olho-nas-postagens" |
| `TELEGRAM-PASSO-A-PASSO.md` | O que a dona faz no @BotFather |
| `.github/workflows/respostas.yml` | Robô de respostas: a cada 15 min (só age se `respostas.ativo`) |
| `publico/privacidade.html` | Política de privacidade, exigida pela Meta e pelo TikTok: https://lusiabessa-rgb.github.io/achadinhos/privacidade.html |
| `contas/lusia/config.json` | Palavras de busca, filtros, hashtags, marca, cor e opções do Instagram |
| `contas/lusia/shopee-produtos.txt` | Lista manual: `nome \| preço \| comissão % \| link \| foto \| frase \| de PREÇO ANTIGO \| N vendidos` (as fotos ficam em `contas/lusia/fotos`) |
| `contas/lusia/tiktok-produtos.txt` | Produtos do TikTok Shop (`nome \| preço \| comissão`) |
| `contas/lusia/CHAVES.txt` | Segredos. **Nunca imprimir, nunca subir para o GitHub** (está no .gitignore) |

O app aceita várias contas (`contas/<nome>/`) porque a dona pode vender o app como assinatura no futuro.

## Como trabalhar
- **Testes antes de tudo:** `node app/teste-automatico.js`. Só envie para o GitHub com todos os testes passando.
- **Commit:** `git -c user.name="Lusia" -c user.email="lusiabessa@gmail.com" commit -m "..."` (o PC não tem identidade git global). Depois, `git push`.
- **Rodar na nuvem agora:** `"C:\Program Files\GitHub CLI\gh.exe" workflow run maquina.yml`. Ver o resultado: `gh run list --limit 3`.
- **Segredos do GitHub:** SHOPEE_APP_ID, SHOPEE_SECRET, INSTAGRAM_TOKEN, INSTAGRAM_USER_ID, TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID (os 2 do Telegram ainda não existem). A dona cola as chaves. O Claude nunca digita nem mostra segredo; quando precisar, lê da área de transferência sem imprimir.
- **Teste local sem chave:** `node app/maquina.js lusia --teste`. Gera saídas `*-teste`, que o .gitignore ignora.
- **Ao mexer em texto, legenda ou arte:** confira as regras abaixo e rode os testes.

## Regras que nunca mudam
- Todo conteúdo é **original**. Pode se inspirar no formato de quem vende muito, mas nunca repostar vídeo ou foto de outra pessoa.
- Imagem ou vídeo feito com IA leva o rótulo "conteúdo gerado por IA". A marca d'água nunca é escondida.
- Nada de rosto da dona e **nunca crianças**.
- **#publi** em toda legenda de oferta.
- **Padrão de qualidade (olhar de consumidora, pedido da dona em 17/10):** imagem sempre **nítida e centralizada**, **nada desfocado** (desfoque "dá agonia" e a pessoa perde o interesse). Fundo liso claro quando a foto não preenche a tela. Rótulo de IA **só** no que é IA (foto real de produto não leva). Foto repetida não aparece duas vezes no mesmo vídeo. Antes de entregar, olhe um quadro de cada vídeo como se fosse uma cliente: está bonito, dá vontade de assistir? Se não, refaça. O teste "padrão de qualidade" trava isso.
- **Cada plataforma fala do seu jeito:** as mesmas fotos vão para o Instagram e o TikTok, mas os textos são diferentes. No TikTok, nada de "Shopee", "link na bio" ou @achadinhoabessa: lá é "carrinho"/"link" e #tiktokshop. **Desde 19/10 a palavra "sacolinha" não aparece em nenhum texto público** (fala, tela, legenda); use "Link no carrinho 🛒", "Clica no link 🛒", "Toca no carrinho 🛒" (o teste trava isso). No Instagram, nada de "sacolinha" nem #tiktokshop. A tabela completa está na skill aquecer-contas.
- **Não raspar** shopee.com.br nem o TikTok (eles bloqueiam robôs e a conta pode ser banida). Só API oficial ou a lista manual.
- **Senhas: nunca.** Só chaves de API ou autorização oficial.
- Higgsfield gasta créditos: peça antes, menos a tarefa semanal, que tem limite de 20 créditos por semana.
- O Instagram @achadinhoabessa é a conta de **teste**: posts de conteúdo vão direto para a fila.

## Situação atual (atualize sempre que algo mudar)
- **Instagram:** ligado (`"ativo": true`). O token vence por volta de **meados de dez/2026**; renove antes com `renovarToken` em instagram.js.
- **Resposta QUERO:** pronta e testada, mas **desligada** (`"ativo": false`). Falta: (1) no app da Meta "Maquina Achadinhos", adicionar as permissões instagram_business_manage_comments e instagram_business_manage_messages; (2) gerar um token novo e trocar o secret INSTAGRAM_TOKEN e o CHAVES.txt; (3) no Instagram: Configurações > Mensagens > Ferramentas conectadas > permitir acesso às mensagens; (4) testar com uma conta testadora; (5) para funcionar com qualquer pessoa: revisão do app pela Meta (Acesso Avançado), usando a página de privacidade. Ao ligar, as legendas e artes passam a dizer "Comente QUERO".
- **Campanhas:** ligadas. Próximas: Natal (01/11), 11.11 (05/11), Black Friday (23/11–30/11), 12.12 (06/12).
- **Shopee:** a conta de afiliada foi aprovada, mas a **Open API ainda está bloqueada** e o **link de afiliada não está funcionando**. A dona está resolvendo com o suporte do Effata. Os 6 produtos de Natal estão na lista manual com `LINK_AQUI`.
- **TikTok Shop:** não há API de produtos para afiliados no Brasil. A dona manda prints dos "Mais vendidos".
- **Robô do TikTok @shopabessa (`app/tiktok.js`):** pronto e testado, **desligado** (`"tiktok": { "ativo": false, "modo": "rascunho" }`). Regras oficiais (17/10/2026):
  - Modo **"rascunho"** (escopo `video.upload`): o vídeo vai para a caixa de entrada do TikTok; a dona toca no aviso, põe o som e a legenda e posta. Máximo de 5 rascunhos pendentes em 24h. Não leva legenda. **É o modo a usar.**
  - Modo **"direto"** (escopo `video.publish`): sem auditoria, só `SELF_ONLY` e a conta precisa estar **privada** (erro `unaudited_client_can_only_post_to_private_accounts`); no máximo 5 contas por dia. A auditoria exige uso por muitas pessoas, cumprir a interface (escolha manual de privacidade, consentimento a cada post) e não tem prazo oficial. Um app de uma conta só costuma ser recusado. Limite de cerca de 15 posts por dia por conta. **Não ligar sem a auditoria.**
  - Limites: 6 pedidos por minuto por token (init), 30 por minuto (status); access token dura 24h e o refresh token 1 ano (pode trocar; o cofre guarda o novo).
  - Falta (com a dona, `PASSO-A-PASSO-TIKTOK.md`): criar o app no portal (Login Kit com redirect `https://lusiabessa-rgb.github.io/achadinhos/tiktok-retorno.html` + Content Posting API), sandbox com @shopabessa, colar as chaves no CHAVES.txt (`TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`) e nos Secrets do GitHub, `--link` + `--codigo`, 1 vídeo de teste com o OK dela e só então `ativo: true`.
  - **Fila na nuvem:** `POSTAR-HOJE` não vai para o GitHub, então os vídeos ficam em `contas/lusia/tiktok-fila` (gere com `node app/aquecimento-tiktok.js lusia --dias 4 --saida contas/lusia/tiktok-fila`). São cerca de 10 MB por dia no repositório público; apague as pastas de dias passados.
  - `maquina.yml` já tem o passo "Mandar video para o TikTok" (pula se não houver TIKTOK_CLIENT_KEY) e salva `tiktok-publicados.json` e `tiktok-cofre.json`.
- **Fila de conteúdo:** desde 18/10, 2 posts por dia (18h e 20h), 1 por rodada — `conteudoPorDia: 2`, `conteudoPorRodada: 1`, `conteudoAPartirDas: 18` (pedido da dona). O teste "publicador completo" força 1 por dia e, desde 19/10, usa um `publicados.json` **temporário** (opção `arqPublicados` do publicar.js): nunca lê nem mexe no arquivo real, então não quebra mais na rodada das 20h.
- **Vídeos do TikTok:** todos são de aquecimento até existir clipe .mp4 de produto. Com 1 clipe de IA por produto, a máquina faz várias variações "com sacolinha".
- **Placar do TikTok:** pronto; a dona cola os números em `contas/lusia/metricas-tiktok.txt` e roda `node app/placar.js`.
- **Conferência das 21h30 (desde 19/10):** na nuvem (`conferencia.yml`). Falta a dona criar o bot (`TELEGRAM-PASSO-A-PASSO.md`); até lá o resumo fica só no registro da rodada. Depois do Telegram funcionando, desligar a tarefa do PC "olho-nas-postagens". A data do token fica em `instagram.tokenVenceEm` (atualize ao renovar).
- **Tarefa semanal** "posts-semanais-achadinhos": toda sexta às 9h, pesquisa tendências e completa a fila até 7 posts.

## Atalhos (skills na pasta `.claude/skills` do Projeto zero)
- **por-links-na-maquina**: a dona manda links ou prints e eles entram na lista da Shopee.
- **post-conteudo**: cria um post sem venda, com imagem e legenda, e coloca na fila.
- **checar-maquina**: confere se o robô rodou, o que publicou, se deu erro e quanto falta para o token vencer.
