// PLACAR DO TIKTOK: quais vídeos estão ganhando e o que fazer mais.
// Uso:  node app/placar.js [conta] [--api arquivo.json]
// Lê contas/<conta>/metricas-tiktok.txt, uma linha por vídeo (copie os números do TikTok Studio):
//   data | título/gancho | visualizações | % assistido completo (ou tempo médio, ex.: 4,5s) | curtidas | compartilhamentos | salvos | cliques no produto | vendas
// Nota de cada vídeo = % assistido completo + 10 x (compartilhamentos + salvos) por 100 visualizações.
// (o TikTok premia quem assiste até o fim e quem guarda/manda para alguém)
// --api: arquivo JSON com a lista de vídeos no formato da API oficial do TikTok (video.list: title, view_count,
//        like_count, share_count...). Só funciona quando o app do TikTok tiver o escopo video.list (ainda não pedido).
//        A API não dá o % assistido; para esses, a nota usa só compartilhamentos e salvos.
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const DURACAO_PADRAO = 15; // segundos: duração média dos nossos vídeos (12 a 18 s), para converter "tempo médio" em %
const POUCAS_VIEWS = 200;

const CABECALHO = `# PLACAR DO TIKTOK @shopabessa: cole aqui os números de cada vídeo (TikTok Studio > Análises > o vídeo).
# Uma linha por vídeo, separando com | (a ordem importa). Linha com # é comentário.
# data | título/gancho | visualizações | % assistido completo (ou tempo médio, ex.: 4,5s) | curtidas | compartilhamentos | salvos | cliques no produto | vendas
# Exemplo:
# 2026-10-20 | Sua árvore fica com cara de vazia? | 1.250 | 22% | 48 | 6 | 15 | 4 | 1
# Depois rode:  node app/placar.js
`;

// "1.250" -> 1250 | "1,2 mil" -> 1200 | "3,4K" -> 3400 | "2 mi" -> 2000000 | "" -> 0
function numero(s) {
  let t = String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return 0;
  let mult = 1;
  const m = t.match(/^([\d.,]+)\s*(mil|k|mi|m)\b/);
  if (m) {
    mult = m[2] === 'mil' || m[2] === 'k' ? 1e3 : 1e6;
    t = m[1].replace(',', '.');
    return Math.round(parseFloat(t) * mult) || 0;
  }
  t = t.replace(/[^\d.,]/g, '');
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, ''); // 1.250 = mil duzentos e cinquenta
  t = t.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  return parseFloat(t) || 0;
}

// "22%" -> 22 | "22" -> 22 | "4,5s" / "0:05" -> estimativa pela duração média
function conclusao(s) {
  const t = String(s || '').trim().toLowerCase();
  if (!t) return { pct: null, estimado: false };
  const mmss = t.match(/^(\d+):(\d{1,2})$/);
  if (mmss || /s(eg)?\b|seg|segundo/.test(t)) {
    const seg = mmss ? Number(mmss[1]) * 60 + Number(mmss[2]) : numero(t);
    return { pct: Math.min(100, Math.round((seg / DURACAO_PADRAO) * 1000) / 10), estimado: true };
  }
  return { pct: Math.min(100, numero(t)), estimado: false };
}

function lerMetricas(arq, avisar = () => {}) {
  if (!fs.existsSync(arq)) return [];
  const linhas = [];
  fs.readFileSync(arq, 'utf8')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .forEach((linha, i) => {
      if (!linha.trim() || linha.trim().startsWith('#')) return;
      const c = linha.split('|').map((x) => x.trim());
      if (c.length < 3 || !c[1]) return avisar(`linha ${i + 1} ignorada (faltam colunas): ${linha.slice(0, 60)}`);
      const comp = conclusao(c[3]);
      linhas.push({
        data: c[0],
        titulo: c[1],
        views: numero(c[2]),
        conclusao: comp.pct,
        estimado: comp.estimado,
        curtidas: numero(c[4]),
        compartilhamentos: numero(c[5]),
        salvos: numero(c[6]),
        cliques: numero(c[7]),
        vendas: numero(c[8]),
        fonte: 'arquivo',
      });
    });
  return linhas;
}

// Lista de vídeos da API oficial (Display API, /v2/video/list/) -> linhas do placar. Não chama a internet.
function linhasDaApi(videos) {
  return (videos || []).map((v) => ({
    data: v.create_time ? new Date(v.create_time * 1000).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }) : '',
    titulo: (v.title || v.video_description || v.id || '').split('\n')[0].trim(),
    views: Number(v.view_count) || 0,
    conclusao: null, // a API não informa o % assistido
    estimado: false,
    curtidas: Number(v.like_count) || 0,
    compartilhamentos: Number(v.share_count) || 0,
    salvos: 0,
    cliques: 0,
    vendas: 0,
    fonte: 'api',
  }));
}

