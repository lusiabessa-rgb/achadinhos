// VÍDEOS DE AQUECIMENTO DO TIKTOK (sem link, sem sacolinha, sem venda).
// Uso:  node app/aquecimento-tiktok.js <conta> [--dias 4] [--por-dia 3] [--inicio AAAA-MM-DD] [--saida contas/lusia/tiktok-fila]
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
const SEG = 2.5; // segundos por foto (ritmo mais animado)
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
  // A mesma foto pode estar em duas pastas (ex.: foto de produto copiada para a fila do Instagram):
  // entra uma vez só e fica com a marcação da primeira pasta (foto real não leva rótulo de IA)
  const jaTem = new Set();
  // contas/<conta>/nao-usar-em-video.txt: palavras; foto com essa palavra no nome fica de fora (ex.: foto cortada)
  const arqFora = path.join(pastaConta, 'nao-usar-em-video.txt');
  const fora = fs.existsSync(arqFora) ? fs.readFileSync(arqFora, 'utf8').split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter((l) => l && !l.startsWith('#')) : [];
  const add = (pasta, ia, textoDe, filtro = () => true) => {
    if (!fs.existsSync(pasta)) return;
    for (const f of fs.readdirSync(pasta).filter((x) => IMG.test(x) && filtro(x)).sort()) {
      if (fora.some((w) => f.toLowerCase().includes(w))) continue;
      const arquivo = path.join(pasta, f);
      const marca = fs.statSync(arquivo).size;
      if (jaTem.has(marca)) continue;
      jaTem.add(marca);
      fotos.push({ arquivo, texto: textoDe(f), ia: typeof ia === 'function' ? ia(f) : ia });
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

// Um quadro 1080x1920: fundo liso claro (nada desfocado: a dona pediu em 17/10), foto inteira, nítida e centralizada, texto em cima e rótulo de IA
async function quadro(foto, titulo, destino, { cor, numero } = {}) {
  const fundo = await sharp({ create: { width: L, height: A, channels: 3, background: '#f7f0ea' } }).png().toBuffer();
  const meio = await sharp(foto.arquivo).resize(L - 80, 1250, { fit: 'inside' }).toBuffer();
  const m = await sharp(meio).metadata();
  const linhas = titulo ? quebrar(semEmoji(titulo), 22, 3) : [];
  const svg = Buffer.from(`<svg width="${L}" height="${A}" xmlns="http://www.w3.org/2000/svg">
  ${linhas.length ? `<rect x="50" y="150" rx="28" width="${L - 100}" height="${50 + linhas.length * 74}" fill="${cor}" opacity="0.92"/>` : ''}
  ${linhas.map((l, i) => `<text x="${L / 2}" y="${222 + i * 74}" text-anchor="middle" font-family="${FONTE}" font-size="60" font-weight="800" fill="#fff">${xml(l)}</text>`).join('')}
  ${numero ? `<circle cx="110" cy="${A - 330}" r="56" fill="${cor}"/><text x="110" y="${A - 310}" text-anchor="middle" font-family="${FONTE}" font-size="60" font-weight="800" fill="#fff">${numero}</text>` : ''}
  ${foto.ia ? `<text x="${L / 2}" y="${A - 230}" text-anchor="middle" font-family="${FONTE}" font-size="30" fill="#6b5a52">Conteúdo gerado por IA</text>` : ''}
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
function montarVideo(quadros, destino, variacao, musica) {
  const fps = 30;
  const d = SEG * fps;
  const T = 0.4; // transição entre as fotos (deixa o carrossel mais alegre: pedido da dona em 17/10)
  const args = ['-y', '-loglevel', 'error'];
  quadros.forEach((q) => args.push('-i', q)); // 1 quadro por foto: o zoompan cria os quadros de cada trecho
  if (musica) args.push('-stream_loop', '-1', '-i', musica);
  const zoom = variacao % 2 ? "if(eq(on,0),1.12,max(zoom-0.0013,1))" : 'min(zoom+0.0013,1.12)';
  const filtros = quadros
    .map((_, i) => `[${i}:v]scale=${L * 2}:${A * 2},zoompan=z='${zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${d}:s=${L}x${A}:fps=${fps},setsar=1[v${i}]`)
    .join(';');
  // Transições variadas (deslizar, abrir, círculo), cada vídeo com uma ordem diferente
  const TIPOS = ['slideleft', 'smoothup', 'circleopen', 'slideright', 'fadewhite', 'wiperight'];
  let anterior = 'v0';
  const xf = [];
  for (let k = 1; k < quadros.length; k++) {
    const saida = k === quadros.length - 1 ? 'vx' : `x${k}`;
    xf.push(`[${anterior}][v${k}]xfade=transition=${TIPOS[(variacao + k) % TIPOS.length]}:duration=${T}:offset=${(k * (SEG - T)).toFixed(2)}[${saida}]`);
    anterior = saida;
  }
  const total = quadros.length * SEG - (quadros.length - 1) * T;
  const video = xf.length ? `${xf.join(';')};[vx]format=yuv420p[saida]` : '[v0]format=yuv420p[saida]';
  const audio = musica ? `;[${quadros.length}:a]atrim=0:${total.toFixed(2)},afade=t=in:d=0.5,afade=t=out:st=${(total - 1.2).toFixed(2)}:d=1.2,volume=0.8[som]` : '';
  args.push('-filter_complex', `${filtros};${video}${audio}`, '-map', '[saida]');
  if (musica) args.push('-map', '[som]', '-c:a', 'aac', '-b:a', '160k');
  args.push('-t', total.toFixed(2), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-movflags', '+faststart', destino);
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

// A 1ª foto tem que combinar com o gancho (a dona notou "mesa da ceia" abrindo com uma flor).
// Gancho com tema conhecido: a foto do tema vai para a abertura; se não estiver no vídeo, entra no lugar da 1ª.
const TEMAS = [
  [/mesa|ceia/i, /mesa|ceia|biscoit/i],
  [/árvore|arvore/i, /bola|flor|árvore|arvore|enfeite/i],
  [/aconcheg|sala|casa|lar/i, /almofada|sala|cortina|varanda|guirlanda|meia/i],
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
  // Música de Natal original (feita com IA, sem direito autoral de terceiros) em contas/<conta>/musicas
  const pastaMusicas = path.join(RAIZ, 'contas', conta, 'musicas');
  const musicas = fs.existsSync(pastaMusicas) ? fs.readdirSync(pastaMusicas).filter((f) => /.(m4a|mp3|wav)$/i.test(f)).sort().map((f) => path.join(pastaMusicas, f)) : [];
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
    const gancho = GANCHOS[v % GANCHOS.length];
    const escolha = abrirComOGancho(gancho, [0, 1, 2].map((k) => fotos[(v * 2 + k * passo) % fotos.length]).filter((f, k, arr) => arr.indexOf(f) === k), fotos);
    const tmp = fs.mkdtempSync(path.join(pasta, '.tmp-'));
    try {
      const quadros = [await quadro(escolha[0], gancho, path.join(tmp, 'q0.jpg'), { cor })];
      for (let k = 0; k < escolha.length; k++) {
        quadros.push(await quadro(escolha[k], escolha[k].texto, path.join(tmp, `q${k + 1}.jpg`), { cor, numero: escolha.length > 1 ? k + 1 : 0 }));
      }
      quadros.push(await quadro(escolha[escolha.length - 1], FIM[v % FIM.length], path.join(tmp, 'fim.jpg'), { cor }));
      const nome = `${hora}-video`;
      montar(quadros, path.join(pasta, nome + '.mp4'), v, musicas.length ? musicas[v % musicas.length] : null);
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
  gerar(conta, { dias: Number(val('--dias', 4)), porDia: Number(val('--por-dia', 3)), inicio: val('--inicio'), saida: val('--saida') && path.resolve(val('--saida')) }).catch((e) => {
    console.error('ERRO: ' + e.message);
    process.exitCode = 1;
  });
}

module.exports = { gerar, juntarFotos, legendaTikTok, quadro, abrirComOGancho };
