// VÍDEOS DE AQUECIMENTO DO TIKTOK (sem link, sem sacolinha, sem venda).
// Uso:  node app/aquecimento-tiktok.js <conta> [--dias 4] [--por-dia 3] [--inicio AAAA-MM-DD]
// Pega as fotos (primeiro as da dona, em Projeto zero/aquecimento/fotos-dos-produtos; depois as da máquina),
// faz vídeos verticais 1080x1920 com movimento e texto, cada um com gancho, ordem e fotos diferentes,
// e a legenda do TikTok (nunca cita a Shopee nem o Instagram).
// Saída: POSTAR-HOJE/tiktok-aquecimento/<data>/<hora>-video.mp4 + <hora>-legenda.txt + LEIA.txt
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const sharp = require('sharp');
const maquina = require('./maquina');
const { quebrar } = require('./conteudo');

const RAIZ = path.join(__dirname, '..');
const L = 1080;
const A = 1920;
const SEG = 3; // segundos por foto
const FONTE = "'Segoe UI', 'DejaVu Sans', 'Liberation Sans', Arial, sans-serif";
const HORAS = ['12h', '18h', '20h', '21h', '15h'];
const xml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const semEmoji = (s) => String(s).replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').replace(/\s+/g, ' ').trim();
const IMG = /\.(jpe?g|png|webp)$/i;

// Ganchos de aquecimento: inspiração e dica, nunca venda nem "link"
const GANCHOS = [
  'Ideias para deixar a casa com cara de Natal',
  'Decoração de Natal gastando pouco',
  'Salva esse vídeo para montar a sua árvore',
  'O Natal deste ano lá em casa vai ser assim',
  'Qual dessas você usaria na sua casa?',
  'Tendências de decoração para o Natal 2026',
  'Pequenos detalhes que mudam a casa no Natal',
  'Inspiração para a mesa da ceia',
  'Comecei a decorar e não consigo parar',
  'Natal aconchegante sem gastar muito',
  'Se a sua casa ainda não tem clima de Natal, vê isso',
  'Escolhe uma: qual é a sua favorita?',
];
const PERGUNTAS = [
  'Qual você escolheria? Comenta aqui 👇',
  'Você já começou a decorar? 🎄',
  'Me conta nos comentários: 1, 2 ou 3?',
  'Salva para não esquecer ✨',
  'Quer mais ideias assim? Me segue 🎄',
];
const FIM = ['Segue para mais ideias de Natal', 'Salva e segue para a parte 2', 'Comenta qual foi a sua favorita'];

