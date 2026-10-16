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
    'Ninguém acredita quando eu conto quanto paguei nisso 😱',
    'O detalhe que deixa a casa com cara de Natal de revista ✨',
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

// #publi: o CONAR pede para marcar post de divulgação (o curso reforça isso). Sempre vai na frente.
const comPubli = (hashtags = []) => ['#publi', ...hashtags.filter((h) => h.toLowerCase() !== '#publi')].join(' ');

// Frase de benefício que a dona escreveu na lista (opcional): "Liga na tomada e acende sozinha"
const info = (p) => String(p.info || '').trim();

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
  const { vendas } = resumo(p);
  const linhaPreco = preco ? `${p.productName} por ${preco}${desc}.` : `${p.productName}.`;
  // Prova social (aula de copy): número REAL de vendidos, nunca inventado
  const prova = vendas ? `🔥 ${vendas}` : '';
  return [0, 1, 2].map((i) =>
    [sorteia(GANCHOS[loja], semente + i), linhaPreco, info(p), prova, sorteia(CHAMADAS_VIDEO[loja], i), comPubli(hashtags)]
      .filter(Boolean)
      .join('\n')
  );
}

// Telegram / WhatsApp / Pinterest: COM link de afiliada.
function postComLink(p, link) {
  const { preco, desc, vendas } = resumo(p);
  const linhas = [`🎄 ${p.productName}`];
  if (info(p)) linhas.push(`✨ ${info(p)}`);
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
    info(p) ? `✨ ${info(p)}` : '',
    preco ? `💰 ${preco}${desc}` : '',
    vendas ? `🔥 ${vendas}` : '',
    '',
    `👉 Link na bio: oferta nº ${numero}`,
    '_Preço pode mudar a qualquer momento._',
    '',
    comPubli(hashtags),
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
    comPubli(hashtags),
  ].join('\n');
}

// Pinterest funciona como um "Google de ideias": título e descrição com as palavras que as pessoas pesquisam,
// texto curto e link de afiliada curto (o Pinterest entrega menos pins com link com "cara de venda").
function pinterest(p, link, palavrasChave = []) {
  const { preco } = resumo(p);
  const chaves = palavrasChave.slice(0, 3);
  const titulo = `${p.productName}${chaves[0] ? ' | ' + chaves[0] : ''}`.slice(0, 100);
  const descricao = [
    info(p) || `Ideia linda e prática: ${p.productName}.`,
    preco ? `A partir de ${preco} (preço pode mudar).` : '',
    chaves.length ? 'Ideias de ' + chaves.join(', ') + '.' : '',
    '#publi',
  ]
    .filter(Boolean)
    .join(' ')
    .slice(0, 500);
  return { titulo, descricao, link };
}

// Regras de conteúdo da dona (16/10/2026), confirmadas no curso (TikTok Shop e Shopee Vídeos punem vídeo copiado):
// tudo ORIGINAL; pode MODELAR (se inspirar no gancho/formato de quem vende), nunca repostar vídeo/foto de outra pessoa.
const REGRAS_ORIGINALIDADE = [
  'Todo conteúdo é NOSSO: pode modelar (copiar a ideia, o gancho, o formato), nunca repostar o vídeo ou a foto de outra pessoa.',
  'TikTok Shop: só vídeo real (produto na mão) ou feito por IA a partir da foto do produto. Vídeo baixado de outra pessoa dá restrição.',
  'Shopee Vídeos: nada de vídeo de rede social de outra pessoa. Remova os metadados antes de postar.',
  'Música: use os sons da própria plataforma ou a sua narração (música com direito autoral derruba o vídeo).',
  'Vídeo feito com IA: marque "conteúdo gerado por IA" ao postar e não esconda a marca da IA.',
  'Nunca mostrar rosto (só mãos) e nunca mostrar crianças.',
  'Cada vídeo do mesmo produto é uma VARIAÇÃO (gancho, cena ou ângulo diferente), nunca o mesmo vídeo repetido.',
];

const nomeCurto = (nome) => String(nome).split(/\s+/).slice(0, 5).join(' ');

// Pedido de vídeo ultra-realista feito por IA a partir da foto do produto (sem rosto, só mãos, cara de vídeo de celular).
// Prompts em inglês porque as ferramentas de vídeo entendem melhor; a fala é em português e curta (cabe em 8 segundos).
function videoIA(p, cena = 'a cozy Brazilian living room decorated for Christmas') {
  const nome = nomeCurto(p.productName);
  const fala = [`Gente, olha que lindo esse ${nome.toLowerCase()}!`, info(p) ? info(p) + '.' : '', 'Tá na sacolinha com preço ótimo.']
    .filter(Boolean)
    .join(' ')
    .replace(/\.\./g, '.');
  const comum =
    'Keep the product EXACTLY like the reference photo (same shape, colors and details). ' +
    "Only a woman's hands appear: no face, no full body, no children, no other people. " +
    'No text, no logos, no watermarks on screen.';
  return {
    imagem:
      `Ultra-realistic vertical 9:16 smartphone photo of the product in the reference image (${nome}) in ${cena}, ` +
      "a woman's hands gently arranging it, warm natural window light and soft fairy-light bokeh, " +
      `real home details, slightly imperfect framing like an amateur phone photo, not a studio shot. ${comum}`,
    video:
      `Vertical 9:16, 8 seconds, handheld iPhone footage with subtle natural camera shake, in ${cena}. ` +
      `A woman's hands pick up and show the ${nome}, then place it in its spot; slow push-in close-up of the details. ` +
      `Natural ambient room sound. ${comum} ` +
      `Friendly Brazilian Portuguese female voice-over, casual like talking to a friend: "${fala}"`,
    fala,
  };
}

module.exports = {
  legendasVideo,
  postComLink,
  resumo,
  legendaInstagram,
  legendaCarrossel,
  pinterest,
  comPubli,
  videoIA,
  REGRAS_ORIGINALIDADE,
};
