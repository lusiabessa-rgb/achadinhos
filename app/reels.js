// FILA DE REELS DO INSTAGRAM (pedido de 27/10: "tudo que você postar no TikTok, poste também no @achadinhoabessa")
// Cada Reel sai no DIA e HORA marcados (os mesmos do TikTok), não "o próximo da fila".
//   contas/<conta>/fila-reels.json  -> [{ id: "2026-10-27-18h", data, hora, video: "reels/....mp4", legenda, origem }]
//   publico/<conta>/reels/*.mp4     -> os vídeos, servidos pelo GitHub Pages (o Instagram baixa de lá)
// Regras:
// - No Instagram NÃO há produto anexado: a legenda nunca promete link, carrinho ou sacolinha, e não leva #publi.
// - Sempre com a linha "✨ Conteúdo gerado por IA" e no máximo 5 hashtags.
// - Nada atrasado mais de 1 dia: se passou, avisa no Telegram em vez de postar velho.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const UM_DIA = 24 * 3600e3;
const ROTULO_IA = '✨ Conteúdo gerado por IA';
const CTA_SALVA = 'Salva pra não esquecer 💾';
const CTA_PERGUNTA = 'E aí, você usaria na sua casa? Me conta aqui 💬';
const MAX_SEGUNDOS = 90;
const MAX_BYTES = 100 * 1024 * 1024;

// ---------- Legenda ----------
const CTA_TIKTOK = /(?:clica|clique|toca|toque)\s+no\s+(?:link|carrinho)|link\s+no\s+carrinho/gi;
const PALAVRA_DE_LINK = /\b(?:links?|carrinho|sacolinha)\b/i;
const TAG = /#[\p{L}\p{N}_]+/gu;

