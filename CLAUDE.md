# Manual da Máquina de Ofertas (para o Claude e o agente mecanico-app)

Leia isto antes de mexer no app. Fale com a dona sempre em português simples.

## O que a máquina faz
1. **Caça ofertas da Shopee**: pela Open API, quando houver chaves, ou pela lista manual `contas/<conta>/shopee-produtos.txt`.
2. **Faz as artes e os textos**: arte 1080x1350 na cor #b0294a, legendas com #publi, textos para grupo e Pinterest e pedido de vídeo com IA.
3. **Monta o site "link na bio"**, publicado no GitHub Pages: https://lusiabessa-rgb.github.io/achadinhos/
4. **Publica no Instagram @achadinhoabessa** pela API oficial: carrossel de ofertas, story e post de conteúdo sem venda.
5. **Monta o painel do dia** em `POSTAR-HOJE/<conta>/ABRIR-HOJE.html`. A dona posta à mão no TikTok Shop e na Shopee Vídeos, porque essas plataformas não têm API oficial para anexar a sacolinha.

## Arquivos
| Arquivo | Para que serve |
|---|---|
| `app/maquina.js` | Rodada principal: ofertas, artes, textos, site e painel (`node app/maquina.js lusia [--teste]`) |
| `app/shopee.js` | Open API de afiliados da Shopee (GraphQL, assinatura SHA256, productOfferV2 e generateShortLink) |
| `app/cacador.js` | Filtros e nota dos produtos, nos modos API e manual |
| `app/textos.js` | Todas as legendas e as REGRAS_ORIGINALIDADE |
| `app/artes.js` | Artes das ofertas (sharp) |
| `app/conteudo.js` | Posts sem venda: lê `contas/<conta>/conteudo/<nome>.jpg/png` + `.txt` (linha 1 = título) e cria `publico/<conta>/conteudo/fila.json` |
| `app/publicar.js` | Publica no Instagram e evita repetir post (anota em `contas/<conta>/publicados.json`) |
| `app/instagram.js` | API do Instagram (graph.instagram.com v25.0; o erro 190 quer dizer token vencido) |
| `app/painel.js`, `app/vitrine.js` | Painel do dia e site link na bio |
| `app/teste-automatico.js` | Testes. **Rode sempre depois de mexer** (`node app/teste-automatico.js`) |
| `.github/workflows/maquina.yml` | Robô na nuvem: 12h e 18h (ofertas) e 20h (conteúdo), no horário de Brasília |
| `contas/lusia/config.json` | Palavras de busca, filtros, hashtags, marca, cor e opções do Instagram |
| `contas/lusia/shopee-produtos.txt` | Lista manual: `nome \| preço \| comissão % \| link \| foto \| frase \| de PREÇO ANTIGO \| N vendidos` (as fotos ficam em `contas/lusia/fotos`) |
| `contas/lusia/tiktok-produtos.txt` | Produtos do TikTok Shop (`nome \| preço \| comissão`) |
| `contas/lusia/CHAVES.txt` | Segredos. **Nunca imprimir, nunca subir para o GitHub** (está no .gitignore) |

O app aceita várias contas (`contas/<nome>/`) porque a dona pode vender o app como assinatura no futuro.

## Como trabalhar
- **Testes antes de tudo:** `node app/teste-automatico.js`. Só envie para o GitHub com todos os testes passando.
- **Commit:** `git -c user.name="Lusia" -c user.email="lusiabessa@gmail.com" commit -m "..."` (o PC não tem identidade git global). Depois, `git push`.
- **Rodar na nuvem agora:** `"C:\Program Files\GitHub CLI\gh.exe" workflow run maquina.yml`. Ver o resultado: `gh run list --limit 3`.
- **Segredos do GitHub:** SHOPEE_APP_ID, SHOPEE_SECRET, INSTAGRAM_TOKEN e INSTAGRAM_USER_ID. A dona cola as chaves. O Claude nunca digita nem mostra segredo; quando precisar, lê da área de transferência sem imprimir.
- **Teste local sem chave:** `node app/maquina.js lusia --teste`. Gera saídas `*-teste`, que o .gitignore ignora.
- **Ao mexer em texto, legenda ou arte:** confira as regras abaixo e rode os testes.

## Regras que nunca mudam
- Todo conteúdo é **original**. Pode se inspirar no formato de quem vende muito, mas nunca repostar vídeo ou foto de outra pessoa.
- Imagem ou vídeo feito com IA leva o rótulo "conteúdo gerado por IA". A marca d'água nunca é escondida.
- Nada de rosto da dona e **nunca crianças**.
- **#publi** em toda legenda de oferta.
- **Não raspar** shopee.com.br nem o TikTok (eles bloqueiam robôs e a conta pode ser banida). Só API oficial ou a lista manual.
- **Senhas: nunca.** Só chaves de API ou autorização oficial.
- Higgsfield gasta créditos: peça antes, menos a tarefa semanal, que tem limite de 20 créditos por semana.
- O Instagram @achadinhoabessa é a conta de **teste**: posts de conteúdo vão direto para a fila.

## Situação atual (atualize sempre que algo mudar)
- **Instagram:** ligado (`"ativo": true`). O token vence por volta de **meados de dez/2026**; renove antes com `renovarToken` em instagram.js.
- **Shopee:** a conta de afiliada foi aprovada, mas a **Open API ainda está bloqueada** e o **link de afiliada não está funcionando**. A dona está resolvendo com o suporte do Effata. Os 6 produtos de Natal estão na lista manual com `LINK_AQUI`.
- **TikTok Shop:** não há API de produtos para afiliados no Brasil. A dona manda prints dos "Mais vendidos".
- **Fila de conteúdo:** os posts de salsichinha saem 1 por dia, às 20h.
- **Tarefa semanal** "posts-semanais-achadinhos": toda sexta às 9h, pesquisa tendências e completa a fila até 7 posts.

## Atalhos (skills na pasta `.claude/skills` do Projeto zero)
- **por-links-na-maquina**: a dona manda links ou prints e eles entram na lista da Shopee.
- **post-conteudo**: cria um post sem venda, com imagem e legenda, e coloca na fila.
- **checar-maquina**: confere se o robô rodou, o que publicou, se deu erro e quanto falta para o token vencer.
