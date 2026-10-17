// POSTS DE CONTEÚDO (sem venda): tendência, inspiração, dica.
// Uso:  node app/conteudo.js <conta>
// A dona (ou o Claude) coloca em contas/<conta>/conteudo/ dois arquivos com o mesmo nome:
//   salsichinha.jpg (ou .png)  -> a imagem ORIGINAL (feita por nós ou por IA; nunca de outra pessoa)
//   salsichinha.txt            -> 1ª linha = título que vai na arte; o resto = legenda do Instagram
// A máquina faz a arte 1080x1350 com a marca e põe na fila (publico/<conta>/conteudo/fila.json).
// O publicador posta um por rodada e nunca repete.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const maquina = require('./maquina');

const RAIZ = path.join(__dirname, '..');
const L = 1080;
const A = 1350;
const FONTE = "'Segoe UI', 'DejaVu Sans', 'Liberation Sans', Arial, sans-serif";
const xml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
// Emoji não aparece em todo computador: some da arte (continua na legenda)
const semEmoji = (s) => String(s).replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').replace(/\s+/g, ' ').trim();

function quebrar(texto, porLinha = 26, maxLinhas = 3) {
  const linhas = [''];
  for (const p of texto.split(' ')) {
    const atual = linhas[linhas.length - 1];
    if ((atual + ' ' + p).trim().length <= porLinha) linhas[linhas.length - 1] = (atual + ' ' + p).trim();
    else if (linhas.length < maxLinhas) linhas.push(p);
    else {
      linhas[maxLinhas - 1] = linhas[maxLinhas - 1].slice(0, porLinha - 1).trim() + '…';
      break;
    }
  }
  // Palavrinha solta no fim da linha ("o", "de", "a") desce para a linha de baixo: lê melhor
  for (let i = 0; i < linhas.length - 1; i++) {
    const m = linhas[i].match(/^(.+)\s(\S{1,3})$/);
    if (m && (m[2] + ' ' + linhas[i + 1]).length <= porLinha + 4) {
      linhas[i] = m[1];
      linhas[i + 1] = m[2] + ' ' + linhas[i + 1];
    }
  }
  return linhas.filter(Boolean);
}

async function fazerArte(imagem, titulo, destino, { marca = '', cor = '#b0294a' } = {}) {
  const linhas = quebrar(semEmoji(titulo));
  const alturaFaixa = 70 + linhas.length * 66;
  const textos = linhas
    .map((l, i) => `<text x="60" y="${A - alturaFaixa + 82 + i * 66}" font-family="${FONTE}" font-size="56" font-weight="800" fill="#fff">${xml(l)}</text>`)
    .join('');
  const svg = Buffer.from(`<svg width="${L}" height="${A}" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/>
  </linearGradient></defs>
  <rect x="0" y="${A - alturaFaixa - 160}" width="${L}" height="${alturaFaixa + 160}" fill="url(#g)"/>
  <rect x="60" y="${A - alturaFaixa - 10}" width="12" height="${linhas.length * 66}" fill="${cor}"/>
  ${textos.replace(/x="60"/g, 'x="92"')}
  ${marca ? `<rect x="${L - 60 - (marca.length * 19 + 48)}" y="44" rx="28" width="${marca.length * 19 + 48}" height="56" fill="${cor}"/>
  <text x="${L - 60 - (marca.length * 19 + 48) / 2}" y="82" text-anchor="middle" font-family="${FONTE}" font-size="32" font-weight="700" fill="#fff">${xml(marca)}</text>` : ''}
</svg>`);
  await sharp(imagem)
    .resize(L, A, { fit: 'cover', position: 'attention' })
    .composite([{ input: svg, left: 0, top: 0 }])
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 88 })
    .toFile(destino);
  return destino;
}

// Lê contas/<conta>/conteudo, gera as artes que faltam e devolve a fila
async function preparar(conta, log = console.log) {
  const pastaConta = path.join(RAIZ, 'contas', conta);
  const config = maquina.lerConfig(pastaConta);
  const origem = path.join(pastaConta, 'conteudo');
  const destino = path.join(RAIZ, 'publico', conta, 'conteudo');
  fs.mkdirSync(destino, { recursive: true });
  const fila = [];
  if (!fs.existsSync(origem)) return fila;
  for (const txt of fs.readdirSync(origem).filter((f) => f.endsWith('.txt')).sort()) {
    const slug = txt.slice(0, -4).toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    const img = ['.jpg', '.jpeg', '.png', '.webp'].map((e) => path.join(origem, txt.slice(0, -4) + e)).find((f) => fs.existsSync(f));
    if (!img) {
      log(`  aviso: "${txt}" está sem imagem com o mesmo nome; pulei.`);
      continue;
    }
    const [titulo, ...resto] = fs.readFileSync(path.join(origem, txt), 'utf8').replace(/^﻿/, '').split(/\r?\n/);
    const legenda = resto.join('\n').trim();
    if (!titulo.trim() || !legenda) {
      log(`  aviso: "${txt}" precisa do título na 1ª linha e da legenda embaixo; pulei.`);
      continue;
    }
    const arte = path.join(destino, slug + '.jpg');
    if (!fs.existsSync(arte) || fs.statSync(arte).mtimeMs < Math.max(fs.statSync(img).mtimeMs, fs.statSync(path.join(origem, txt)).mtimeMs)) {
      await fazerArte(img, titulo.trim(), arte, { marca: config.marca, cor: config.corArte });
      log(`  arte pronta: conteudo/${slug}.jpg`);
    }
    fila.push({ slug, arte: `conteudo/${slug}.jpg`, legenda });
  }
  fs.writeFileSync(path.join(destino, 'fila.json'), JSON.stringify(fila, null, 2));
  log(`Conteúdo: ${fila.length} post(s) na fila.`);
  return fila;
}

if (require.main === module) {
  const conta = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'lusia';
  preparar(conta).catch((e) => {
    console.error('ERRO: ' + e.message);
    process.exitCode = 1;
  });
}

module.exports = { preparar, fazerArte, quebrar };
