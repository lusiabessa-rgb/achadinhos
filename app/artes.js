// Artes das ofertas: imagem 1080x1350 (feed/Telegram/Pinterest) com foto, nome, preço e selo de desconto.
// Grátis: monta a arte com a foto oficial do produto, sem gastar créditos de IA.
const sharp = require('sharp');

const L = 1080;
const A = 1350;
const FONTE = "'Segoe UI', 'DejaVu Sans', 'Liberation Sans', Arial, sans-serif";

const xml = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

// Quebra o nome em até 2 linhas, cortando com "…" se for grande demais
function quebrar(texto, porLinha = 30, maxLinhas = 2) {
  const palavras = String(texto).replace(/\s+/g, ' ').trim().split(' ');
  const linhas = [''];
  for (const p of palavras) {
    const atual = linhas[linhas.length - 1];
    if ((atual + ' ' + p).trim().length <= porLinha) linhas[linhas.length - 1] = (atual + ' ' + p).trim();
    else if (linhas.length < maxLinhas) linhas.push(p.slice(0, porLinha));
    else {
      linhas[maxLinhas - 1] = linhas[maxLinhas - 1].slice(0, porLinha - 1).trim() + '…';
      break;
    }
  }
  return linhas.filter(Boolean);
}

function svgFundo({ cor, corEscura, marca }) {
  return Buffer.from(`<svg width="${L}" height="${A}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#fff7f3"/>
  <rect width="100%" height="120" fill="${cor}"/>
  <text x="60" y="80" font-family="${FONTE}" font-size="46" font-weight="800" fill="#fff">ACHADINHO DO DIA</text>
  <text x="${L - 60}" y="78" text-anchor="end" font-family="${FONTE}" font-size="34" font-weight="600" fill="#fff">${xml(marca)}</text>
  <rect x="60" y="160" width="${L - 120}" height="760" rx="40" fill="#ffffff" stroke="${corEscura}" stroke-opacity="0.12" stroke-width="3"/>
</svg>`);
}

function svgTextos({ nome, preco, precoAntigo, desconto, cor, chamada }) {
  const linhas = quebrar(nome);
  const nomeSvg = linhas
    .map((l, i) => `<text x="60" y="${1000 + i * 58}" font-family="${FONTE}" font-size="48" font-weight="700" fill="#2b2b2b">${xml(l)}</text>`)
    .join('');
  const yPreco = 1000 + linhas.length * 58 + 75;
  const antigo = precoAntigo
    ? `<text x="${L - 60}" y="${yPreco - 6}" text-anchor="end" font-family="${FONTE}" font-size="40" fill="#8a8a8a" text-decoration="line-through">${xml(precoAntigo)}</text>`
    : '';
  const selo = desconto
    ? `<g transform="translate(${L - 250}, 190)">
         <circle cx="90" cy="90" r="90" fill="${cor}"/>
         <text x="90" y="88" text-anchor="middle" font-family="${FONTE}" font-size="54" font-weight="800" fill="#fff">-${xml(desconto)}%</text>
         <text x="90" y="128" text-anchor="middle" font-family="${FONTE}" font-size="28" font-weight="700" fill="#fff">OFF</text>
       </g>`
    : '';
  return Buffer.from(`<svg width="${L}" height="${A}" xmlns="http://www.w3.org/2000/svg">
  ${selo}
  ${nomeSvg}
  ${preco ? `<text x="60" y="${yPreco}" font-family="${FONTE}" font-size="96" font-weight="800" fill="${cor}">${xml(preco)}</text>` : ''}
  ${antigo}
  <rect x="60" y="${A - 110}" width="${L - 120}" height="80" rx="40" fill="#2b2b2b"/>
  <text x="${L / 2}" y="${A - 57}" text-anchor="middle" font-family="${FONTE}" font-size="34" font-weight="700" fill="#fff">${xml(chamada)}</text>
</svg>`);
}

async function baixar(url) {
  if (!url) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch {
    return null;
  }
}

// p: { nome, preco, precoAntigo, desconto, foto (url ou Buffer) }
async function fazerArte(p, destino, opcoes = {}) {
  const cor = opcoes.cor || '#ee4d2d';
  const marca = opcoes.marca || '';
  const chamada = opcoes.chamada || 'Toque no link e garanta o seu';

  const camadas = [];
  const fotoBuf = Buffer.isBuffer(p.foto) ? p.foto : await baixar(p.foto);
  if (fotoBuf) {
    try {
      const foto = await sharp(fotoBuf)
        .resize(680, 680, { fit: 'contain', background: '#ffffff' })
        .flatten({ background: '#ffffff' })
        .png()
        .toBuffer();
      camadas.push({ input: foto, left: (L - 680) / 2, top: 200 });
    } catch {
      // foto estragada: a arte sai sem foto, mas sai
    }
  }
  camadas.push({ input: svgTextos({ ...p, cor, chamada }), left: 0, top: 0 });

  await sharp(svgFundo({ cor, corEscura: '#000', marca }))
    .composite(camadas)
    .jpeg({ quality: 88 })
    .toFile(destino);
  return destino;
}

module.exports = { fazerArte, quebrar };
