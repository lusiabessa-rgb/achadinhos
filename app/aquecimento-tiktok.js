// VÍDEOS DO TIKTOK @shopabessa (aquecimento e, quando houver clipe de vídeo do produto, vídeos para a sacolinha).
// Uso:  node app/aquecimento-tiktok.js <conta> [--dias 4] [--por-dia 3] [--sacolinha-por-dia 1] [--inicio AAAA-MM-DD] [--saida contas/lusia/tiktok-fila]
// Pega as fotos (primeiro as da dona, em Projeto zero/aquecimento/fotos-dos-produtos; depois as da máquina),
// faz vídeos verticais 1080x1920 de 12 a 18 s, cena nova a cada ~2 s, gancho de PROBLEMA no 1º quadro (segundo 0),
// texto só na área segura do TikTok e final que emenda no começo (loop: aumenta a re-visualização).
// Clipe de vídeo do produto (.mp4 com o mesmo começo de nome da foto, ex.: presepio-mdf.mp4 ou presepio-mdf-2.mp4)
// entra no lugar da foto parada, cada vídeo com um trecho diferente. Clipe é IA, a não ser que tenha "-real" no nome.
// Tipos (no nome do arquivo e no LEIA.txt):
//   <hora>-video-aquecimento.mp4  sem sacolinha (fotos com movimento: o TikTok Shop restringe slideshow com produto)
//   <hora>-video-sacolinha.mp4    só clipes de vídeo de verdade de 1 produto: pode ir com a sacolinha (+ #publi)
// Saída: POSTAR-HOJE/tiktok-aquecimento/<data>/<hora>-video-<tipo>.mp4 + <hora>-legenda.txt + LEIA.txt
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const sharp = require('sharp');
const maquina = require('./maquina');
const { quebrar } = require('./conteudo');

const RAIZ = path.join(__dirname, '..');
const L = 1080;
const A = 1920;
const SEG = 2; // ~2 s por cena: ritmo rápido (o TikTok premia tempo assistido e % de conclusão)
const TRANS = 0.3; // transição entre as cenas
const DURACAO = { min: 12, max: 18 }; // segundos
const CENAS_MEIO = 6; // cenas entre o gancho e o final
// Área segura do TikTok: em cima ficam as abas, embaixo a legenda e a sacolinha, na direita os botões
const ZONA = { topo: 150, baixo: 480, esquerda: 60, direita: 150 };
const FUNDO = '#f7f0ea';
const FONTE = "'Segoe UI', 'DejaVu Sans', 'Liberation Sans', Arial, sans-serif";
const HORAS = ['12h', '18h', '20h', '21h', '15h'];
const xml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const semEmoji = (s) => String(s).replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').replace(/\s+/g, ' ').trim();
const IMG = /\.(jpe?g|png|webp)$/i;
const VID = /\.mp4$/i;
const umaCasa = (n) => Math.round(n * 10) / 10;

// Ganchos de PROBLEMA (a pessoa se reconhece e fica) + frase com palavras que as pessoas PESQUISAM no TikTok.
// Nunca venda nem "link" no aquecimento.
const GANCHOS = [
  { texto: 'Sua árvore fica com cara de vazia?', busca: 'Como encher a árvore de natal gastando pouco' },
  { texto: 'Quer decorar para o Natal gastando pouco?', busca: 'Decoração de natal barata que faz efeito' },
  { texto: 'Apartamento pequeno também merece Natal', busca: 'Enfeite de natal para apartamento pequeno' },
  { texto: 'Sua mesa da ceia está sem graça?', busca: 'Mesa de natal decorada simples e bonita' },
  { texto: 'Sua casa ainda não tem clima de Natal?', busca: 'Como decorar a casa para o natal' },
  { texto: 'Não sabe por onde começar a decorar?', busca: 'Ideias de decoração de natal para começar hoje' },
  { texto: 'Sua sala parece sem graça no Natal?', busca: 'Decoração de natal para sala pequena' },
  { texto: 'Árvore pequena com cara de árvore cheia?', busca: 'Árvore de natal pequena decorada' },
  { texto: 'Natal bonito sem gastar muito? Salva!', busca: 'Decoração de natal barata e simples' },
  { texto: 'Cansou da decoração de sempre?', busca: 'Tendências de decoração de natal 2026' },
];
const PERGUNTAS = [
  'Qual você escolheria? Comenta aqui 👇',
  'Você já começou a decorar? 🎄',
  'Me conta nos comentários: 1, 2 ou 3?',
  'Salva para não esquecer ✨',
  'Quer mais ideias assim? Me segue 🎄',
];
// O final volta para a foto/trecho do começo: o vídeo "emenda" e a pessoa assiste de novo
const FIM = ['Volta e escolhe a sua favorita', 'Assiste de novo e salva', 'Qual foi a sua? Volta e vê'];
const FRASES_SACOLINHA = ['Olha esse detalhe de perto', 'Fica lindo em qualquer cantinho', 'Toque na sacolinha para ver o preço'];