// Junta as duas fontes; o que foi colado à mão vale mais (tem o % assistido e as vendas)
function juntar(doArquivo, daApi = []) {
  const chave = (l) => l.titulo.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const vistos = new Set(doArquivo.map(chave));
  return [...doArquivo, ...daApi.filter((l) => !vistos.has(chave(l)))];
}

function nota(l) {
  const engaj = l.views ? ((l.compartilhamentos + l.salvos) / l.views) * 100 : 0;
  return Math.round(((l.conclusao || 0) + 10 * engaj) * 10) / 10;
}

function placar(linhas) {
  const validas = linhas.filter((l) => l.views > 0).map((l) => ({ ...l, nota: nota(l) }));
  const ordem = [...validas].sort((a, b) => b.nota - a.nota || b.views - a.views);
  const vencedores = ordem.slice(0, 3);
  const piores = ordem.length > 3 ? ordem.slice(-Math.min(3, ordem.length - 3)).reverse() : [];
  const total = (k) => validas.reduce((s, l) => s + (l[k] || 0), 0);
  const sugestoes = [];
  if (vencedores[0]) {
    sugestoes.push(`Faça 3 variações do vencedor "${vencedores[0].titulo}": mesmo gancho, troque a foto/trecho de abertura, a ordem das cenas e a frase da 2ª linha.`);
  }
  const vendeu = [...validas].filter((l) => l.vendas > 0 || l.cliques > 0).sort((a, b) => b.vendas - a.vendas || b.cliques - a.cliques)[0];
  if (vendeu && vendeu !== vencedores[0]) sugestoes.push(`"${vendeu.titulo}" levou ${vendeu.cliques} clique(s) e ${vendeu.vendas} venda(s): faça mais 2 com esse produto na sacolinha.`);
  if (piores[0]) sugestoes.push(`Pare de repetir o estilo de "${piores[0].titulo}" (pior nota).`);
  if (validas.length && validas.every((l) => l.views < POUCAS_VIEWS)) sugestoes.push(`Ainda são poucas visualizações (menos de ${POUCAS_VIEWS} por vídeo): o placar fica mais certo depois de uns 10 vídeos.`);
  return { vencedores, piores, sugestoes, videos: validas.length, totais: { views: total('views'), cliques: total('cliques'), vendas: total('vendas') } };
}

function relatorio(p) {
  const linha = (l, i) =>
    `  ${i + 1}. ${l.titulo} (${l.data || 'sem data'}): nota ${l.nota} | ${l.views} views | ` +
    `${l.conclusao === null ? 'sem % assistido' : `${l.conclusao}% completo${l.estimado ? ' (estimado pelo tempo médio)' : ''}`} | ` +
    `${l.compartilhamentos} compart. + ${l.salvos} salvos${l.views < POUCAS_VIEWS ? ' | poucas views' : ''}`;
  if (!p.videos) return 'Placar vazio: cole os números dos vídeos em contas/<conta>/metricas-tiktok.txt (o modelo está lá dentro).';
  return [
    `PLACAR DO TIKTOK (${p.videos} vídeo(s), ${p.totais.views} views, ${p.totais.cliques} clique(s) no produto, ${p.totais.vendas} venda(s))`,
    '',
    'Os 3 vencedores:',
    ...p.vencedores.map(linha),
    ...(p.piores.length ? ['', 'Os piores:', ...p.piores.map(linha)] : []),
    '',
    'O que fazer agora:',
    ...p.sugestoes.map((s) => '  - ' + s),
  ].join('\n');
}

if (require.main === module) {
  const a = process.argv.slice(2);
  const conta = a[0] && !a[0].startsWith('--') ? a[0] : 'lusia';
  const arq = path.join(RAIZ, 'contas', conta, 'metricas-tiktok.txt');
  if (!fs.existsSync(arq)) {
    fs.writeFileSync(arq, CABECALHO);
    console.log(`Criei ${arq}. Cole os números dos vídeos lá e rode de novo.`);
  } else {
    let daApi = [];
    if (a.includes('--api')) {
      const j = JSON.parse(fs.readFileSync(path.resolve(a[a.indexOf('--api') + 1]), 'utf8'));
      daApi = linhasDaApi(Array.isArray(j) ? j : (j.data && j.data.videos) || j.videos || []);
    }
    console.log(relatorio(placar(juntar(lerMetricas(arq, (m) => console.log('aviso: ' + m)), daApi))));
  }
}

module.exports = { numero, conclusao, lerMetricas, linhasDaApi, juntar, nota, placar, relatorio, CABECALHO };