// Lê as fotos disponíveis: { arquivo, texto, ia }
function juntarFotos(conta) {
  const pastaConta = path.join(RAIZ, 'contas', conta);
  const fotos = [];
  const add = (pasta, ia, textoDe) => {
    if (!fs.existsSync(pasta)) return;
    for (const f of fs.readdirSync(pasta).filter((x) => IMG.test(x)).sort()) fotos.push({ arquivo: path.join(pasta, f), texto: textoDe(f), ia });
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
  add(path.join(pastaConta, 'fotos'), false, (f) => frases[f] || bonito(f));
  // 3) Imagens de conteúdo feitas com IA (título = 1ª linha do .txt)
  const pastaConteudo = path.join(pastaConta, 'conteudo');
  add(pastaConteudo, true, (f) => {
    const txt = path.join(pastaConteudo, f.replace(IMG, '.txt'));
    return fs.existsSync(txt) ? fs.readFileSync(txt, 'utf8').replace(/^﻿/, '').split(/\r?\n/)[0].trim() : bonito(f);
  });
  return fotos;
}

// Um quadro 1080x1920: fundo desfocado, foto inteira no meio, texto em cima e rótulo de IA
async function quadro(foto, titulo, destino, { cor, numero } = {}) {
  const fundo = await sharp(foto.arquivo).resize(L, A, { fit: 'cover' }).blur(40).modulate({ brightness: 0.7 }).toBuffer();
  const meio = await sharp(foto.arquivo).resize(L - 80, 1250, { fit: 'inside' }).toBuffer();
  const m = await sharp(meio).metadata();
  const linhas = titulo ? quebrar(semEmoji(titulo), 22, 3) : [];
  const svg = Buffer.from(`<svg width="${L}" height="${A}" xmlns="http://www.w3.org/2000/svg">
  ${linhas.length ? `<rect x="50" y="150" rx="28" width="${L - 100}" height="${50 + linhas.length * 74}" fill="${cor}" opacity="0.92"/>` : ''}
  ${linhas.map((l, i) => `<text x="${L / 2}" y="${222 + i * 74}" text-anchor="middle" font-family="${FONTE}" font-size="60" font-weight="800" fill="#fff">${xml(l)}</text>`).join('')}
  ${numero ? `<circle cx="110" cy="${A - 330}" r="56" fill="${cor}"/><text x="110" y="${A - 310}" text-anchor="middle" font-family="${FONTE}" font-size="60" font-weight="800" fill="#fff">${numero}</text>` : ''}
  ${foto.ia ? `<text x="${L / 2}" y="${A - 230}" text-anchor="middle" font-family="${FONTE}" font-size="30" fill="#fff" opacity="0.9">Conteúdo gerado por IA</text>` : ''}
</svg>`);
  await sharp(fundo)
    .composite([
      { input: meio, left: Math.round((L - m.width) / 2), top: Math.round((A - m.height) / 2) + 60 },
      { input: svg, left: 0, top: 0 },
    ])
    .jpeg({ quality: 90 })
    .toFile(destino);
  return destino;
}

// Junta os quadros num vídeo com zoom lento (direção muda a cada vídeo: variação)
function montarVideo(quadros, destino, variacao) {
  const fps = 30;
  const d = SEG * fps;
  const args = ['-y', '-loglevel', 'error'];
  quadros.forEach((q) => args.push('-i', q)); // 1 quadro por foto: o zoompan cria os quadros de cada trecho
  const zoom = variacao % 2 ? "if(eq(on,0),1.12,max(zoom-0.0013,1))" : 'min(zoom+0.0013,1.12)';
  const filtros = quadros
    .map((_, i) => `[${i}:v]scale=${L * 2}:${A * 2},zoompan=z='${zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${d}:s=${L}x${A}:fps=${fps},setsar=1[v${i}]`)
    .join(';');
  const concat = quadros.map((_, i) => `[v${i}]`).join('') + `concat=n=${quadros.length}:v=1:a=0,format=yuv420p[saida]`;
  // Vídeo sem som: a dona escolhe um som em alta no próprio TikTok (ajuda a entrega)
  args.push('-filter_complex', `${filtros};${concat}`, '-map', '[saida]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-movflags', '+faststart', destino);
  execFileSync(acharFfmpeg(), args, { stdio: 'inherit' });
}

function acharFfmpeg() {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return 'ffmpeg';
  } catch {}
  // winget instala aqui e o PATH só atualiza num terminal novo
  const base = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
  if (fs.existsSync(base)) {
    for (const p of fs.readdirSync(base).filter((x) => /ffmpeg/i.test(x))) {
      const achado = procurar(path.join(base, p), 'ffmpeg.exe', 4);
      if (achado) return achado;
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

// Legenda do TikTok: curta, sem link, sem "Shopee", sem Instagram
function legendaTikTok(gancho, i, hashtags) {
  const texto = [gancho + ' 🎄', PERGUNTAS[i % PERGUNTAS.length], hashtags.join(' ')].join('\n');
  if (/shopee|xopi|link na bio|@achadinhoabessa|sacolinha/i.test(texto)) throw new Error('legenda do TikTok misturou plataforma: ' + texto);
  return texto;
}

async function gerar(conta, { dias = 4, porDia = 3, inicio, saida, montar = montarVideo, log = console.log } = {}) {
  const config = maquina.lerConfig(path.join(RAIZ, 'contas', conta));
  const cor = config.corArte || '#b0294a';
  const hashtags = (config.hashtagsTikTok || []).filter((h) => !/shopee/i.test(h));
  const fotos = juntarFotos(conta);
  if (fotos.length < 2) throw new Error('Preciso de pelo menos 2 fotos (coloque em Projeto zero/aquecimento/fotos-dos-produtos).');
  const pastaSaida = saida || path.join(RAIZ, 'POSTAR-HOJE', 'tiktok-aquecimento');
  const comeco = inicio ? new Date(inicio + 'T12:00:00') : new Date();
  const total = dias * porDia;
  const agenda = [];
  for (let v = 0; v < total; v++) {
    const dia = new Date(comeco);
    dia.setDate(dia.getDate() + Math.floor(v / porDia));
    const data = dia.toLocaleDateString('sv-SE');
    const hora = HORAS[v % porDia];
    const pasta = path.join(pastaSaida, data);
    fs.mkdirSync(pasta, { recursive: true });
    // Variação: 3 fotos diferentes por vídeo, começando num ponto diferente da lista e pulando de jeitos diferentes
    const passo = 1 + (v % Math.max(1, fotos.length - 1));
    const escolha = [0, 1, 2].map((k) => fotos[(v * 2 + k * passo) % fotos.length]).filter((f, k, arr) => arr.indexOf(f) === k);
    const gancho = GANCHOS[v % GANCHOS.length];
    const tmp = fs.mkdtempSync(path.join(pasta, '.tmp-'));
    try {
      const quadros = [await quadro(escolha[0], gancho, path.join(tmp, 'q0.jpg'), { cor })];
      for (let k = 0; k < escolha.length; k++) {
        quadros.push(await quadro(escolha[k], escolha[k].texto, path.join(tmp, `q${k + 1}.jpg`), { cor, numero: escolha.length > 1 ? k + 1 : 0 }));
      }
      quadros.push(await quadro(escolha[escolha.length - 1], FIM[v % FIM.length], path.join(tmp, 'fim.jpg'), { cor }));
      const nome = `${hora}-video`;
      montar(quadros, path.join(pasta, nome + '.mp4'), v);
      // As fotos verticais também ficam, para postar no modo "fotos" do TikTok se ela preferir
      quadros.slice(1, -1).forEach((q, k) => fs.copyFileSync(q, path.join(pasta, `${hora}-foto${k + 1}.jpg`)));
      const ia = escolha.some((f) => f.ia);
      fs.writeFileSync(path.join(pasta, `${hora}-legenda.txt`), legendaTikTok(gancho, v, hashtags) + (ia ? '\n\n(Ao postar: ligar "Conteúdo gerado por IA")' : '') + '\n');
      agenda.push(`${data} ${hora}: ${gancho}${ia ? ' (IA)' : ''}`);
      log(`  pronto: ${data}/${nome}.mp4`);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
  fs.writeFileSync(
    path.join(pastaSaida, 'LEIA.txt'),
    ['AQUECIMENTO DO TIKTOK (sem link, sem sacolinha)', 'Em cada pasta do dia: o vídeo, a legenda e as fotos. Escolha um som em alta no TikTok ao postar.', '', ...agenda].join('\n') + '\n'
  );
  log(`TikTok: ${agenda.length} vídeo(s) em ${pastaSaida}`);
  return agenda;
}

if (require.main === module) {
  const a = process.argv.slice(2);
  const val = (n, padrao) => (a.includes(n) ? a[a.indexOf(n) + 1] : padrao);
  const conta = a[0] && !a[0].startsWith('--') ? a[0] : 'lusia';
  gerar(conta, { dias: Number(val('--dias', 4)), porDia: Number(val('--por-dia', 3)), inicio: val('--inicio') }).catch((e) => {
    console.error('ERRO: ' + e.message);
    process.exitCode = 1;
  });
}

module.exports = { gerar, juntarFotos, legendaTikTok };