// Lê as fotos disponíveis: { arquivo, texto, ia, clipes: [mp4 do mesmo produto] }
function juntarFotos(conta) {
  const pastaConta = path.join(RAIZ, 'contas', conta);
  const fotos = [];
  // A mesma foto pode estar em duas pastas (ex.: foto de produto copiada para a fila do Instagram):
  // entra uma vez só e fica com a marcação da primeira pasta (foto real não leva rótulo de IA)
  const jaTem = new Set();
  // contas/<conta>/nao-usar-em-video.txt: palavras; foto com essa palavra no nome fica de fora (ex.: foto cortada)
  const arqFora = path.join(pastaConta, 'nao-usar-em-video.txt');
  const fora = fs.existsSync(arqFora) ? fs.readFileSync(arqFora, 'utf8').split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter((l) => l && !l.startsWith('#')) : [];
  const add = (pasta, ia, textoDe, filtro = () => true) => {
    if (!fs.existsSync(pasta)) return;
    const nomes = fs.readdirSync(pasta).sort();
    const usar = (x) => filtro(x) && !fora.some((w) => x.toLowerCase().includes(w));
    const imagens = nomes.filter((x) => IMG.test(x) && usar(x));
    // Cada clipe vai para a foto com o começo de nome mais parecido (flores-3-cores.mp4 vai para flores-3-cores.jpg, não para flores.jpg)
    const clipesDe = {};
    for (const v of nomes.filter((x) => VID.test(x) && usar(x))) {
      const n = v.replace(VID, '').toLowerCase();
      const dono = imagens
        .filter((f) => n === f.replace(IMG, '').toLowerCase() || n.startsWith(f.replace(IMG, '').toLowerCase() + '-'))
        .sort((a, b) => b.length - a.length)[0];
      if (dono) (clipesDe[dono] = clipesDe[dono] || []).push(path.join(pasta, v));
    }
    for (const f of imagens) {
      const arquivo = path.join(pasta, f);
      const marca = fs.statSync(arquivo).size;
      if (jaTem.has(marca)) continue;
      jaTem.add(marca);
      fotos.push({ arquivo, texto: textoDe(f), ia: typeof ia === 'function' ? ia(f) : ia, clipes: clipesDe[f] || [] });
    }
  };
  const bonito = (f) => f.replace(IMG, '').replace(/^\d+-/, '').replace(/[-_]+/g, ' ').trim();
  // 1) Fotos da dona (reais)
  add(path.join(RAIZ, '..', 'aquecimento', 'fotos-dos-produtos'), false, () => '');
  // 2) Produtos da lista manual (frase de benefício como texto)
  const frases = {};
  const lista = path.join(pastaConta, 'shopee-produtos.txt');
  if (fs.existsSync(lista)) {
    for (const linha of fs.readFileSync(lista, 'utf8').split(/\r?\n/)) {
      if (!linha.trim() || linha.trim().startsWith('#')) continue;
      const c = linha.split('|').map((x) => x.trim());
      if (c[4]) frases[c[4]] = c[5] || c[0];
    }
  }
  // Foto de produto refeita com IA (ex.: a do print veio cortada) fica listada em fotos/feitas-com-ia.txt e leva o rótulo
  const arqIa = path.join(pastaConta, 'fotos', 'feitas-com-ia.txt');
  const feitasComIa = new Set(fs.existsSync(arqIa) ? fs.readFileSync(arqIa, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')) : []);
  add(path.join(pastaConta, 'fotos'), (f) => feitasComIa.has(f), (f) => frases[f] || bonito(f));
  // 3) Imagens de conteúdo feitas com IA (título = 1ª linha do .txt)
  const pastaConteudo = path.join(pastaConta, 'conteudo');
  add(pastaConteudo, true, (f) => {
    const txt = path.join(pastaConteudo, f.replace(IMG, '.txt'));
    return fs.existsSync(txt) ? fs.readFileSync(txt, 'utf8').replace(/^﻿/, '').split(/\r?\n/)[0].trim() : bonito(f);
  });
  // 4) Fotos da cortina de LED feitas com IA (só a luz amarela, igual à da vitrine; as "com neve" ficam numa subpasta e não entram)
  const CENAS_CORTINA = { sala: 'Cortina de LED deixa a sala com clima de Natal', quarto: 'No quarto fica assim', ceia: 'Luz quente na mesa da ceia', janela: 'Na janela, quem passa na rua vê', produto: 'Cortina de LED 3x3 metros' };
  const pastaCortina = path.join(RAIZ, '..', 'Cantinho da Alfabetizacao', 'conteudo', 'natal-ia', 'cortina-led');
  add(pastaCortina, true, (f) => CENAS_CORTINA[Object.keys(CENAS_CORTINA).find((k) => f.includes(k))] || 'Cortina de LED', (f) => f.startsWith('amarela-'));
  return fotos;
}

// Clipe é feito com IA, a não ser que tenha "-real" no nome (filmado de verdade, sem rosto)
const iaDaCena = (foto, clipe) => (clipe ? !/(^|[-_])real([-_.]|$)/i.test(path.basename(clipe)) : !!foto.ia);

// Camada de texto transparente 1080x1920, SEMPRE dentro da área segura do TikTok.
// grande = gancho do 1º quadro (letra maior, até 4 linhas)
async function camadaTexto(titulo, { cor = '#b0294a', numero = 0, ia = false, grande = false } = {}) {
  const fonte = grande ? 76 : 58;
  const altLinha = grande ? 90 : 72;
  const linhas = titulo ? quebrar(semEmoji(titulo), grande ? 17 : 22, grande ? 4 : 3) : [];
  const x = ZONA.esquerda;
  const w = L - ZONA.esquerda - ZONA.direita;
  const y = ZONA.topo + 20;
  const h = linhas.length ? 60 + fonte + (linhas.length - 1) * altLinha : 0;
  const baixo = linhas.length ? y + h : ZONA.topo;
  const meio = x + w / 2;
  const svg = `<svg width="${L}" height="${A}" xmlns="http://www.w3.org/2000/svg">
  ${linhas.length ? `<rect x="${x}" y="${y}" rx="28" width="${w}" height="${h}" fill="${cor}" opacity="0.94"/>` : ''}
  ${linhas.map((l, i) => `<text x="${meio}" y="${y + 30 + Math.round(fonte * 0.85) + i * altLinha}" text-anchor="middle" font-family="${FONTE}" font-size="${fonte}" font-weight="800" fill="#fff">${xml(l)}</text>`).join('')}
  ${numero ? `<circle cx="${x + 50}" cy="${baixo + 80}" r="50" fill="${cor}"/><text x="${x + 50}" y="${baixo + 100}" text-anchor="middle" font-family="${FONTE}" font-size="56" font-weight="800" fill="#fff">${numero}</text>` : ''}
  ${ia ? `<rect x="${meio - 190}" y="${baixo + 55}" rx="25" width="380" height="50" fill="#ffffff" opacity="0.85"/><text x="${meio}" y="${baixo + 90}" text-anchor="middle" font-family="${FONTE}" font-size="28" fill="#6b5a52">Conteúdo gerado por IA</text>` : ''}
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// Fundo liso claro (nada desfocado: a dona pediu em 17/10) com a foto inteira, nítida e centralizada
async function fundoComFoto(arquivo) {
  const meio = await sharp(arquivo).resize(L - 80, 1250, { fit: 'inside' }).toBuffer();
  const m = await sharp(meio).metadata();
  return sharp({ create: { width: L, height: A, channels: 3, background: FUNDO } })
    .composite([{ input: meio, left: Math.round((L - m.width) / 2), top: Math.round((A - m.height) / 2) + 60 }])
    .jpeg({ quality: 92 })
    .toBuffer();
}

// Um quadro pronto (foto + texto), para o modo "fotos" do TikTok e para o teste de qualidade
async function quadro(foto, titulo, destino, { cor, numero, grande, ia } = {}) {
  const texto = await camadaTexto(titulo, { cor, numero, grande, ia: ia === undefined ? foto.ia : ia });
  await sharp(await fundoComFoto(foto.arquivo)).composite([{ input: texto, left: 0, top: 0 }]).jpeg({ quality: 90 }).toFile(destino);
  return destino;
}

// Duração do clipe (lê o cabeçalho com o próprio ffmpeg; 0 se não souber)
const duracoes = {};
function duracaoClipe(arq) {
  if (duracoes[arq] !== undefined) return duracoes[arq];
  let saida = '';
  try {
    execFileSync(acharFfmpeg(), ['-hide_banner', '-i', arq], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    saida = String(e.stderr || '');
  }
  const m = saida.match(/Duration: (\d+):(\d+):([\d.]+)/);
  return (duracoes[arq] = m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0);
}

// Tempo de cada cena para o vídeo ficar entre 12 e 18 s, e de onde sai o trecho de cada clipe
function finalizar(cenas, v, duracaoDe, extra) {
  const n = cenas.length;
  const seg = Math.ceil(Math.max(SEG, (DURACAO.min + (n - 1) * TRANS) / n) * 10) / 10;
  cenas.forEach((c, i) => {
    if (!c.clipe || c.final) return;
    const dur = duracaoDe(c.clipe) || 0;
    if (i === 0) {
      // O 1º trecho começa depois de "seg" segundos: o final mostra o pedaço logo antes e emenda certinho no começo
      c.inicio = dur >= 2 * seg ? umaCasa(seg + ((v * 0.7) % Math.max(0.1, dur - 2 * seg))) : 0;
    } else {
      c.inicio = dur > seg ? umaCasa((v * 1.7 + i * 1.3) % (dur - seg)) : 0;
    }
  });
  const ultima = cenas[n - 1];
  if (ultima.final && ultima.clipe) ultima.inicio = cenas[0].inicio >= seg ? umaCasa(cenas[0].inicio - seg) : cenas[0].inicio;
  const total = umaCasa(n * seg - (n - 1) * TRANS);
  return { ...extra, cenas, seg, total, sacolinha: extra.tipo === 'sacolinha' && cenas.every((c) => c.clipe) };
}

// Vídeo de AQUECIMENTO: gancho de problema + até 6 produtos diferentes (clipe quando tiver) + final igual ao começo
function planoDoVideo(v, fotos, { duracaoDe = duracaoClipe } = {}) {
  const g = GANCHOS[v % GANCHOS.length];
  const m = Math.min(CENAS_MEIO, fotos.length - 1);
  const passo = 1 + (v % Math.max(1, fotos.length - 1));
  const candidatos = [];
  for (let k = 0; candidatos.length < m + 1 && k < fotos.length * 3; k++) {
    const f = fotos[(v * 2 + k * passo) % fotos.length];
    if (!candidatos.includes(f)) candidatos.push(f);
  }
  for (const f of fotos) if (candidatos.length < m + 1 && !candidatos.includes(f)) candidatos.push(f);
  const escolha = [...new Set(abrirComOGancho(g.texto, candidatos, fotos))].slice(0, m + 1);
  const cena = (foto, texto, k, extra = {}) => {
    const clipe = foto.clipes && foto.clipes.length ? foto.clipes[(v + k) % foto.clipes.length] : null;
    return { foto, clipe, texto, ia: iaDaCena(foto, clipe), ...extra };
  };
  const cenas = [cena(escolha[0], g.texto, 0, { grande: true })];
  escolha.slice(1).forEach((f, k) => cenas.push(cena(f, f.texto, k + 1, { numero: k + 1 })));
  cenas.push({ ...cenas[0], texto: FIM[v % FIM.length], grande: false, final: true });
  return finalizar(cenas, v, duracaoDe, { tipo: 'aquecimento', gancho: g });
}

// Vídeo para a SACOLINHA: 1 produto só, todas as cenas são trechos de clipe de vídeo de verdade
function planoSacolinha(v, foto, { duracaoDe = duracaoClipe } = {}) {
  if (!foto.clipes || !foto.clipes.length) throw new Error('vídeo de sacolinha precisa de clipe de vídeo do produto');
  // Gancho que combina com o produto (árvore, mesa, casa); se nenhum combinar, vai na ordem
  const combina = GANCHOS.map((_, k) => GANCHOS[(v + k) % GANCHOS.length]).find((g) => {
    const tema = TEMAS.find(([t]) => t.test(g.texto));
    return tema && (tema[1].test(path.basename(foto.arquivo)) || tema[1].test(foto.texto));
  });
  const g = combina || GANCHOS[v % GANCHOS.length];
  const clipe = (k) => foto.clipes[(v + k) % foto.clipes.length];
  const textos = [foto.texto, ...FRASES_SACOLINHA].filter(Boolean);
  const cenas = [{ foto, clipe: clipe(0), texto: g.texto, grande: true }];
  textos.forEach((t, k) => cenas.push({ foto, clipe: clipe(k + 1), texto: t }));
  cenas.forEach((c) => (c.ia = iaDaCena(foto, c.clipe)));
  cenas.push({ ...cenas[0], texto: FIM[v % FIM.length], grande: false, final: true });
  return finalizar(cenas, v, duracaoDe, { tipo: 'sacolinha', gancho: g, produto: foto });
}

// Prepara os arquivos de cada cena: fundo com foto (foto) ou o próprio clipe, e a camada de texto
async function prepararCenas(plano, tmp, cor) {
  const bases = {};
  const prontas = [];
  for (let i = 0; i < plano.cenas.length; i++) {
    const c = plano.cenas[i];
    const png = path.join(tmp, `t${i}.png`);
    fs.writeFileSync(png, await camadaTexto(c.texto, { cor, numero: c.numero, ia: c.ia, grande: c.grande }));
    let base = null;
    if (!c.clipe) {
      if (!bases[c.foto.arquivo]) {
        bases[c.foto.arquivo] = path.join(tmp, `b${i}.jpg`);
        fs.writeFileSync(bases[c.foto.arquivo], await fundoComFoto(c.foto.arquivo));
      }
      base = bases[c.foto.arquivo];
    }
    // 1ª cena aproxima (começa em zoom 1) e a última afasta (termina em zoom 1): o fim emenda no começo
    const zoom = i === 0 ? 'entra' : c.final ? 'sai' : i % 2 ? 'sai' : 'entra';
    prontas.push({ base, clipe: c.clipe, inicio: c.inicio || 0, png, zoom });
  }
  return prontas;
}

// Junta as cenas num vídeo: foto com zoom lento ou trecho do clipe, texto parado por cima (nunca sai da área segura)
function montarVideo(cenas, destino, { seg = SEG, variacao = 0, musica = null } = {}) {
  const fps = 30;
  const d = Math.round(seg * fps);
  const args = ['-y', '-loglevel', 'error'];
  cenas.forEach((c) => {
    if (c.clipe) args.push('-ss', c.inicio.toFixed(2), '-t', (seg + 0.5).toFixed(2), '-i', c.clipe);
    else args.push('-i', c.base);
    args.push('-loop', '1', '-t', seg.toFixed(2), '-i', c.png);
  });
  if (musica) args.push('-stream_loop', '-1', '-i', musica);
  const filtros = cenas.map((c, i) => {
    const z = c.zoom === 'sai' ? `1.06-0.06*on/${d}` : `1+0.06*on/${d}`;
    const fundo = c.clipe
      ? `[${2 * i}:v]scale=${L}:${A}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${L}:${A}:(ow-iw)/2:(oh-ih)/2:color=0x${FUNDO.slice(1)},setsar=1,fps=${fps},tpad=stop_mode=clone:stop_duration=${seg},trim=duration=${seg},setpts=PTS-STARTPTS[b${i}]`
      : `[${2 * i}:v]scale=${L * 2}:${A * 2},zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${d}:s=${L}x${A}:fps=${fps},setsar=1[b${i}]`;
    return `${fundo};[${2 * i + 1}:v]format=rgba,fps=${fps}[t${i}];[b${i}][t${i}]overlay=0:0:shortest=1,format=yuv420p,trim=duration=${seg},setpts=PTS-STARTPTS,settb=1/${fps}[v${i}]`;
  });
  // Transições variadas, cada vídeo com uma ordem diferente
  const TIPOS = ['slideleft', 'smoothup', 'circleopen', 'slideright', 'fadewhite', 'wiperight'];
  let anterior = 'v0';
  const xf = [];
  for (let k = 1; k < cenas.length; k++) {
    const saida = k === cenas.length - 1 ? 'vx' : `x${k}`;
    xf.push(`[${anterior}][v${k}]xfade=transition=${TIPOS[(variacao + k) % TIPOS.length]}:duration=${TRANS}:offset=${(k * (seg - TRANS)).toFixed(2)}[${saida}]`);
    anterior = saida;
  }
  const total = cenas.length * seg - (cenas.length - 1) * TRANS;
  const video = xf.length ? `${xf.join(';')};[vx]format=yuv420p[saida]` : '[v0]format=yuv420p[saida]';
  const audio = musica ? `;[${2 * cenas.length}:a]atrim=0:${total.toFixed(2)},afade=t=in:d=0.2,afade=t=out:st=${(total - 0.4).toFixed(2)}:d=0.4,volume=0.8[som]` : '';
  args.push('-filter_complex', `${filtros.join(';')};${video}${audio}`, '-map', '[saida]');
  if (musica) args.push('-map', '[som]', '-c:a', 'aac', '-b:a', '160k');
  args.push('-t', total.toFixed(2), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-movflags', '+faststart', destino);
  execFileSync(acharFfmpeg(), args, { stdio: 'inherit' });
}

let ffmpegAchado = null;
function acharFfmpeg() {
  if (ffmpegAchado) return ffmpegAchado;
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return (ffmpegAchado = 'ffmpeg');
  } catch {}
  // winget instala aqui e o PATH só atualiza num terminal novo
  const base = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
  if (fs.existsSync(base)) {
    for (const p of fs.readdirSync(base).filter((x) => /ffmpeg/i.test(x))) {
      const achado = procurar(path.join(base, p), 'ffmpeg.exe', 4);
      if (achado) return (ffmpegAchado = achado);
    }
  }
  throw new Error('ffmpeg não encontrado. Instale com: winget install Gyan.FFmpeg');
}
function procurar(pasta, nome, fundo) {
  if (fundo < 0) return null;
  for (const e of fs.readdirSync(pasta, { withFileTypes: true })) {
    const p = path.join(pasta, e.name);
    if (e.isFile() && e.name.toLowerCase() === nome) return p;
    if (e.isDirectory()) {
      const r = procurar(p, nome, fundo - 1);
      if (r) return r;
    }
  }
  return null;
}

// A 1ª foto tem que combinar com o gancho (a dona notou "mesa da ceia" abrindo com uma flor).
// Gancho com tema conhecido: a foto do tema vai para a abertura; se não estiver no vídeo, entra no lugar da 1ª.
const TEMAS = [
  [/mesa|ceia/i, /mesa|ceia|biscoit/i],
  [/árvore|arvore/i, /bola|flor|árvore|arvore|enfeite/i],
  [/aconcheg|sala|casa|lar|apartamento/i, /almofada|sala|cortina|varanda|guirlanda|meia/i],
];
function abrirComOGancho(gancho, escolha, fotos) {
  const tema = TEMAS.find(([g]) => g.test(gancho));
  if (!tema) return escolha;
  // O nome do arquivo vale mais que a frase (ex.: "presépio ... combina com qualquer mesa" não é foto de mesa)
  const peloNome = (f) => tema[1].test(path.basename(f.arquivo));
  const pelaFrase = (f) => tema[1].test(f.texto);
  for (const combina of [peloNome, pelaFrase]) {
    if (combina(escolha[0])) return escolha;
    const dentro = escolha.find(combina);
    if (dentro) return [dentro, ...escolha.filter((f) => f !== dentro)];
    const fora = fotos.find(combina);
    if (fora) return [fora, ...escolha.slice(1).filter((f) => f !== fora)];
  }
  return escolha;
}

// Legenda do TikTok (aquecimento): curta, sem link, sem "Shopee", sem Instagram, sem sacolinha.
// Linha 2 = frase de busca (o TikTok também funciona como buscador). No máximo 5 hashtags.
const MISTURA = /shopee|xopi|link na bio|@achadinhoabessa/i;
function legendaTikTok(gancho, i, hashtags, busca) {
  const texto = [gancho + ' 🎄', busca ? busca + '.' : '', PERGUNTAS[i % PERGUNTAS.length], hashtags.slice(0, 5).join(' ')].filter(Boolean).join('\n');
  if (MISTURA.test(texto) || /sacolinha/i.test(texto)) throw new Error('legenda do TikTok misturou plataforma: ' + texto);
  return texto;
}

// Legenda do vídeo com sacolinha: é oferta, então leva #publi (regra do CONAR). No máximo 5 hashtags no total.
function legendaSacolinha(gancho, busca, produto, hashtags) {
  const tags = ['#publi', ...hashtags.filter((h) => h.toLowerCase() !== '#publi')].slice(0, 5);
  const texto = [gancho + ' 🎄', busca + '.', produto ? semEmoji(produto).replace(/[.!]*$/, '.') : '', 'Toque na sacolinha para ver o preço 🛍️', tags.join(' ')].filter(Boolean).join('\n');
  if (MISTURA.test(texto)) throw new Error('legenda do TikTok misturou plataforma: ' + texto);
  return texto;
}

async function gerar(conta, { dias = 4, porDia = 3, sacolinhaPorDia = 1, inicio, saida, montar = montarVideo, duracaoDe = duracaoClipe, log = console.log } = {}) {
  const config = maquina.lerConfig(path.join(RAIZ, 'contas', conta));
  const cor = config.corArte || '#b0294a';
  const hashtags = (config.hashtagsTikTok || []).filter((h) => !/shopee/i.test(h));
  const fotos = juntarFotos(conta);
  // Música de Natal original (feita com IA, sem direito autoral de terceiros) em contas/<conta>/musicas
  const pastaMusicas = path.join(RAIZ, 'contas', conta, 'musicas');
  const musicas = fs.existsSync(pastaMusicas) ? fs.readdirSync(pastaMusicas).filter((f) => /.(m4a|mp3|wav)$/i.test(f)).sort().map((f) => path.join(pastaMusicas, f)) : [];
  if (fotos.length < 2) throw new Error('Preciso de pelo menos 2 fotos (coloque em Projeto zero/aquecimento/fotos-dos-produtos).');
  const comClipe = fotos.filter((f) => f.clipes.length);
  const pastaSaida = saida || path.join(RAIZ, 'POSTAR-HOJE', 'tiktok-aquecimento');
  const comeco = inicio ? new Date(inicio + 'T12:00:00') : new Date();
  const total = dias * porDia;
  const agenda = [];
  for (let v = 0; v < total; v++) {
    const dia = new Date(comeco);
    dia.setDate(dia.getDate() + Math.floor(v / porDia));
    const data = dia.toLocaleDateString('sv-SE');
    const vaga = v % porDia;
    const hora = HORAS[vaga];
    const pasta = path.join(pastaSaida, data);
    fs.mkdirSync(pasta, { recursive: true });
    // Com clipe de vídeo de produto: os primeiros vídeos do dia são para a sacolinha (1 produto por vídeo, em rodízio)
    const plano =
      comClipe.length && vaga < sacolinhaPorDia
        ? planoSacolinha(v, comClipe[(Math.floor(v / porDia) * sacolinhaPorDia + vaga) % comClipe.length], { duracaoDe })
        : planoDoVideo(v, fotos, { duracaoDe });
    const tmp = fs.mkdtempSync(path.join(pasta, '.tmp-'));
    try {
      const nome = `${hora}-video-${plano.tipo}`;
      montar(await prepararCenas(plano, tmp, cor), path.join(pasta, nome + '.mp4'), { seg: plano.seg, variacao: v, musica: musicas.length ? musicas[v % musicas.length] : null });
      const ia = plano.cenas.some((c) => c.ia);
      if (plano.tipo === 'aquecimento') {
        // As fotos verticais também ficam, para postar no modo "fotos" do TikTok se ela preferir (aquecimento, sem sacolinha)
        let k = 0;
        for (const c of plano.cenas.slice(1, -1)) if (!c.clipe) await quadro(c.foto, c.texto, path.join(pasta, `${hora}-foto${++k}.jpg`), { cor, numero: c.numero, ia: c.ia });
      }
      const legenda = plano.tipo === 'sacolinha' ? legendaSacolinha(plano.gancho.texto, plano.gancho.busca, plano.produto.texto, hashtags) : legendaTikTok(plano.gancho.texto, v, hashtags, plano.gancho.busca);
      fs.writeFileSync(path.join(pasta, `${hora}-legenda.txt`), legenda + (ia ? '\n\n(Ao postar: ligar "Conteúdo gerado por IA")' : '') + '\n');
      const rotulo = plano.tipo === 'sacolinha' ? 'COM SACOLINHA (clipe de vídeo, 1 produto)' : 'AQUECIMENTO (sem sacolinha)';
      agenda.push(`${data} ${hora} [${rotulo}] ${plano.total}s: ${plano.gancho.texto}${plano.produto ? ' -> ' + (plano.produto.texto || path.basename(plano.produto.arquivo)) : ''}${ia ? ' (IA)' : ''}`);
      log(`  pronto: ${data}/${nome}.mp4`);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
  fs.writeFileSync(
    path.join(pastaSaida, 'LEIA.txt'),
    [
      'VÍDEOS DO TIKTOK @shopabessa',
      '- "-video-aquecimento.mp4": AQUECIMENTO, poste SEM sacolinha (são fotos com movimento; o TikTok Shop restringe slideshow com produto).',
      '- "-video-sacolinha.mp4": feito só com clipe de vídeo de verdade de 1 produto. PODE ir com a sacolinha do produto (a legenda já tem #publi).',
      comClipe.length ? '' : '(Ainda não há clipe .mp4 de produto: por isso todos são de aquecimento. Ponha o clipe com o mesmo nome da foto, ex.: contas/lusia/fotos/presepio-mdf.mp4.)',
      'Em cada pasta do dia: o vídeo, a legenda e as fotos. Escolha um som em alta no TikTok ao postar.',
      '',
      ...agenda,
    ].join('\n') + '\n'
  );
  log(`TikTok: ${agenda.length} vídeo(s) em ${pastaSaida}`);
  return agenda;
}

if (require.main === module) {
  const a = process.argv.slice(2);
  const val = (n, padrao) => (a.includes(n) ? a[a.indexOf(n) + 1] : padrao);
  const conta = a[0] && !a[0].startsWith('--') ? a[0] : 'lusia';
  gerar(conta, {
    dias: Number(val('--dias', 4)),
    porDia: Number(val('--por-dia', 3)),
    sacolinhaPorDia: Number(val('--sacolinha-por-dia', 1)),
    inicio: val('--inicio'),
    saida: val('--saida') && path.resolve(val('--saida')),
  }).catch((e) => {
    console.error('ERRO: ' + e.message);
    process.exitCode = 1;
  });
}

module.exports = { gerar, juntarFotos, legendaTikTok, legendaSacolinha, quadro, camadaTexto, abrirComOGancho, planoDoVideo, planoSacolinha, prepararCenas, montarVideo, acharFfmpeg, GANCHOS, ZONA, FUNDO, DURACAO };
