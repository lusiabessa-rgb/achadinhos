// Conversa com a API oficial de afiliados da Shopee Brasil (GraphQL).
// Assinatura: SHA256(AppId + Timestamp + Payload + Secret), timestamp em segundos.
// Reforços: tempo-limite, novas tentativas automáticas e mensagens de erro em português.
const crypto = require('crypto');

const ENDPOINT = 'https://open-api.affiliate.shopee.com.br/graphql';
const TEMPO_LIMITE_MS = 20000;
const TENTATIVAS = 4;

// sortType da Shopee: 1 relevância, 2 mais vendidos, 3 maior preço, 4 menor preço, 5 maior comissão
const ORDEM = { relevancia: 1, vendidos: 2, comissao: 5 };

// Erros em que não adianta tentar de novo (chave errada, conta bloqueada etc.)
const ERROS_FATAIS = {
  10020: 'A Shopee recusou as chaves (assinatura inválida ou app desativado). Confira o APP_ID e o SECRET no CHAVES.txt e o relógio do PC.',
  10031: 'Acesso negado pela Shopee.',
  10032: 'ID de afiliada inválido.',
  10033: 'A conta de afiliada está congelada.',
  10034: 'A conta de afiliada está na lista de bloqueio.',
  10035: 'A sua conta ainda não tem acesso à Open API. Peça acesso no painel de afiliada.',
};
const ERRO_LIMITE = 10030; // muitas chamadas seguidas: espera e tenta de novo

class ErroFatal extends Error {}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function codigoDoErro(json) {
  const e = json && json.errors && json.errors[0];
  return e && ((e.extensions && e.extensions.code) || e.code);
}

async function chamar(chaves, query, variables = {}, fetchFn = fetch) {
  let ultimoErro;
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    // A assinatura é refeita a cada tentativa, porque o timestamp vence em ~5 min.
    const payload = JSON.stringify({ query, variables });
    const ts = Math.floor(Date.now() / 1000);
    const assinatura = crypto
      .createHash('sha256')
      .update(chaves.appId + ts + payload + chaves.secret)
      .digest('hex');

    try {
      const resp = await fetchFn(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `SHA256 Credential=${chaves.appId}, Timestamp=${ts}, Signature=${assinatura}`,
        },
        body: payload,
        signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      });
      const json = await resp.json().catch(() => null);
      const codigo = Number(codigoDoErro(json));

      if (ERROS_FATAIS[codigo]) throw new ErroFatal(ERROS_FATAIS[codigo]);
      if (resp.ok && json && json.data && !json.errors) return json.data;

      const msg = json && json.errors ? json.errors.map((e) => e.message).join(' | ') : `HTTP ${resp.status}`;
      ultimoErro = new Error(`Shopee: ${msg}${codigo ? ` (código ${codigo})` : ''}`);
      // Erro de parâmetro (11001) não melhora tentando de novo
      if (codigo === 11001) throw ultimoErro;
      if (codigo === ERRO_LIMITE) await espera(5000 * tentativa);
    } catch (e) {
      if (e instanceof ErroFatal || (e.message || '').includes('código 11001')) throw e;
      ultimoErro = e.name === 'TimeoutError' ? new Error('A Shopee demorou demais para responder.') : e;
    }
    if (tentativa < TENTATIVAS) await espera(1500 * 2 ** (tentativa - 1)); // 1,5s, 3s, 6s
  }
  throw new Error(`Falhou depois de ${TENTATIVAS} tentativas: ${ultimoErro.message}`);
}

const CAMPOS = `itemId productName commissionRate commission price priceMin priceMax
  sales ratingStar priceDiscountRate imageUrl shopName productLink offerLink`;

async function buscarProdutos(chaves, { palavra, ordem = 'vendidos', pagina = 1, limite = 50 }, fetchFn) {
  const query = `query ($kw: String, $sort: Int, $page: Int, $limit: Int) {
    productOfferV2(keyword: $kw, sortType: $sort, page: $page, limit: $limit) {
      nodes { ${CAMPOS} }
    }
  }`;
  const data = await chamar(
    chaves,
    query,
    { kw: palavra, sort: ORDEM[ordem] || 2, page: pagina, limit: limite },
    fetchFn
  );
  const nodes = data && data.productOfferV2 && data.productOfferV2.nodes;
  return Array.isArray(nodes) ? nodes.filter((p) => p && p.itemId && p.productName) : [];
}

async function gerarLinkCurto(chaves, urlProduto, subId = 'maquina', fetchFn) {
  const query = `mutation ($url: String!, $subs: [String]) {
    generateShortLink(input: { originUrl: $url, subIds: $subs }) { shortLink }
  }`;
  const data = await chamar(chaves, query, { url: urlProduto, subs: [subId] }, fetchFn);
  const link = data && data.generateShortLink && data.generateShortLink.shortLink;
  if (!link) throw new Error('A Shopee não devolveu o link curto.');
  return link;
}

module.exports = { buscarProdutos, gerarLinkCurto, ErroFatal, _chamar: chamar };
