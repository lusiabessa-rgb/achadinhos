// CONFERÊNCIA DAS 21H30 (roda na nuvem, não depende do PC)
// Uso:  node app/conferencia.js <conta>            -> confere o dia e manda o resumo pelo Telegram
//       node app/conferencia.js <conta> --simular  -> só mostra o resumo, não manda nada
//       node app/conferencia.js <conta> --ligar-telegram
//            -> (no PC, uma vez) lê o TELEGRAM_BOT_TOKEN do CHAVES.txt, descobre o CHAT_ID pelo getUpdates,
//               grava os dois nos Secrets do GitHub (gh secret set) e manda uma mensagem de teste.
//               O token nunca aparece na tela.
// Sem TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID: só imprime o resumo e termina com sucesso.
const fs = require('fs');
const path = require('path');
const instagram = require('./instagram');

const RAIZ = path.join(__dirname, '..');
const FUSO = 'America/Sao_Paulo';
const diaBR = (d) => new Date(d).toLocaleDateString('sv-SE', { timeZone: FUSO });
const lerJson = (arq, padrao) => {
  try {
    return JSON.parse(fs.readFileSync(arq, 'utf8')) ?? padrao;
  } catch {
    return padrao;
  }
};

// Segredos: primeiro as variáveis do robô (GitHub Actions), depois o CHAVES.txt do PC
function lerSegredos(pastaConta) {
  const s = {};
  const arq = path.join(pastaConta, 'CHAVES.txt');
  if (fs.existsSync(arq)) {
    for (const linha of fs.readFileSync(arq, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
      const m = linha.match(/^\s*([A-Za-z_]+)\s*=\s*(.+?)\s*$/);
      if (m && !/cole aqui/i.test(m[2])) s[m[1].toUpperCase()] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  const env = process.env;
  return {
    igToken: env.INSTAGRAM_TOKEN || s.INSTAGRAM_TOKEN,
    igUserId: env.INSTAGRAM_USER_ID || s.INSTAGRAM_USER_ID,
    telegramToken: env.TELEGRAM_BOT_TOKEN || s.TELEGRAM_BOT_TOKEN,
    telegramChatId: env.TELEGRAM_CHAT_ID || s.TELEGRAM_CHAT_ID,
  };
}

// Tipo de cada linha do publicados.json: "2026-10-19:carrossel", "...:story:ID", "...:post:ID", "conteudo:slug"
// "reel:2026-10-27-18h" = Reel; "aviso:..." = só um aviso já dado (não conta como publicação)
function tipoDaChave(chave) {
  if (chave.startsWith('aviso:')) return 'aviso';
  if (chave.startsWith('reel:')) return 'reel';
  if (chave.startsWith('conteudo:')) return 'conteudo';
  if (/:carrossel$/.test(chave)) return 'carrossel';
  if (/:story:/.test(chave)) return 'story';
  return 'post';
}

// Junta tudo o que dá para saber SEM internet (publicados.json, fila e config)
// arqPublicados / arqFila / config (opções): o teste usa arquivos temporários e nunca mexe nos de verdade
function conferirArquivos(conta, { agora = new Date(), arqPublicados, arqFila, config: configForcado } = {}) {
  const pastaConta = path.join(RAIZ, 'contas', conta);
  const config = configForcado || lerJson(path.join(pastaConta, 'config.json'), {});
  const ig = config.instagram || {};
  const feitos = lerJson(arqPublicados || path.join(pastaConta, 'publicados.json'), {}) || {};
  const hoje = diaBR(agora);
  const publicadosHoje = { carrossel: 0, story: 0, post: 0, conteudo: 0, reel: 0 };
  for (const [chave, v] of Object.entries(feitos)) {
    const tipo = tipoDaChave(chave);
    if (v && v.quando && diaBR(v.quando) === hoje && tipo in publicadosHoje) publicadosHoje[tipo]++;
  }
  const fila = lerJson(arqFila || path.join(RAIZ, 'publico', conta, 'conteudo', 'fila.json'), []) || [];
  const filaRestante = fila.filter((c) => c && c.slug && !feitos[`conteudo:${c.slug}`]).length;
  const porDia = ig.conteudoPorDia === undefined ? 1 : Number(ig.conteudoPorDia) || 1;
  // Data de vencimento do token: "instagram.tokenVenceEm" no config.json (AAAA-MM-DD)
  let tokenDias = null;
  if (ig.tokenVenceEm && !isNaN(new Date(ig.tokenVenceEm + 'T12:00:00Z'))) {
    tokenDias = Math.round((new Date(ig.tokenVenceEm + 'T12:00:00Z') - new Date(hoje + 'T12:00:00Z')) / 86400e3);
  }
  return { hoje, instagramLigado: !!ig.ativo, publicadosHoje, filaRestante, porDia, tokenDias };
}

// Posts do feed de hoje confirmados pela API do Instagram (stories não aparecem nessa lista)
async function conferirInstagram(segredos, { agora = new Date(), fetchFn = fetch } = {}) {
  if (!segredos.igToken || !segredos.igUserId) return { erro: 'sem token' };
  try {
    const posts = await instagram.postsRecentes({ token: segredos.igToken, userId: segredos.igUserId }, 25, fetchFn);
    return { feedHoje: posts.filter((p) => p.timestamp && diaBR(p.timestamp) === diaBR(agora)).length };
  } catch (e) {
    return { erro: e.codigo === 190 ? 'token vencido' : 'não respondeu' };
  }
}

// Rodadas do robô que falharam nas últimas 24 h (API do GitHub, com o GITHUB_TOKEN do próprio Actions)
async function conferirRobo({ agora = new Date(), fetchFn = fetch, ghToken = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPOSITORY, runAtual = process.env.GITHUB_RUN_ID } = {}) {
  if (!ghToken || !repo) return null;
  try {
    const desde = new Date(agora.getTime() - 24 * 3600e3).toISOString().slice(0, 19) + 'Z';
    const r = await fetchFn(`https://api.github.com/repos/${repo}/actions/runs?per_page=100&created=${encodeURIComponent('>=' + desde)}`, {
      headers: { Authorization: `Bearer ${ghToken}`, Accept: 'application/vnd.github+json', 'User-Agent': 'maquina-de-ofertas', 'X-GitHub-Api-Version': '2022-11-28' },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return null;
    const json = await r.json();
    const runs = (json.workflow_runs || []).filter((x) => String(x.id) !== String(runAtual));
    const falhas = runs.filter((x) => ['failure', 'timed_out', 'startup_failure'].includes(x.conclusion));
    return { total: runs.length, falhas: falhas.map((x) => x.name) };
  } catch {
    return null;
  }
}

// Monta o resumo (sem internet: recebe tudo pronto). No máximo 8 linhas.
function montarResumo({ hoje, instagramLigado, publicadosHoje, filaRestante, porDia, tokenDias, insta = {}, robo = null }) {
  const [, mes, dia] = hoje.split('-');
  const linhas = [`📋 Conferência de ${dia}/${mes} (21h30)`];
  const p = publicadosHoje;
  const totalHoje = p.carrossel + p.story + p.post + p.conteudo + (p.reel || 0);
  const partes = [];
  if (p.carrossel) partes.push(`${p.carrossel} carrossel`);
  if (p.post) partes.push(`${p.post} post de oferta`);
  if (p.reel) partes.push(`${p.reel} Reel${p.reel > 1 ? 's' : ''}`);
  if (p.conteudo) partes.push(`${p.conteudo} post de conteúdo`);
  if (p.story) partes.push(`${p.story} ${p.story === 1 ? 'story' : 'stories'}`);
  const api = insta.feedHoje !== undefined ? `; ${insta.feedHoje} no feed confirmado(s) pelo Instagram` : '';
  if (!instagramLigado) linhas.push('⚠️ Instagram: desligado no config.json');
  else if (insta.erro === 'token vencido') linhas.push('⚠️ Instagram: o token VENCEU. Precisa gerar um novo');
  else if (totalHoje) linhas.push(`✅ Instagram: ${totalHoje} publicação(ões) hoje (${partes.join(', ')})${api}`);
  else if (insta.feedHoje) linhas.push(`✅ Instagram: ${insta.feedHoje} post(s) no feed hoje (confirmado pelo Instagram)`);
  else linhas.push(`⚠️ Instagram: nada publicado hoje${insta.erro === 'não respondeu' ? ' (e o Instagram não respondeu)' : ''}`);

  const dias = Math.floor(filaRestante / porDia);
  if (!filaRestante) linhas.push('⚠️ Fila de posts de conteúdo: VAZIA. Precisa de posts novos');
  else linhas.push(`${dias < 3 ? '⚠️' : '✅'} Fila de conteúdo: ${filaRestante} post(s), dá para ${dias} dia(s)`);

  if (insta.erro === 'token vencido') linhas.push('⚠️ Token do Instagram: vencido');
  else if (tokenDias === null) linhas.push('⚠️ Token do Instagram: data de vencimento não anotada');
  else if (tokenDias < 0) linhas.push('⚠️ Token do Instagram: venceu há ' + -tokenDias + ' dia(s)');
  else linhas.push(`${tokenDias < 15 ? '⚠️' : '✅'} Token do Instagram: vence em ${tokenDias} dia(s)${tokenDias < 15 ? '. Renovar já' : ''}`);

  if (!robo) linhas.push('⚠️ Robô: não consegui conferir as rodadas');
  else if (!robo.falhas.length) linhas.push(`✅ Robô: nenhuma falha nas últimas 24 h (${robo.total} rodada(s))`);
  else {
    const nomes = [...new Set(robo.falhas)].join(', ');
    linhas.push(`⚠️ Robô: ${robo.falhas.length} rodada(s) falharam nas últimas 24 h (${nomes})`);
  }

  // A API do TikTok só lista os vídeos com o escopo video.list (ainda não pedido): não dá para conferir daqui
  linhas.push('📱 TikTok: conferir no app');
  const alertas = linhas.filter((l) => l.startsWith('⚠️')).length;
  linhas.push(alertas ? `👉 ${alertas} ponto(s) para olhar.` : '👉 Tudo certo hoje. Pode descansar!');
  return linhas.join('\n');
}

async function enviarTelegram(texto, { token, chatId, fetchFn = fetch }) {
  const r = await fetchFn(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: texto, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(20000),
  });
  const json = await r.json().catch(() => ({}));
  // Nunca mostrar a URL (ela tem o token)
  if (!r.ok || !json.ok) throw new Error(`o Telegram recusou (${json.description || 'HTTP ' + r.status})`);
  return true;
}

async function conferir(conta, { agora = new Date(), fetchFn = fetch, simular = false, log = console.log, segredos, arqPublicados } = {}) {
  const seg = segredos || lerSegredos(path.join(RAIZ, 'contas', conta));
  const dados = conferirArquivos(conta, { agora, arqPublicados });
  const insta = dados.instagramLigado ? await conferirInstagram(seg, { agora, fetchFn }) : {};
  const robo = await conferirRobo({ agora, fetchFn });
  const resumo = montarResumo({ ...dados, insta, robo });
  log(resumo);
  if (simular) return { resumo, enviado: false };
  if (!seg.telegramToken || !seg.telegramChatId) {
    log('\n(Sem TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID: o resumo ficou só aqui no registro.)');
    return { resumo, enviado: false };
  }
  try {
    await enviarTelegram(resumo, { token: seg.telegramToken, chatId: seg.telegramChatId, fetchFn });
    log('\nResumo enviado pelo Telegram.');
    return { resumo, enviado: true };
  } catch (e) {
    // Não quebra o robô: só avisa no registro
    log('\nAviso: não consegui mandar pelo Telegram: ' + e.message);
    return { resumo, enviado: false };
  }
}

// Uma vez, no PC: descobre o CHAT_ID e grava os Secrets do GitHub sem mostrar o token
async function ligarTelegram(conta) {
  const { execFileSync } = require('child_process');
  const seg = lerSegredos(path.join(RAIZ, 'contas', conta));
  if (!seg.telegramToken) throw new Error('Falta a linha TELEGRAM_BOT_TOKEN = ... no CHAVES.txt.');
  const r = await fetch(`https://api.telegram.org/bot${seg.telegramToken}/getUpdates`, { signal: AbortSignal.timeout(20000) });
  const json = await r.json().catch(() => ({}));
  if (!json.ok) throw new Error('O Telegram não aceitou o token. Confira se copiou inteiro do @BotFather.');
  const chats = [...new Set((json.result || []).map((u) => (u.message || u.edited_message || {}).chat).filter(Boolean).map((c) => String(c.id)))];
  if (!chats.length) throw new Error('Ninguém mandou mensagem ao bot ainda. Abra o bot no Telegram, toque em Começar e mande "oi".');
  const chatId = chats[chats.length - 1];
  const gh = process.platform === 'win32' ? 'C:\\Program Files\\GitHub CLI\\gh.exe' : 'gh';
  execFileSync(gh, ['secret', 'set', 'TELEGRAM_BOT_TOKEN'], { input: seg.telegramToken, cwd: RAIZ, stdio: ['pipe', 'ignore', 'inherit'] });
  execFileSync(gh, ['secret', 'set', 'TELEGRAM_CHAT_ID'], { input: chatId, cwd: RAIZ, stdio: ['pipe', 'ignore', 'inherit'] });
  await enviarTelegram('Oi! Eu sou a Máquina de Ofertas. Todo dia às 21h30 mando aqui o resumo do dia. ✅', { token: seg.telegramToken, chatId });
  console.log('Pronto: segredos TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID gravados no GitHub e mensagem de teste enviada.');
}

if (require.main === module) {
  const conta = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'lusia';
  const tarefa = process.argv.includes('--ligar-telegram') ? ligarTelegram(conta) : conferir(conta, { simular: process.argv.includes('--simular') });
  tarefa.catch((e) => {
    console.error('ERRO: ' + e.message);
    process.exitCode = process.argv.includes('--ligar-telegram') ? 1 : 0; // a conferência nunca quebra o robô
  });
}

module.exports = { conferir, conferirArquivos, conferirInstagram, conferirRobo, montarResumo, enviarTelegram, tipoDaChave };
