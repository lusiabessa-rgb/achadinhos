// CANAL OU GRUPO DO TELEGRAM "Achadinhos da Abessa" (pedido de 28/10; a dona criou um GRUPO, o app aceita os dois)
// A cada rodada, publica no canal o MESMO vídeo da fila de Reels (contas/<conta>/fila-reels.json)
// cuja data e hora chegaram (mesma regra do reels.js: nunca adiantado, até 1 dia de atraso).
// Uso:
//   node app/telegram-canal.js <conta>              -> publica o que a hora chegou
//   node app/telegram-canal.js <conta> --simular    -> só mostra o que postaria (não envia)
//   node app/telegram-canal.js <conta> --descobrir  -> (depois de pôr o bot como admin do canal)
//        lê o getUpdates, acha o canal, mostra o título e o ID e grava em config.json ("telegramCanal.id")
// Liga com "telegramCanal": { "ativo": true, "id": "-100..." } no config.json. Desligado ou sem ID: pula sem erro.
// Anota em contas/<conta>/publicados.json com a chave "telegram-canal:<id do reel>" (nunca repete).
// O token (TELEGRAM_BOT_TOKEN) nunca é impresso.
const fs = require('fs');
const path = require('path');
const maquina = require('./maquina');
const reels = require('./reels');
const { enviarTelegram } = require('./conferencia');

const RAIZ = path.join(__dirname, '..');
const MAX_BYTES = 50 * 1024 * 1024; // limite do sendVideo da API de bots
const ROTULO_IA = reels.ROTULO_IA;
const PERFIL_TIKTOK = 'https://www.tiktok.com/@shopabessa';
const CTA_CARRINHO = `🛒 Compra pelo carrinho do vídeo no TikTok: ${PERFIL_TIKTOK}`;
const CTA_SALVA = 'Salva pra não esquecer 💾';
const TAG = /#[\p{L}\p{N}_]+/gu;
const PALAVRA_DE_LINK = /\b(?:links?|carrinho|sacolinha)\b/i;
const PRECO = /R\$\s*\d|\b\d+[.,]\d{2}\s*reais\b|\b\d+\s*reais\b/i;

// Legenda do Reel (Instagram) -> legenda do canal. A fila não guarda a legenda original do TikTok.
// 1ª linha = gancho; até 3 hashtags (com #publi); chamada só com link que existe; última linha = rótulo de IA.
// item.semProduto = true (vídeo sem produto anexado no TikTok): sem carrinho e sem #publi, só "Salva".
function legendaCanal(legendaReel, { semProduto = false } = {}) {
  let t = String(legendaReel || '').replace(/\r/g, '').replace(/^﻿/, '');
  const tags = [...new Set((t.match(TAG) || []).map((h) => h.toLowerCase()))].filter(
    (h) => !/^#(publi|publicidade|tiktok\w*)$/.test(h) && !PALAVRA_DE_LINK.test(h.slice(1))
  );
  // Link de fora vira marca e a frase dele sai inteira (só vale o link do perfil, que entra na chamada)
  t = t.replace(/\S*https?:\/\/\S+/g, ' link ');
  t = t.replace(TAG, ' ').replace(ROTULO_IA, ' ').replace(/🛒/g, ' ');
  // Chamadas do Instagram ("Salva pra não esquecer", "E aí, você usaria...?") saem inteiras
  t = t.split(reels.CTA_SALVA).join(' ').split(reels.CTA_PERGUNTA).join(' ');
  const frases = t
    .split('\n')
    .map((l) =>
      (l.match(/[^.!?]+[.!?]*\s*/g) || [])
        // Fora: chamadas do Instagram, link/carrinho/sacolinha e preço
        .filter((f) => !PALAVRA_DE_LINK.test(f) && !PRECO.test(f))
        .join(' ')
        .replace(/\s+/g, ' ')
        .replace(/\s+([.!?,:;])/g, '$1')
        .trim()
    )
    .filter((l) => l && /[\p{L}\p{N}]/u.test(l));
  // Gancho = 1ª frase (até o 1º "?", "!" ou ".", com o emoji que vier junto)
  let corpo = frases.join('\n');
  let gancho = '';
  const m = corpo.match(/^[^\n?!.]*[?!.]+(?:\s*[^\s\p{L}\p{N}]+)*/u);
  if (m && m[0].length <= 120) {
    gancho = m[0].trim();
    corpo = corpo.slice(m[0].length).trim();
  } else {
    [gancho, ...corpo] = corpo.split('\n');
    corpo = corpo.join('\n').trim();
  }
  const tagsFinal = semProduto ? tags.slice(0, 3) : ['#publi', ...tags.slice(0, 2)];
  const cta = semProduto ? CTA_SALVA : CTA_CARRINHO;
  const montar = (c) => [gancho, c, cta, tagsFinal.join(' '), ROTULO_IA].filter(Boolean).join('\n\n');
  let leg = montar(corpo);
  // sendVideo aceita até 1024 letras na legenda: corta o corpo no fim de uma frase
  while (leg.length > 1024 && corpo) {
    corpo = corpo.replace(/\s*[^.!?\n]+[.!?]*\s*$/, '').trim();
    leg = montar(corpo);
  }
  return leg;
}

