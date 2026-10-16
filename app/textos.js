// Textos prontos para cada lugar. Sem IA paga: modelos com variações.
const real = (v) => 'R$ ' + Number(v).toFixed(2).replace('.', ',');
const sorteia = (lista, semente) => lista[Math.abs(Math.floor(semente)) % lista.length];

const GANCHOS = {
  shopee: [
    'Olha o que eu achei na Shopee 👀',
    'Esse aqui está vendendo MUITO e eu entendi o porquê ✨',
    'Achadinho que deixa a casa com cara de Natal 🎄',
    'Antes de comprar, olha esse preço 😱',
    'Eu não sabia que precisava disso até ver 🤩',
  ],
  tiktok: [
    'Achadinho do TikTok Shop que eu amei 👀',
    'Todo mundo está comprando isso pro Natal ✨',
    'A casa muda com uma coisa só 🎄',
    'Olha o preço disso aqui 😱',
    'Eu não sabia que precisava disso até ver 🤩',
  ],
};

const CHAMADAS_VIDEO = {
  shopee: [
    'Toca na sacolinha para ver o preço de hoje 🛍️',
    'Está na sacolinha laranja aqui embaixo 🧡',
    'Corre na sacolinha antes de acabar 🛒',
  ],
  tiktok: [
    'Toca no carrinho laranja para ver o preço de hoje 🛍️',
    'O produto está no carrinho aqui embaixo 🛒',
    'Corre no carrinho antes de acabar 🧡',
  ],
};

function resumo(p) {
  const valor = Number(p.priceMin || p.price);
  const preco = valor > 0 ? real(valor) : '';
  const desc = Number(p.priceDiscountRate) > 0 ? ` (${p.priceDiscountRate}% OFF)` : '';
  const s = Number(p.sales) || 0;
  const vendas = s >= 1000 ? `+${Math.floor(s / 1000)} mil vendidos` : s > 0 ? `${s} vendidos` : '';
  return { preco, desc, vendas };
}

// TikTok Shop e Shopee Vídeos: SEM link (o produto vai na sacolinha/carrinho).
function legendasVideo(p, hashtags, loja = 'shopee') {
  const { preco, desc } = resumo(p);
  const semente = String(p.itemId || p.productName).length;
  const linhaPreco = preco ? `${p.productName} por ${preco}${desc}.` : `${p.productName}.`;
  return [0, 1, 2].map((i) =>
    [sorteia(GANCHOS[loja], semente + i), linhaPreco, sorteia(CHAMADAS_VIDEO[loja], i), hashtags.join(' ')].join('\n')
  );
}

// Telegram / WhatsApp / Pinterest: COM link de afiliada.
function postComLink(p, link) {
  const { preco, desc, vendas } = resumo(p);
  const linhas = [`🎄 ${p.productName}`];
  if (preco) linhas.push(`💰 ${preco}${desc}`);
  const extras = [p.ratingStar ? `⭐ ${p.ratingStar}` : '', vendas ? `🔥 ${vendas}` : ''].filter(Boolean);
  if (extras.length) linhas.push(extras.join('  |  '));
  linhas.push('', `🛒 ${link}`, '', '_Preço pode mudar a qualquer momento._');
  return linhas.join('\n');
}

// Instagram: link não é clicável na legenda, então mandamos para o "link na bio" com o número da oferta.
const GANCHOS_INSTA = [
  'Achadinho que vale cada centavo ✨',
  'Olha o que eu achei pra deixar a casa linda 🎄',
  'Esse está entre os mais vendidos da Shopee 🔥',
  'Para você que ama um achadinho 💖',
  'Preço bom assim não dura muito 😱',
];

function legendaInstagram(p, numero, hashtags) {
  const { preco, desc, vendas } = resumo(p);
  const semente = String(p.itemId || p.productName).length + numero;
  return [
    sorteia(GANCHOS_INSTA, semente),
    '',
    `🛍️ ${p.productName}`,
    preco ? `💰 ${preco}${desc}` : '',
    vendas ? `🔥 ${vendas}` : '',
    '',
    `👉 Link na bio: oferta nº ${numero}`,
    '_Preço pode mudar a qualquer momento._',
    '',
    hashtags.join(' '),
  ]
    .filter((l, i, arr) => l !== '' || (arr[i - 1] !== '' && i > 0))
    .join('\n');
}

function legendaCarrossel(produtos, hashtags) {
  return [
    'Achadinhos do dia 🛍️✨ Arraste para ver todos 👉',
    '',
    ...produtos.map((p, i) => `${i + 1}. ${p.productName} | ${resumo(p).preco}`),
    '',
    '👉 Os links estão na bio, é só procurar o número da oferta.',
    '_Preços podem mudar a qualquer momento._',
    '',
    hashtags.join(' '),
  ].join('\n');
}

module.exports = { legendasVideo, postComLink, resumo, legendaInstagram, legendaCarrossel };
