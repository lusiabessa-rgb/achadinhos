// PRODUTOS DA SEMANA: UMA mensagem só no Telegram, toda segunda (pedido da dona em 20/10: "fico confusa, coisa demais").
// Junta o que vende no TikTok Shop (contas/<conta>/tiktok-em-alta.txt, preenchido pela skill cacar-produtos-tiktok)
// com a lista da Shopee (contas/<conta>/shopee-produtos.txt; depois a Open API), marca o que vende NAS DUAS
// e escolhe no máximo 4 produtos, cada um com o que ELA faz (de preferência nada, ou 1 toque).
// Uso:  node app/produtos-semana.js <conta>            -> monta, salva em contas/<conta>/produtos-da-semana.txt e manda no Telegram
//       node app/produtos-semana.js <conta> --simular  -> só mostra, não manda
const fs = require('fs');
const path = require('path');
const { enviarTelegram } = require('./conferencia');

const RAIZ = path.join(__dirname, '..');
const MAX = 4;
const num = (s) => {
  const t = String(s ?? '').trim();
  if (!t) return null;
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const linhasDe = (arq) =>
  fs.existsSync(arq)
    ? fs.readFileSync(arq, 'utf8').replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    : [];

// Palavras que identificam o produto (sem acento, sem número, sem palavra vazia)
const VAZIAS = new Set('de da do das dos com para por e em a o kit cm m un led leds natal natalina natalinas natalino 4 x'.split(' '));
function palavras(nome) {
  return new Set(
    nome
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .map((p) => p.replace(/(oes|aes|s)$/, ''))
      .filter((p) => p.length > 2 && !VAZIAS.has(p))
  );
}
// Mesmo produto = pelo menos 2 palavras em comum (ex.: "capa almofada")
function parecidos(a, b) {
  const pa = palavras(a);
  let comum = 0;
  for (const p of palavras(b)) if (pa.has(p)) comum++;
  return comum >= 2;
}

function lerTikTok(conta) {
  const linhas = linhasDe(path.join(RAIZ, 'contas', conta, 'tiktok-em-alta.txt')).map((l) => l.split('|').map((c) => c.trim()));
  const ultima = linhas.reduce((d, c) => (c[0] > d ? c[0] : d), '');
  return {
    data: ultima,
    itens: linhas
      .filter((c) => c[0] === ultima && c[2])
      .map(([, id, nome, preco, comissao, vendas, cresc, afiliados, , categoria]) => ({
        id, nome, preco: num(preco), comissao: num(comissao), vendas: num(vendas) || 0,
        cresc: num(cresc) || 0, afiliados: num(afiliados), categoria: (categoria || '').toLowerCase(),
      })),
  };
}
function lerShopee(conta) {
  return linhasDe(path.join(RAIZ, 'contas', conta, 'shopee-produtos.txt')).map((l) => {
    const c = l.split('|').map((x) => x.trim());
    return { nome: c[0], preco: num(c[1]), comissao: num(c[2]), link: /^https?:/.test(c[3] || '') ? c[3] : null };
  });
}
// Vitrine do TikTok: o que ela já pôs (contas/<conta>/tiktok-produtos.txt)
function lerVitrine(conta) {
  return linhasDe(path.join(RAIZ, 'contas', conta, 'tiktok-produtos.txt')).map((l) => l.split('|')[0].trim());
}

// Nota do TikTok: vende muito, está crescendo, poucos afiliados e boa comissão
function notaTikTok(p) {
  const afil = p.afiliados == null ? 300 : p.afiliados;
  return Math.log10(1 + p.vendas) * 10 + Math.min(p.cresc, 100) / 10 + (afil < 50 ? 8 : afil < 300 ? 4 : 0) + (p.comissao || 8) / 2;
}

function escolher({ tiktok, shopee, vitrine }) {
  const cands = tiktok.map((t) => {
    const s = shopee.find((x) => parecidos(t.nome, x.nome));
    return { ...t, shopee: s || null, naVitrine: vitrine.some((v) => parecidos(t.nome, v)), nasDuas: !!s, nota: notaTikTok(t) + (s ? 15 : 0) };
  });
  cands.sort((a, b) => b.nota - a.nota);
  // Mistura: até 2 de Natal e 2 de casa (o nicho é casa + Natal); se faltar, completa com o que tiver
  const lista = [];
  for (const cat of ['natal', 'casa']) lista.push(...cands.filter((c) => c.categoria === cat).slice(0, MAX / 2));
  for (const c of cands) if (lista.length < MAX && !lista.includes(c)) lista.push(c);
  lista.sort((a, b) => b.nota - a.nota);
  // Produto da Shopee que não está no TikTok, mas já tem link: entra se sobrar vaga
  const soShopee = shopee.filter((s) => s.link && !cands.some((c) => c.shopee === s));
  return { lista: lista.slice(0, MAX), soShopee };
}

// Busca curta para digitar no celular: sem medidas (45x45, 9 m, 14cm) e sem "de/com/e", até 4 palavras
const busca = (nome) =>
  nome
    .replace(/\b\d+(x\d+)+\b|\b\d+([.,]\d+)?\s*(cm|m)\b/gi, ' ')
    .split(/\s+/)
    .filter((p) => p && !/^(kit|de|da|do|e|com|para|\d+)$/i.test(p))
    .slice(0, 4)
    .join(' ')
    .toLowerCase();
const reais = (v) => (v == null ? '' : 'R$ ' + v.toFixed(2).replace('.', ','));
function montarMensagem({ data, lista, soShopee }) {
  const l = ['🎄 PRODUTOS DA SEMANA (só ' + lista.length + ')', ''];
  lista.forEach((p, i) => {
    // "Nas duas" = o mesmo TIPO de produto vende nas duas lojas; cada vídeo mostra o produto idêntico ao do link
    const onde = p.nasDuas ? 'vende nas DUAS ✅' : 'só TikTok';
    l.push(`${i + 1}. ${p.nome} (${reais(p.preco)}): ${onde}`);
    l.push('   TikTok: ' + (p.naVitrine ? 'já está na vitrine ✅' : `pôr na vitrine (busque "${busca(p.nome)}")`));
    if (p.shopee) l.push('   Shopee: ' + (p.shopee.link ? 'pronto ✅' : 'me mande o link de afiliada'));
    l.push('');
  });
  const extra = soShopee.filter((s) => !lista.some((p) => p.shopee === s)).slice(0, Math.max(0, MAX - lista.length) + 1);
  if (extra.length) {
    l.push('Shopee (já pronto, você não faz nada):');
    for (const s of extra) l.push('• ' + s.nome);
    l.push('');
  }
  const pendentes = lista.filter((p) => !p.naVitrine).length + lista.filter((p) => p.shopee && !p.shopee.link).length;
  l.push(pendentes ? `👉 Você só faz ${pendentes} coisa(s) acima. O resto é comigo.` : '👉 Nada para você fazer. Tudo pronto!');
  if (data) l.push(`(TikTok pesquisado em ${data.split('-').reverse().join('/')})`);
  return l.join('\n');
}

async function produtosDaSemana(conta, { simular = false, log = console.log, segredos } = {}) {
  const { data, itens } = lerTikTok(conta);
  const escolha = escolher({ tiktok: itens, shopee: lerShopee(conta), vitrine: lerVitrine(conta) });
  const msg = montarMensagem({ data, ...escolha });
  fs.writeFileSync(path.join(RAIZ, 'contas', conta, 'produtos-da-semana.txt'), msg + '\n');
  log(msg);
  if (simular) return { msg, enviado: false };
  const seg = segredos || lerSegredosLocal(conta);
  if (!seg.telegramToken || !seg.telegramChatId) {
    log('\n(Sem TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID: a lista ficou só aqui.)');
    return { msg, enviado: false };
  }
  await enviarTelegram(msg, { token: seg.telegramToken, chatId: seg.telegramChatId });
  log('\nLista enviada pelo Telegram.');
  return { msg, enviado: true };
}

function lerSegredosLocal(conta) {
  const s = {};
  for (const linha of linhasDe(path.join(RAIZ, 'contas', conta, 'CHAVES.txt'))) {
    const m = linha.match(/^([A-Za-z_]+)\s*=\s*(.+?)\s*$/);
    if (m) s[m[1].toUpperCase()] = m[2].replace(/^["']|["']$/g, '');
  }
  return { telegramToken: process.env.TELEGRAM_BOT_TOKEN || s.TELEGRAM_BOT_TOKEN, telegramChatId: process.env.TELEGRAM_CHAT_ID || s.TELEGRAM_CHAT_ID };
}

if (require.main === module) {
  const conta = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'lusia';
  produtosDaSemana(conta, { simular: process.argv.includes('--simular') }).catch((e) => {
    console.error('ERRO: ' + e.message);
    process.exitCode = 1;
  });
}

module.exports = { produtosDaSemana, escolher, montarMensagem, parecidos, palavras, lerTikTok };