// TRAVA: o que a legenda do canal nunca pode ter
function problemasLegendaCanal(legenda) {
  const t = String(legenda || '');
  const p = [];
  if (!t.trim()) p.push('legenda vazia');
  if (/sacolinha/i.test(t)) p.push('tem "sacolinha" (palavra proibida)');
  if (PRECO.test(t)) p.push('tem preço (só benefícios)');
  const links = t.match(/https?:\/\/\S+/g) || [];
  if (links.some((l) => l !== PERFIL_TIKTOK)) p.push('tem link que não é o perfil do TikTok @shopabessa');
  const temCarrinho = /carrinho|🛒/i.test(t);
  if (temCarrinho && !t.includes(PERFIL_TIKTOK)) p.push('promete carrinho sem o link de verdade');
  if (temCarrinho && !/#publi\b/i.test(t)) p.push('venda sem #publi');
  const n = (t.match(TAG) || []).length;
  if (n > 3) p.push(`tem ${n} hashtags (máximo 3)`);
  if (!t.trim().endsWith(ROTULO_IA)) p.push(`a última linha não é "${ROTULO_IA}"`);
  if (t.length > 1024) p.push('legenda com mais de 1024 letras');
  return p;
}

// ---------- Publicados ----------
const arqPublicadosDe = (conta, raiz = RAIZ) => path.join(raiz, 'contas', conta, 'publicados.json');
function lerPublicados(arq) {
  try {
    return JSON.parse(fs.readFileSync(arq, 'utf8')) || {};
  } catch {
    return {};
  }
}
function marcarPublicado(arq, chave, valor) {
  const feitos = lerPublicados(arq); // relê: nunca perde o que outro passo anotou
  feitos[chave] = valor;
  fs.writeFileSync(arq + '.tmp', JSON.stringify(feitos, null, 2));
  fs.renameSync(arq + '.tmp', arq);
}

// Mesma regra de horário do reels.js, com as chaves do canal
function devidosCanal(fila, feitos, agora = new Date()) {
  const espelho = {};
  for (const it of fila) {
    if (!it || !it.id) continue;
    if (feitos[`telegram-canal:${it.id}`]) espelho[`reel:${it.id}`] = true;
    if (feitos[`aviso:telegram-canal:${it.id}`]) espelho[`aviso:reel:${it.id}`] = true;
  }
  return reels.devidos(fila, espelho, agora);
}

const semToken = (msg, token) => (token ? String(msg).split(token).join('***') : String(msg));

async function enviarVideo(arquivo, legenda, { token, chatId, fetchFn = fetch }) {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('caption', legenda);
  form.append('supports_streaming', 'true');
  form.append('video', new Blob([fs.readFileSync(arquivo)], { type: 'video/mp4' }), path.basename(arquivo));
  const r = await fetchFn(`https://api.telegram.org/bot${token}/sendVideo`, { method: 'POST', body: form, signal: AbortSignal.timeout(180000) });
  const json = await r.json().catch(() => ({}));
  // Nunca mostrar a URL (ela tem o token)
  if (!r.ok || !json.ok) {
    const e = new Error(`o Telegram recusou o vídeo (${json.description || 'HTTP ' + r.status})`);
    // Grupo comum que virou supergrupo muda de ID: o Telegram manda o ID novo
    if (json.parameters && json.parameters.migrate_to_chat_id) e.migrarPara = String(json.parameters.migrate_to_chat_id);
    throw e;
  }
  return (json.result && json.result.message_id) || true;
}

async function avisarDona(seg, texto, fetchFn, log) {
  if (!seg.telegramToken || !seg.telegramChatId) return log('(Sem TELEGRAM_CHAT_ID: o aviso ficou só no registro.)');
  try {
    await enviarTelegram(texto, { token: seg.telegramToken, chatId: seg.telegramChatId, fetchFn });
  } catch (e) {
    log('(Não consegui avisar no Telegram: ' + semToken(e.message, seg.telegramToken) + ')');
  }
}

// ---------- Rodada ----------
async function publicarCanal(conta, { simular = false, agora = new Date(), fetchFn = fetch, log = console.log, raiz = RAIZ, segredos, config, fila, arqPublicados } = {}) {
  const pastaConta = path.join(raiz, 'contas', conta);
  let cfg = config;
  if (!cfg) {
    try {
      cfg = JSON.parse(fs.readFileSync(path.join(pastaConta, 'config.json'), 'utf8'));
    } catch (e) {
      throw new Error('config.json com erro: ' + e.message);
    }
  }
  const canal = cfg.telegramCanal || {};
  if (!simular && (!canal.ativo || !String(canal.id || '').trim())) {
    log('Canal do Telegram desligado ou sem ID ("telegramCanal" no config.json): pulando.');
    return { enviados: 0 };
  }
  const seg = segredos || maquina.lerSegredos(pastaConta);
  if (!simular && !seg.telegramToken) {
    log('Sem TELEGRAM_BOT_TOKEN: pulando o canal.');
    return { enviados: 0 };
  }
  const arq = arqPublicados || arqPublicadosDe(conta, raiz);
  const filaReels = fila || reels.lerFila(conta, raiz);
  const { prontos, atrasados } = devidosCanal(filaReels, lerPublicados(arq), agora);
  if (atrasados.length) log(`Canal: ${atrasados.length} vídeo(s) passaram de 1 dia do horário; não posto atrasado.`);
  if (!prontos.length) {
    const prox = filaReels.find((r) => r && r.id && reels.momento(r) > agora);
    log('Canal: nada na hora agora.' + (prox ? ` Próximo: ${prox.data} às ${prox.hora}h.` : ''));
    return { enviados: 0 };
  }
  let enviados = 0;
  let erros = 0;
  for (const it of prontos) {
    const video = path.join(raiz, 'publico', conta, it.video || '');
    const legenda = legendaCanal(it.legenda, { semProduto: !!it.semProduto });
    const prob = problemasLegendaCanal(legenda);
    const dataBR = `${it.data.split('-').reverse().slice(0, 2).join('/')} ${it.hora}h`;
    if (simular) {
      log(`Canal (SIMULAÇÃO, nada enviado): ${dataBR} -> ${it.video}${prob.length ? `\n  BARRADO: ${prob.join('; ')}` : ''}\n${legenda.replace(/^/gm, '    ')}`);
      continue;
    }
    if (prob.length) {
      erros++;
      log(`Canal: vídeo de ${dataBR} barrado: ${prob.join('; ')}`);
      continue;
    }
    const bytes = fs.existsSync(video) ? fs.statSync(video).size : -1;
    if (bytes < 0 || bytes > MAX_BYTES) {
      const motivo = bytes < 0 ? 'o arquivo do vídeo não está mais no repositório' : `o vídeo tem ${(bytes / 1048576).toFixed(1)} MB (o Telegram aceita até 50 MB)`;
      log(`Canal: pulei o vídeo de ${dataBR}: ${motivo}.`);
      await avisarDona(seg, `⚠️ O vídeo de ${dataBR} não foi para o canal do Telegram: ${motivo}.`, fetchFn, log);
      marcarPublicado(arq, `aviso:telegram-canal:${it.id}`, { quando: agora.toISOString(), motivo });
      continue;
    }
    try {
      let id;
      try {
        id = await enviarVideo(video, legenda, { token: seg.telegramToken, chatId: canal.id, fetchFn });
      } catch (e) {
        if (!e.migrarPara) throw e;
        log(`Canal: o grupo virou supergrupo; ID novo ${e.migrarPara} gravado no config.json.`);
        canal.id = e.migrarPara;
        gravarIdNoConfig(pastaConta, e.migrarPara);
        id = await enviarVideo(video, legenda, { token: seg.telegramToken, chatId: canal.id, fetchFn });
      }
      marcarPublicado(arq, `telegram-canal:${it.id}`, { id, quando: new Date().toISOString() });
      enviados++;
      log(`Canal: vídeo de ${dataBR} publicado.`);
    } catch (e) {
      erros++;
      log(`Canal: ERRO no vídeo de ${dataBR}: ${semToken(e.message, seg.telegramToken)} (a próxima rodada tenta de novo)`);
    }
  }
  return { enviados, erros };
}

// Grava o ID no config.json (mantém o "ativo" como está)
function gravarIdNoConfig(pastaConta, id) {
  const arqCfg = path.join(pastaConta, 'config.json');
  const cfg = JSON.parse(fs.readFileSync(arqCfg, 'utf8'));
  cfg.telegramCanal = { ativo: !!(cfg.telegramCanal && cfg.telegramCanal.ativo), id: String(id) };
  fs.writeFileSync(arqCfg, JSON.stringify(cfg, null, 2) + '\n');
}

// ---------- Descobrir o ID do canal OU grupo ----------
// Acha canal, grupo ou supergrupo nos updates: my_chat_member (bot adicionado/virou admin), mensagem do grupo
// (inclusive "entrou no grupo") ou channel_post. Grupo que virou supergrupo (migrate_to_chat_id): fica o ID novo.
// Não confirma (não consome) os updates.
const TIPOS = ['group', 'supergroup', 'channel'];
function canaisDosUpdates(updates) {
  const achados = new Map();
  const migrou = new Map();
  for (const u of updates || []) {
    const msg = u.message || u.edited_message || u.channel_post || u.edited_channel_post;
    const chat = (u.my_chat_member && u.my_chat_member.chat) || (msg && msg.chat);
    if (!chat || !TIPOS.includes(chat.type)) continue;
    const titulo = chat.title || '(sem título)';
    if (msg && msg.migrate_to_chat_id) {
      migrou.set(String(chat.id), String(msg.migrate_to_chat_id));
      achados.set(String(msg.migrate_to_chat_id), { titulo, tipo: 'supergroup' });
    }
    if (msg && msg.migrate_from_chat_id) migrou.set(String(msg.migrate_from_chat_id), String(chat.id));
    // Bot tirado do grupo: esquece esse grupo
    const saiu = u.my_chat_member && ['left', 'kicked'].includes((u.my_chat_member.new_chat_member || {}).status);
    if (saiu) achados.delete(String(chat.id));
    else achados.set(String(chat.id), { titulo, tipo: chat.type });
  }
  for (const velho of migrou.keys()) achados.delete(velho);
  return [...achados].map(([id, c]) => ({ id, titulo: c.titulo, tipo: c.tipo }));
}

async function descobrir(conta, { fetchFn = fetch, log = console.log, raiz = RAIZ, segredos } = {}) {
  const pastaConta = path.join(raiz, 'contas', conta);
  const seg = segredos || maquina.lerSegredos(pastaConta);
  if (!seg.telegramToken) throw new Error('Falta a linha TELEGRAM_BOT_TOKEN = ... no CHAVES.txt.');
  let json;
  try {
    const r = await fetchFn(`https://api.telegram.org/bot${seg.telegramToken}/getUpdates?allowed_updates=${encodeURIComponent('["my_chat_member","message","channel_post"]')}`, { signal: AbortSignal.timeout(20000) });
    json = await r.json().catch(() => ({}));
    if (!r.ok || !json.ok) throw new Error(json.description || 'HTTP ' + r.status);
  } catch (e) {
    throw new Error('o Telegram não respondeu: ' + semToken(e.message, seg.telegramToken));
  }
  const canais = canaisDosUpdates(json.result);
  if (!canais.length) {
    log('Não achei nenhum grupo ou canal. Confira se o bot está no grupo (como administrador) e mande uma mensagem qualquer LÁ; depois rode este comando de novo.');
    return null;
  }
  for (const c of canais) log(`${c.tipo === 'channel' ? 'Canal' : 'Grupo'} encontrado: "${c.titulo}" -> ID ${c.id}`);
  const escolhido = canais.find((c) => /achadinho/i.test(c.titulo)) || canais[canais.length - 1];
  gravarIdNoConfig(pastaConta, escolhido.id);
  log(`Gravei o ID ${escolhido.id} ("${escolhido.titulo}") no config.json. Para ligar: "telegramCanal": { "ativo": true }.`);
  return escolhido;
}

if (require.main === module) {
  const conta = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'lusia';
  const tarefa = process.argv.includes('--descobrir') ? descobrir(conta) : publicarCanal(conta, { simular: process.argv.includes('--simular') });
  tarefa
    .then((r) => {
      if (r && r.erros) process.exitCode = 1;
    })
    .catch((e) => {
      console.error('ERRO: ' + e.message);
      process.exitCode = 1;
    });
}

module.exports = { gravarIdNoConfig, legendaCanal, problemasLegendaCanal, devidosCanal, canaisDosUpdates, publicarCanal, descobrir, enviarVideo, PERFIL_TIKTOK, CTA_CARRINHO };
