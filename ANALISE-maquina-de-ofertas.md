# Máquina de Ofertas: análise (madrugada de 15/10/2026)

O seu pedido: um aplicativo que **procura os produtos mais virais e com mais comissão, gera o link e divulga sozinho**. Você configura uma vez e fica livre para pensar.

Resposta curta e sincera: **dá para fazer uma boa parte. Não dá para fazer tudo.** Abaixo explico o que entra e o que fica de fora.

---

## 1. O que a máquina CONSEGUE fazer sozinha

### Peça 1: Caçador de produtos (Shopee)
- A Shopee tem uma **API oficial de afiliados**, que é uma "porta de entrada" para programas.
- Por essa porta a máquina consegue:
  - buscar produtos e ver **preço, vendas, desconto e % de comissão**;
  - escolher os melhores: muita venda + comissão alta + desconto bom;
  - **gerar o seu link de afiliada sozinha** (link curto, que pode render comissão extra).
- Ela roda todo dia, sem você.

### Peça 2: Divulgador automático
Onde a máquina pode postar **sozinha e dentro das regras**:

| Lugar | Automático? | Observação |
|---|---|---|
| **Canal no Telegram** | ✅ 100% | Grátis. A máquina posta foto + preço + link várias vezes por dia. |
| **Pinterest** | ✅ quase 100% | Aceita pins com link de produto. Precisa de conta comercial. |
| **Canal/grupo de WhatsApp** | ⚠️ não | O WhatsApp não deixa programa postar de graça. A máquina deixa o texto pronto e você só encaminha. |

### Peça 3: Fábrica de conteúdo
- A máquina monta a pasta **"POSTAR HOJE"** com os vídeos do TikTok e da Shopee Vídeos, cada um com a legenda pronta e o nome do produto que vai na sacolinha.
- Ela também escreve os textos dos posts do Telegram e do Pinterest.

---

## 2. O que a máquina NÃO consegue (e por quê)

1. **Postar no TikTok Shop com a sacolinha.** O TikTok só deixa anexar produto **pelo celular, à mão**. Não existe porta oficial para programa fazer isso.
2. **Postar na Shopee Vídeos.** Também não tem porta oficial.
3. **"Convencer as pessoas" do zero.** Um canal novo começa com 0 pessoas. A máquina posta, mas alguém precisa chegar até o canal. O caminho é usar os seus **2 mil seguidores do TikTok** e colocar o link do canal na bio.

> ⚠️ Programa "pirata" que entra na sua conta e posta fingindo ser você **existe**, mas é contra as regras do TikTok e da Shopee. O risco é **perder a conta e as comissões**. Não vou construir isso.

**Então, no TikTok e na Shopee Vídeos, o seu trabalho fica assim:** abrir a pasta, subir o vídeo, anexar o produto e postar. São **10 a 15 minutos por dia**. Todo o resto (pesquisar, escolher, criar e escrever) fica com a máquina.

---

## 3. O que VOCÊ faz uma única vez

1. **Ser aprovada como afiliada da Shopee** (affiliate.shopee.com.br). Sem isso, a máquina não liga.
2. No painel de afiliada, **pedir acesso à API** (Open API). A Shopee te dá um **código e uma senha do programa**. Você cola os dois num arquivo que eu preparo, e eu nunca vejo nem digito essa senha.
3. **Criar um canal no Telegram** (5 minutos, eu te guio passo a passo).
4. (Opcional) Criar uma conta comercial no Pinterest.

Depois disso, acabou a configuração.

---

## 4. Custos e cuidados (sendo honesta)

- **A API da Shopee:** grátis.
- **Telegram:** grátis.
- **Onde a máquina "mora":** no começo, no seu computador (ele precisa ficar ligado no horário de rodar). Depois dá para colocar num servidor grátis ou baratinho, para rodar mesmo com o PC desligado.
- **Créditos do Higgsfield:** só para os vídeos. Vou colocar um limite por semana.
- **Venda não é garantida.** A máquina garante constância, não garante cliques. Comissão de afiliada costuma ser pequena por venda, então o ganho vem do volume.
- **Muda um combinado nosso:** a gente tinha decidido "não criar link de venda". A máquina **gera link sozinha** para o Telegram e o Pinterest. Preciso que você confirme que agora pode.
- Antes de ligar, vou checar no curso Método Effata e nas regras da Shopee se pode divulgar link em canal de Telegram (normalmente pode, mas eu confiro).

---

## 5. Ordem de construção

| Etapa | Quem | Quando |
|---|---|---|
| Montar o esqueleto da máquina e a pasta "POSTAR HOJE" | Claude | já dá para começar |
| Você ser aprovada na Shopee Afiliados + pegar a chave da API | Você (uma vez) | quando der |
| Ligar o Caçador de produtos com a chave | Claude | logo depois |
| Criar o canal no Telegram e ligar o Divulgador | Claude + você (5 min) | logo depois |
| Rodar 1 semana em teste, ver o que vende e ajustar | Claude | semana 1 |