// Legenda do TikTok -> legenda do Instagram (sem link, sem carrinho, sem #publi, com rótulo de IA)
function adaptarLegenda(textoTikTok) {
  let t = String(textoTikTok || '').replace(/\r/g, '').replace(/^﻿/, '');
  const tags = [...new Set((t.match(TAG) || []).map((h) => h.toLowerCase()))]
    .filter((h) => !/^#(publi|publicidade|tiktokshop|tiktok\w*)$/.test(h) && !PALAVRA_DE_LINK.test(h.slice(1)))
    .slice(0, 5);
  t = t.replace(TAG, ' ').replace(CTA_TIKTOK, ' ').replace(/🛒/g, ' ');
  // Frase que ainda fale de link/carrinho/sacolinha sai inteira (nada de frase quebrada)
  const linhas = t
    .split('\n')
    .map((l) =>
      (l.match(/[^.!?]+[.!?]*\s*/g) || [])
        .filter((f) => !PALAVRA_DE_LINK.test(f))
        .join(' ')
        .replace(/\s+/g, ' ')
        .replace(/\s+([.!?,:;])/g, '$1')
        .trim()
    )
    .filter((l) => l && /[\p{L}\p{N}]/u.test(l));
  const cta = /\bsalv[ae]\b/i.test(linhas.join(' ')) ? CTA_PERGUNTA : CTA_SALVA;
  return [linhas.join('\n'), cta, tags.join(' '), ROTULO_IA].filter(Boolean).join('\n\n');
}

// TRAVA: o que a legenda de um Reel nunca pode ter
function problemasLegenda(legenda) {
  const t = String(legenda || '');
  const p = [];
  if (!t.trim()) p.push('legenda vazia');
  if (/\blinks?\b/i.test(t)) p.push('tem "link" (no Instagram não há produto anexado)');
  if (/carrinho|🛒/i.test(t)) p.push('tem "carrinho" (no Instagram não há produto anexado)');
  if (/sacolinha/i.test(t)) p.push('tem "sacolinha" (palavra proibida)');
  if (/#publi\b/i.test(t)) p.push('tem #publi (sem produto anexado no Instagram)');
  if (/tiktok/i.test(t)) p.push('fala de TikTok');
  const n = (t.match(TAG) || []).length;
  if (n > 5) p.push(`tem ${n} hashtags (máximo 5)`);
  if (!t.includes(ROTULO_IA)) p.push(`falta a linha "${ROTULO_IA}"`);
  if (t.length > 2200) p.push('legenda com mais de 2200 letras');
  return p;
}

// ---------- Vídeo ----------
// Confere com o ffprobe se o Instagram aceita: H.264 + AAC, 9:16, 3 a 90 s, menos de 100 MB
function examinarVideo(arquivo) {
  if (!fs.existsSync(arquivo)) return { problemas: ['vídeo não encontrado: ' + arquivo], converter: false };
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height', '-show_entries', 'format=duration', '-of', 'json', arquivo], { encoding: 'utf8' });
  if (r.status !== 0) return { problemas: ['não consegui ler o vídeo com o ffprobe (ele está instalado?)'], converter: false };
  const j = JSON.parse(r.stdout || '{}');
  const v = (j.streams || []).find((s) => s.codec_type === 'video') || {};
  const a = (j.streams || []).find((s) => s.codec_type === 'audio');
  const dur = Number((j.format || {}).duration) || 0;
  const tam = fs.statSync(arquivo).size;
  const problemas = [];
  if (dur > MAX_SEGUNDOS) problemas.push(`vídeo com ${dur.toFixed(1)} s (máximo ${MAX_SEGUNDOS}; não corto nada sozinha)`);
  if (dur < 3) problemas.push(`vídeo com ${dur.toFixed(1)} s (mínimo 3)`);
  // Conversão resolve codec e proporção (com fundo, nada cortado); tamanho também cai na conversão
  const converter = v.codec_name !== 'h264' || (a && a.codec_name !== 'aac') || !v.width || Math.abs(v.width / v.height - 9 / 16) > 0.01 || tam >= MAX_BYTES;
  return { problemas, converter, duracao: dur, largura: v.width, altura: v.height, bytes: tam };
}

// Copia o vídeo para o site. Se já estiver no padrão, só reorganiza (sem perder qualidade, "faststart").
// Se não, converte para H.264/AAC 1080x1920 com fundo preto (nada cortado).
function prepararVideo(origem, destino) {
  const info = examinarVideo(origem);
  if (info.problemas.length) throw new Error(info.problemas.join('; '));
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const args = info.converter
    ? ['-y', '-v', 'error', '-i', origem, '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1', '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-crf', '20', '-maxrate', '20M', '-bufsize', '20M', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-movflags', '+faststart', destino]
    : ['-y', '-v', 'error', '-i', origem, '-map', '0', '-c', 'copy', '-movflags', '+faststart', destino];
  const r = spawnSync('ffmpeg', args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('o ffmpeg não conseguiu preparar o vídeo: ' + (r.stderr || '').slice(0, 300));
  const depois = examinarVideo(destino);
  if (depois.problemas.length || depois.converter) throw new Error('o vídeo preparado continua fora do padrão do Instagram');
  return { convertido: info.converter, ...depois };
}

// ---------- Fila ----------
const arqFila = (conta, raiz = RAIZ) => path.join(raiz, 'contas', conta, 'fila-reels.json');

function lerFila(conta, raiz = RAIZ) {
  try {
    return JSON.parse(fs.readFileSync(arqFila(conta, raiz), 'utf8')) || [];
  } catch {
    return [];
  }
}

function salvarFila(conta, fila, raiz = RAIZ) {
  const arq = arqFila(conta, raiz);
  fila.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  fs.writeFileSync(arq + '.tmp', JSON.stringify(fila, null, 2));
  fs.renameSync(arq + '.tmp', arq);
}

// Momento de um item (Brasília, UTC-3; o Brasil não tem horário de verão desde 2019)
const momento = (item) => new Date(`${item.data}T${String(item.hora).padStart(2, '0')}:00:00-03:00`);
const idDe = (data, hora) => `${data}-${String(hora).padStart(2, '0')}h`;

// "27/10", "2026-10-27" -> "2026-10-27";  "18", "18h", "18:00" -> 18
function lerData(s, agora = new Date()) {
  const t = String(s || '').trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return t;
  m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (m) return `${m[3] || agora.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 4)}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  throw new Error(`data "${s}" não entendida (use AAAA-MM-DD ou DD/MM)`);
}
function lerHora(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})(?:h|:00|h00)?$/i);
  if (!m || Number(m[1]) > 23) throw new Error(`hora "${s}" não entendida (use 18 ou 18h)`);
  return Number(m[1]);
}

// Confere um item antes de entrar na fila (e de novo antes de publicar)
function problemasItem(item, raiz = RAIZ, conta) {
  const p = problemasLegenda(item.legenda).map((x) => 'legenda: ' + x);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.data || '') || isNaN(momento(item))) p.push('data inválida');
  if (!(Number.isInteger(item.hora) && item.hora >= 0 && item.hora <= 23)) p.push('hora inválida');
  if (!/^reels\/[a-z0-9-]+\.mp4$/.test(item.video || '')) p.push('nome do vídeo inválido');
  if (conta && !fs.existsSync(path.join(raiz, 'publico', conta, item.video || ''))) p.push('vídeo não está em publico/' + conta + '/' + item.video);
  return p;
}

// Põe um item pronto na fila (TRAVA: legenda com link/carrinho/sacolinha/#publi não entra)
function adicionarNaFila(conta, item, { raiz = RAIZ, trocar = false } = {}) {
  const prob = problemasItem(item, raiz, conta);
  if (prob.length) throw new Error(`Reel ${item.id} NÃO entrou na fila: ${prob.join('; ')}`);
  let fila = lerFila(conta, raiz);
  if (fila.some((x) => x.id === item.id)) {
    if (!trocar) throw new Error(`já existe Reel em ${item.data} às ${item.hora}h (use --trocar para substituir)`);
    fila = fila.filter((x) => x.id !== item.id);
  }
  fila.push(item);
  salvarFila(conta, fila, raiz);
  return item;
}

// Comando único: vídeo + data + hora + legenda do TikTok (arquivo .txt ou o próprio texto)
function enfileirar(conta, video, data, hora, legendaTikTok, { raiz = RAIZ, agora = new Date(), trocar = false } = {}) {
  const d = lerData(data, agora);
  const h = lerHora(hora);
  const item0 = { data: d, hora: h };
  if (agora - momento(item0) > UM_DIA) throw new Error(`${d} às ${h}h já passou faz mais de 1 dia: não entra na fila`);
  const texto = legendaTikTok && fs.existsSync(legendaTikTok) ? fs.readFileSync(legendaTikTok, 'utf8') : String(legendaTikTok || '');
  const legenda = adaptarLegenda(texto);
  const prob = problemasLegenda(legenda);
  if (prob.length) throw new Error('legenda adaptada com problema: ' + prob.join('; '));
  const id = idDe(d, h);
  if (!trocar && lerFila(conta, raiz).some((x) => x.id === id)) throw new Error(`já existe Reel em ${d} às ${h}h (use --trocar para substituir)`);
  const slug = path.basename(video, path.extname(video)).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  const rel = `reels/${id}-${slug}.mp4`;
  const destino = path.join(raiz, 'publico', conta, rel);
  const info = prepararVideo(video, destino);
  return { ...adicionarNaFila(conta, { id, data: d, hora: h, video: rel, legenda, origem: path.basename(video) }, { raiz, trocar }), info };
}

// Na rodada: quais saem agora (hora chegou, até 1 dia de atraso) e quais passaram do prazo (só avisar)
function devidos(fila, feitos, agora = new Date()) {
  const prontos = [];
  const atrasados = [];
  for (const it of fila) {
    if (!it || !it.id || feitos[`reel:${it.id}`]) continue;
    const m = momento(it);
    if (isNaN(m) || m > agora) continue;
    if (agora - m <= UM_DIA) prontos.push(it);
    else if (!feitos[`aviso:reel:${it.id}`]) atrasados.push(it);
  }
  return { prontos, atrasados };
}

// Apaga do site (e do repositório) os vídeos de dias passados que já saíram ou que passaram do prazo
function limparVelhos(conta, fila, feitos, { raiz = RAIZ, agora = new Date() } = {}) {
  const hoje = agora.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const apagados = [];
  for (const it of fila) {
    if (!it || it.data >= hoje) continue;
    if (!feitos[`reel:${it.id}`] && !(agora - momento(it) > UM_DIA)) continue;
    const arq = path.join(raiz, 'publico', conta, it.video || '');
    if (it.video && fs.existsSync(arq)) {
      fs.rmSync(arq);
      apagados.push(it.video);
    }
  }
  return apagados;
}

module.exports = { adaptarLegenda, problemasLegenda, examinarVideo, prepararVideo, lerFila, salvarFila, adicionarNaFila, enfileirar, devidos, limparVelhos, problemasItem, momento, lerData, lerHora, ROTULO_IA, CTA_SALVA, CTA_PERGUNTA };
