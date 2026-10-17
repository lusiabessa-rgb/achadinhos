# Ideias de recursos novos para a Máquina de Ofertas
Pesquisa de 16/10/2026: apps parecidos do Brasil (Achadinhos Pro, AchadinBot, Shozap, IA Divulgadora, InstaMagic) e ferramentas de fora.

## O que os concorrentes fazem (e o que a nossa já faz)
| Recurso | Concorrentes | A nossa |
|---|---|---|
| Achar produto e gerar link sozinho | Sim (API Shopee) | ✅ pronto, esperando a chave da Open API |
| Postar em grupos de WhatsApp | Sim, mas por meios **não oficiais** (risco de ban) | ❌ de propósito (segurança da conta) |
| Postar no Instagram | Poucos | ✅ API oficial |
| Site link na bio | Raro | ✅ |
| Postar Shopee Vídeos sozinho | Achadinhos Pro diz que faz | ❌ sem API oficial: painel do dia |
| Responder comentário com link no direct | InstaMagic, ManyChat (pagos) | 🔜 ideia 1 |
| Preço | R$ 50 a 150 por mês | De graça (é sua) |

## Ideias, da mais forte para a mais fraca
**Já dá para fazer:**
1. **Comentou "QUERO", recebe o link no direct.** O Instagram não deixa link na legenda, então isso aumenta muito as vendas. É permitido pela API oficial da Meta, mas precisa adicionar uma permissão nova no app "Maquina Achadinhos" (5 min, você junto comigo).
2. **Calendário de campanhas automático:** 11.11, Black Friday (27/11), 12.12 e Natal. A máquina muda sozinha as artes, os textos e as palavras de busca na semana de cada data.
3. **Resumo no celular:** todo dia, um recado curtinho ("postei 3, a fila dura 4 dias, nenhum erro"), por Telegram (bot oficial e grátis) ou e-mail.
4. **Vitrine melhor:** categorias, busca e um selo "baixou o preço". A Pinterest bloqueia link encurtado, então o pin aponta para a nossa vitrine, e isso já resolve.

**Quando a chave da Open API da Shopee sair:**
5. **Radar de comissão extra:** a API mostra as lojas que pagam comissão acima do normal (`shopOfferV2`). A máquina dá prioridade a elas.
6. **Alerta de "baixou o preço!":** guarda o preço de cada produto e, quando cai, faz um post de urgência.
7. **Painel de ganhos e máquina que aprende:** a API tem o relatório de vendas. A máquina vê o que vendeu de verdade e repete mais aquele tipo de produto. Esse é o recurso "revolucionário": ela fica mais esperta a cada semana.

**Com custo (créditos do Higgsfield):**
8. **Vídeo com IA de cada produto campeão:** só com as mãos, numa casa real e com o rótulo de IA, pronto no painel do TikTok Shop e da Shopee Vídeos.

**Para o futuro (vender o app como assinatura):**
9. Cadastro de clientes (cada um com a sua pasta em `contas/`), com o custo da IA embutido no preço.

## O que NÃO vamos copiar
- O "espelhamento" de grupos de outras pessoas e a repostagem de vídeos de outros vendedores (fere a regra do conteúdo original).
- Os bots de WhatsApp não oficiais. O "anti-ban" que eles vendem é promessa do próprio fornecedor, sem garantia.

Fontes: achadinho.pro, achadinhopro.com.br (comparativo 2026), achadinbot.com, iadivulgadora.com.br, blog.instamagic.com.br, inro.social (comentário para direct pela API oficial), crevio.co (Pinterest bloqueia encurtadores), apify.com (campos da Open API Shopee BR).
