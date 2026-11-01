// PRODUTOS DA SEMANA: UMA mensagem só no Telegram, toda segunda (pedido da dona em 20/10: "fico confusa, coisa demais").
// Junta o que vende no TikTok Shop (contas/<conta>/tiktok-em-alta.txt, preenchido pela skill cacar-produtos-tiktok)
// com a lista da Shopee (contas/<conta>/shopee-produtos.txt; depois a Open API), marca o que vende NAS DUAS
// e escolhe no máximo 4 produtos, cada um com o que ELA faz (de preferência nada, ou 1 toque).
// Uso:  node app/produtos-semana.js <conta>            -> monta, salva em contas/<conta>/produtos-da-semana.txt e manda no Telegram
//       node app/produtos-semana.js <conta> --simular  -> só mostra, não manda
// Desde 26/10 (ela: "são muitas opções e não bate com a descrição"): depois do resumo vai UMA FOTO por produto
// do TikTok, com o título exato do anúncio e a loja (colunas foto | titulo | loja do tiktok-em-alta.txt).
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

// Colunas de uma linha do tiktok-em-alta.txt. As 3 últimas (foto | titulo | loja) são opcionais (linhas antigas não têm).
// O título do anúncio pode ter "|" dentro (ex.: "3x3 Metros | Para Festa"): com as 3 colunas, a loja é a última e o meio é o título.
function colunasTikTok(linha) {
  const c = linha.split('|').map((x) => x.trim());
  const extra = c.slice(10);
  const foto = /^https?:\/\//.test(extra[0] || '') ? extra[0] : '';
  const titulo = extra.length >= 3 ? extra.slice(1, -1).join(' | ') : extra[1] || '';
  const loja = extra.length >= 3 ? extra[extra.length - 1] : '';
  return { c: c.slice(0, 10), foto, titulo, loja };
}

function lerTikTok(conta) {
  const linhas = linhasDe(path.join(RAIZ, 'contas', conta, 'tiktok-em-alta.txt')).map(colunasTikTok);
  const ultima = linhas.reduce((d, { c }) => (c[0] > d ? c[0] : d), '');
  return {
    data: ultima,
    itens: linhas
      .filter(({ c }) => c[0] === ultima && c[2])
      .map(({ c: [, id, nome, preco, comissao, vendas, cresc, afiliados, , categoria], foto, titulo, loja }) => ({
        id, nome, preco: num(preco), comissao: num(comissao), vendas: num(vendas) || 0,
        cresc: num(cresc) || 0, afiliados: num(afiliados), categoria: (categoria || '').toLowerCase(),
        foto, titulo, loja,
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

// Legenda da foto de cada produto (o Telegram aceita até 1024 letras)
function legendaFoto(p, i) {
  const l = [`${i + 1}. ${p.nome}${p.preco != null ? ' (' + reais(p.preco) + ')' : ''}`];
  l.push('Busque na vitrine: ' + (p.titulo || busca(p.nome)));
  if (p.loja) l.push('Loja: ' + p.loja);
  l.push('👉 É ESTE da foto.');
  return l.join('\n').slice(0, 1024);
}

// Baixa a foto do anúncio (o servidor de imagens do FastMoss pede Referer) e devolve um JPG
async function baixarFoto(url, { fetchFn = fetch } = {}) {
  const r = await fetchFn(url, {
    headers: {
      Referer: 'https://www.fastmoss.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
      Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error('foto HTTP ' + r.status);
  const cru = Buffer.from(await r.arrayBuffer());
  if (!cru.length) throw new Error('foto vazia');
  const sharp = require('sharp');
  return sharp(cru).flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer();
}

// Manda 1 foto por produto. Se a foto falhar, vai só o texto; se até o texto falhar, segue (nunca quebra a rodada).
async function enviarFotos(lista, { token, chatId, fetchFn = fetch, log = console.log } = {}) {
  let fotos = 0, textos = 0;
  for (const [i, p] of lista.entries()) {
    const legenda = legendaFoto(p, i);
    try {
      if (!p.foto) throw new Error('sem foto');
      const jpg = await baixarFoto(p.foto, { fetchFn });
      const form = new FormData();
      form.append('chat_id', String(chatId));
      form.append('caption', legenda);
      form.append('photo', new Blob([jpg], { type: 'image/jpeg' }), `produto-${i + 1}.jpg`);
      const r = await fetchFn(`https://api.telegram.org/bot${token}/sendPhoto`, { method: 'POST', body: form, signal: AbortSignal.timeout(30000) });
      const json = await r.json().catch(() => ({}));
      // Nunca mostrar a URL (ela tem o token)
      if (!r.ok || !json.ok) throw new Error(`o Telegram recusou a foto (${json.description || 'HTTP ' + r.status})`);
      fotos++;
    } catch (e) {
      log(`(Foto do produto ${i + 1} não foi: ${e.message}. Vai só o texto.)`);
      try {
        await enviarTelegram(legenda, { token, chatId, fetchFn });
        textos++;
      } catch (e2) {
        log(`(Texto do produto ${i + 1} também não foi: ${e2.message})`);
      }
    }
  }
  return { fotos, textos };
}

async function produtosDaSemana(conta,{ simular = false, log = console.log, segredos } = {}) {
  const { data, itens } = lerTikTok(conta);
  const escolha = escolher({ tiktok: itens, shopee: lerShopee(conta), vitrine: lerVitrine(conta) });
  const msg = montarMensagem({ data, ...escolha });
  fs.writeFileSync(path.join(RAIZ, 'contas', conta, 'produtos-da-semana.txt'), msg + '\n');
  log(msg);
  const doTikTok = escolha.lista.filter((p) => p.id);
  if (simular) {
    doTikTok.forEach((p, i) => log(`\n[foto ${i + 1}] ${p.foto || '(sem foto: vai só o texto)'}\n${legendaFoto(p, i)}`));
    return { msg, enviado: false };
  }
  const seg = segredos || lerSegredosLocal(conta);
  if (!seg.telegramToken || !seg.telegramChatId) {
    log('\n(Sem TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID: a lista ficou só aqui.)');
    return { msg, enviado: false };
  }
  await enviarTelegram(msg, { token: seg.telegramToken, chatId: seg.telegramChatId });
  log('\nLista enviada pelo Telegram.');
  const f = await enviarFotos(doTikTok, { token: seg.telegramToken, chatId: seg.telegramChatId, log });
  log(`Fotos: ${f.fotos} enviada(s), ${f.textos} só em texto.`);
  return { msg, enviado: true, ...f };
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

module.exports = { produtosDaSemana, escolher, montarMensagem, parecidos, palavras, lerTikTok, colunasTikTok, legendaFoto, baixarFoto, enviarFotos };