---

## 6. A única coisa que eu preciso de você

1. **"Pode construir"**: confirmar que eu começo pelo esqueleto.
2. **"Pode gerar link"**: confirmar a mudança do combinado (só para Telegram/Pinterest).
3. **Pedir afiliação na Shopee** quando tiver 10 minutos. É a peça que liga tudo.

---

## 7. Análise mais a fundo (madrugada, segunda rodada)

Você pediu para eu procurar caminhos em vez de dizer "não dá". Fui procurar e achei mais coisa do que eu tinha visto na primeira rodada:

### TikTok: dá para chegar bem mais perto do automático
- **Postar o vídeo sozinho:** o TikTok tem uma porta oficial para programas postarem vídeo (Content Posting API). Antes de liberar, o TikTok faz uma revisão do app. Enquanto essa revisão não sai, os posts ficam privados.
- **Vitrine de produtos:** existe uma porta para criadores que **adiciona produtos à sua vitrine** pelo programa (Affiliate Creator API). Ainda preciso confirmar se ela funciona no Brasil e para uma conta como a sua.
- **Sacolinha depois do post:** o TikTok Shop tem a ferramenta "Link Products", que **anexa produto em vídeos já postados** (até 30 dias depois). Então dá para a máquina postar e você anexar vários produtos de uma vez só, uma vez por semana, em vez de todo dia.
- **Conclusão:** o seu trabalho no TikTok pode cair de "todo dia" para **um momento por semana**. Isso depende de o TikTok aprovar o app.

### Shopee Vídeos: aqui continua sendo à mão
- Não achei porta oficial para postar. Mas o vídeo **sai pronto** da máquina, e você só sobe e marca o produto.

### Já existem ferramentas brasileiras prontas
- Ferramentas como **Achadinhos Pro, Easyfy, Shozap e ProAfiliados** já fazem parte do que você pediu: garimpam produto da Shopee, escrevem o texto com IA e postam sozinhas em **grupos de WhatsApp e Telegram**, com o link de afiliada.
- Elas são **pagas (mensalidade)** e eu ainda não testei nenhuma. Não sei se são boas nem se seguem as regras.
- **Isso abre duas escolhas para amanhã:**
  - **A) Assinar uma ferramenta pronta:** começa a funcionar mais rápido, mas tem mensalidade.
  - **B) Construir a nossa máquina:** não tem mensalidade e fica do seu jeito, mas leva mais tempo para ficar pronta.
  - **C) Misturar:** usar uma ferramenta pronta agora para o WhatsApp/Telegram e construir só o que falta (vídeos e TikTok).

### Uma correção sincera
Na primeira rodada eu disse "o WhatsApp não deixa programa postar". Não é bem assim: essas ferramentas postam em grupo de WhatsApp. Elas usam caminhos que **não são oficiais**, e isso tem risco de o número ser bloqueado. Antes de escolher, vou checar qual é o risco de cada uma.

### O que eu vou levar para a nossa conversa
1. Comparar 3 ferramentas prontas: preço, o que fazem e qual o risco.
2. Confirmar se a porta de vitrine do TikTok funciona no Brasil.
3. Confirmar no painel da Shopee como pedir a chave da API.

---
Fontes da pesquisa: [Partner Center do TikTok Shop](https://partner.tiktokshop.com/docv2/page/affiliate-integration), [APIs de afiliados do TikTok Shop (BeMomentiq)](https://bemomentiq.com/blog/tiktok-shop-affiliate-apis-explained), [Link Products (TikTok)](https://seller-us.tiktok.com/university/essay?knowledge_id=5804034343962411), [comparativo de ferramentas para afiliados Shopee 2026](https://achadinhopro.com.br/blog/melhores-ferramentas-afiliados-shopee-2026), [Shopee Vídeos automático (Achadinhos Pro)](https://achadinho.pro/shopee-video-afiliado), [acesso à API Shopee (ajuda SG)](https://help.shopee.sg/10/article/191702-API-Access).
Fontes da primeira rodada: comunidade de desenvolvedores da API de afiliados da Shopee ([Shopee.Affiliate](https://www.nuget.org/packages/Shopee.Affiliate), [saapi](https://pypi.org/project/saapi), [Apify Shopee Brasil](https://apify.com/viralanalyzer/shopee-affiliate-products)), [ajuda da Shopee sobre link curto](https://help.shopee.sg/portal/10/article/125983) e [guia de anexar produto no TikTok](https://influenceflow.io/resources/how-to-add-products-to-tiktok-video-affiliate-the-complete-2026-guide/). Obs.: não achei a documentação oficial completa da Shopee Brasil. Vou confirmar os detalhes no painel quando você tiver acesso.
