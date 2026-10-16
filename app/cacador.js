// Caçador: busca produtos por palavra-chave, dá uma nota e escolhe os melhores.
// Se uma busca falhar, as outras continuam. Só para tudo se a chave estiver errada.
const shopee = require('./shopee');
const demo = require('./demo');

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Nota = vendas (em escala log) x comissão x desconto x avaliação
function nota(p) {
  const vendas = Math.log10(num(p.sales) + 10);
  const comissao = num(p.commissionRate); // ex.: 0.08 = 8%
  const desconto = 1 + num(p.priceDiscountRate) / 100;
  const estrelas = num(p.ratingStar) >= 4.5 ? 1.2 : num(p.ratingStar) >= 4 ? 1 : 0.6;
  return vendas * comissao * 100 * desconto * estrelas;
}

function passaNosFiltros(p, filtros) {
  if (num(p.commissionRate) * 100 < filtros.comissaoMinimaPct) return false;
  if (num(p.sales) < filtros.vendasMinimas) return false;
  if (num(p.ratingStar) && num(p.ratingStar) < filtros.notaMinima) return false;
  const preco = num(p.priceMin || p.price);
  if (preco < filtros.precoMin || preco > filtros.precoMax) return false;
  if (!p.productLink && !p.offerLink) return false;
  const nome = String(p.productName || '').toLowerCase();
  if (filtros.palavrasProibidas.some((w) => nome.includes(w.toLowerCase()))) return false;
  return true;
}

async function cacar(config, chaves, historico, modoTeste, avisar = console.log) {
  const encontrados = new Map();
  let buscas = 0;
  let falhas = 0;
  for (const palavra of config.palavrasChave) {
    for (const ordem of ['vendidos', 'comissao']) {
      buscas++;
      let lista = [];
      try {
        lista = modoTeste ? demo.produtos(palavra) : await shopee.buscarProdutos(chaves, { palavra, ordem });
      } catch (e) {
        if (e instanceof shopee.ErroFatal) throw e;
        falhas++;
        avisar(`  aviso: a busca "${palavra}" (${ordem}) falhou: ${e.message}`);
        continue;
      }
      for (const p of lista) {
        if (!passaNosFiltros(p, config.filtros)) continue;
        if (historico.jaUsado(p.itemId, config.naoRepetirPorDias)) continue;
        p.palavra = palavra;
        p.nota = nota(p);
        encontrados.set(String(p.itemId), p);
      }
    }
  }
  if (falhas === buscas) throw new Error('Todas as buscas falharam. Confira a internet e tente de novo.');
  return [...encontrados.values()].sort((a, b) => b.nota - a.nota).slice(0, config.produtosPorDia);
}

// MODO MANUAL (enquanto a Shopee não libera as chaves): os produtos vêm de contas/<conta>/shopee-manual.json,
// já escolhidos a dedo, com o link de afiliada pronto. A máquina só pula os que já foram usados.
function cacarManual(config, lista, historico) {
  return lista
    .filter((p) => p && p.itemId && p.productName && (p.offerLink || p.productLink))
    .filter((p) => !historico.jaUsado(p.itemId, config.naoRepetirPorDias))
    .map((p) => ({ ...p, nota: nota(p) }))
    .slice(0, config.produtosPorDia);
}

module.exports = { cacar, cacarManual, nota, passaNosFiltros };
