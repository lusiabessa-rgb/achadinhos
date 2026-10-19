// Posta os vídeos no TikTok @shopabessa pelo caminho OFICIAL (TikTok Content Posting API).
// DESLIGADO por padrão: só age com "tiktok": { "ativo": true } no config.json.
//
// Dois modos (config tiktok.modo):
//   "rascunho" (padrão): o robô manda o vídeo para a CAIXA DE ENTRADA do TikTok (escopo video.upload).
//               A dona recebe um aviso no app, abre, escolhe o som, cola a legenda e posta. Não precisa de auditoria.
//   "direto":   o robô publica sozinho (escopo video.publish). Sem a auditoria do TikTok, o post sai PRIVADO
//               (só eu) e a conta precisa estar privada. Só vale a pena depois que o TikTok aprovar a auditoria.
//
// Uso no PC:
//   node app/tiktok.js lusia --link      mostra o link para a dona autorizar (não tem segredo nele)
//   node app/tiktok.js lusia --codigo    lê o código copiado (área de transferência) e guarda o token no cofre
//   node app/tiktok.js lusia --checar    diz se está conectado e quanto falta para vencer (sem mostrar segredo)
//   node app/tiktok.js lusia --simular   diz o que mandaria agora, sem mandar nada
//   node app/tiktok.js lusia             manda os vídeos da vez (o robô da nuvem usa este)
//
// Segredos (CHAVES.txt ou Secrets do GitHub): TIKTOK_CLIENT_KEY e TIKTOK_CLIENT_SECRET.
// Os tokens da dona ficam em contas/<conta>/tiktok-cofre.json, CRIPTOGRAFADOS com o client secret
// (o TikTok troca o refresh token de vez em quando, e o robô da nuvem precisa guardar o novo).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const maquina = require('./maquina');

const RAIZ = path.join(__dirname, '..');
const HOST = 'https://open.tiktokapis.com';
const AUTORIZAR = 'https://www.tiktok.com/v2/auth/authorize/';
const TEMPO_LIMITE_MS = 60000;
const MB = 1024 * 1024;
const PADRAO = {
  ativo: false,
  modo: 'rascunho',
  pasta: 'contas/{conta}/tiktok-fila',
  porRodada: 1,
  escopos: 'user.info.basic,video.upload', // no modo direto, acrescentar video.publish (precisa estar ligado no portal)
  privacidade: 'SELF_ONLY', // só no modo direto; sem auditoria o TikTok só aceita SELF_ONLY
  permitirComentarios: true,
  permitirDueto: false,
  permitirCostura: false,
  suaMarca: false, // "conteúdo da sua marca" (brand_organic_toggle)
  conteudoPago: false, // "parceria paga" (brand_content_toggle)
};

class ErroFatal extends Error {
  constructor(msg, codigo) {
    super(msg);
    this.codigo = codigo;
  }
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// Erros do TikTok em português. Fatal = não adianta tentar de novo nesta rodada.
const ERROS = {
  access_token_invalid: 'A autorização do TikTok venceu ou foi tirada. Rode "node app/tiktok.js lusia --link" e autorize de novo.',
  scope_not_authorized: 'O app do TikTok não tem a permissão de postar. No portal, confira os produtos Login Kit e Content Posting API e autorize de novo.',
  spam_risk_too_many_posts: 'A conta já chegou no limite de posts do dia no TikTok. O resto fica para amanhã.',
  spam_risk_too_many_pending_share: 'Já tem 5 vídeos esperando na caixa de entrada do TikTok. Poste ou apague os rascunhos de lá.',
  spam_risk_user_banned_from_posting: 'O TikTok bloqueou esta conta de postar. Confira os avisos no app do TikTok.',
  reached_active_user_cap: 'O app chegou no limite de contas por dia do TikTok. Tenta de novo amanhã.',
  unaudited_client_can_only_post_to_private_accounts: 'Sem a auditoria do TikTok, o modo "direto" só funciona com a conta PRIVADA. Use o modo "rascunho".',
  privacy_level_option_mismatch: 'A privacidade escolhida não é aceita para esta conta agora (sem auditoria, só "SELF_ONLY").',
  url_ownership_unverified: 'O TikTok não reconhece o site como seu.',
};
const FALHAS = {
  file_format_check_failed: 'o formato do vídeo não foi aceito',
  duration_check_failed: 'a duração do vídeo não foi aceita',
  frame_rate_check_failed: 'a velocidade (fps) do vídeo não foi aceita',
  picture_size_check_failed: 'o tamanho da imagem do vídeo não foi aceito',
  auth_removed: 'a dona tirou a autorização do app',
  publish_cancelled: 'o envio foi cancelado',
};

// ---------- Cofre (tokens criptografados) ----------
const chaveDoCofre = (clientSecret) => crypto.createHash('sha256').update('cofre-tiktok:' + clientSecret).digest();

function trancar(dados, clientSecret) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', chaveDoCofre(clientSecret), iv);
  const cifrado = Buffer.concat([c.update(JSON.stringify(dados), 'utf8'), c.final()]);
  return { v: 1, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), dados: cifrado.toString('base64') };
}

function destrancar(cofre, clientSecret) {
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', chaveDoCofre(clientSecret), Buffer.from(cofre.iv, 'base64'));
    d.setAuthTag(Buffer.from(cofre.tag, 'base64'));
    return JSON.parse(Buffer.concat([d.update(Buffer.from(cofre.dados, 'base64')), d.final()]).toString('utf8'));
  } catch {
    throw new ErroFatal('Não consegui abrir o cofre do TikTok (o TIKTOK_CLIENT_SECRET mudou?). Autorize de novo com --link.');
  }
}

const arqCofre = (pastaConta) => path.join(pastaConta, 'tiktok-cofre.json');
function lerCofre(pastaConta, clientSecret) {
  const arq = arqCofre(pastaConta);
  return fs.existsSync(arq) ? destrancar(JSON.parse(fs.readFileSync(arq, 'utf8')), clientSecret) : null;
}
function salvarCofre(pastaConta, clientSecret, dados) {
  fs.writeFileSync(arqCofre(pastaConta), JSON.stringify(trancar(dados, clientSecret), null, 2) + '\n');
}

// ---------- Autorização (OAuth) ----------
function linkDeAutorizacao({ clientKey, redirectUri, escopos = PADRAO.escopos, estado }) {
  const p = new URLSearchParams({ client_key: clientKey, scope: escopos, response_type: 'code', redirect_uri: redirectUri, state: estado || crypto.randomBytes(8).toString('hex') });
  return `${AUTORIZAR}?${p}`;
}

// Troca o código (ou renova). Devolve os tokens com a data em que vencem.
async function pedirToken(seg, params, fetchFn = fetch, agora = Date.now()) {
  const corpo = new URLSearchParams({ client_key: seg.tiktokKey, client_secret: seg.tiktokSecret, ...params });
  let ultimo;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    let resp, json;
    try {
      resp = await fetchFn(`${HOST}/v2/oauth/token/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: corpo,
        signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      });
      json = await resp.json().catch(() => null);
    } catch (e) {
      ultimo = new Error('Sem resposta do TikTok (' + (e.name === 'TimeoutError' ? 'demorou demais' : e.message) + ').');
      if (tentativa < 3) await espera(2000 * tentativa);
      continue;
    }
    if (resp.ok && json && json.access_token) {
      return {
        access_token: json.access_token,
        refresh_token: json.refresh_token,
        expira_em: agora + (json.expires_in || 86400) * 1000,
        refresh_expira_em: agora + (json.refresh_expires_in || 31536000) * 1000,
        open_id: json.open_id,
        escopos: json.scope,
      };
    }
    const erro = (json && (typeof json.error === 'string' ? json.error : json.error && json.error.code)) || 'HTTP ' + resp.status;
    if (resp.status >= 500) {
      ultimo = new Error('O TikTok está fora do ar agora.');
      if (tentativa < 3) await espera(2000 * tentativa);
      continue;
    }
    // invalid_grant, invalid_client... não adianta repetir
    throw new ErroFatal(
      params.grant_type === 'authorization_code'
        ? `O TikTok não aceitou o código (${erro}). O código vale poucos minutos e só uma vez: autorize de novo e rode --codigo logo em seguida.`
        : `O TikTok não renovou a autorização (${erro}). Autorize de novo com --link.`,
      erro
    );
  }
  throw ultimo;
}

const trocarCodigo = (seg, codigo, redirectUri, fetchFn, agora) =>
  pedirToken(seg, { code: decodeURIComponent(codigo.trim()), grant_type: 'authorization_code', redirect_uri: redirectUri }, fetchFn, agora);

// Devolve um access token válido, renovando quando faltar menos de 10 min (dura 24h).
// O refresh token dura 1 ano; se o TikTok mandar um novo, guarda o novo no cofre.
async function tokenValido(pastaConta, seg, fetchFn = fetch, agora = Date.now()) {
  if (!seg.tiktokKey || !seg.tiktokSecret) throw new ErroFatal('Falta o TIKTOK_CLIENT_KEY e o TIKTOK_CLIENT_SECRET no CHAVES.txt (ou nos Secrets do GitHub).');
  let t = lerCofre(pastaConta, seg.tiktokSecret);
  if (!t) throw new ErroFatal('O TikTok ainda não foi autorizado. Rode "node app/tiktok.js lusia --link".');
  if (t.refresh_expira_em && t.refresh_expira_em < agora) throw new ErroFatal('A autorização do TikTok venceu (1 ano). Autorize de novo com --link.');
  if (t.expira_em - agora > 10 * 60 * 1000) return t.access_token;
  const novo = await pedirToken(seg, { grant_type: 'refresh_token', refresh_token: t.refresh_token }, fetchFn, agora);
  t = { ...t, ...novo, refresh_token: novo.refresh_token || t.refresh_token };
  salvarCofre(pastaConta, seg.tiktokSecret, t);
  return t.access_token;
}

// ---------- Chamadas da API ----------
async function api(token, caminho, corpo, fetchFn = fetch) {
  let ultimo;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    let resp, json;
    try {
      resp = await fetchFn(`${HOST}${caminho}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify(corpo || {}),
        signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      });
      json = await resp.json().catch(() => null);
    } catch (e) {
      ultimo = new Error('Sem resposta do TikTok (' + (e.name === 'TimeoutError' ? 'demorou demais' : e.message) + ').');
      if (tentativa < 3) await espera(3000 * tentativa);
      continue;
    }
    const e = (json && json.error) || {};
    if (resp.ok && (!e.code || e.code === 'ok')) return json.data || {};
    if (ERROS[e.code] || resp.status === 401) throw new ErroFatal(ERROS[e.code] || ERROS.access_token_invalid, e.code);
    if (/^spam_risk/.test(e.code || '')) throw new ErroFatal(`O TikTok barrou o envio por segurança (${e.code}).`, e.code);
    ultimo = new Error(`TikTok: ${e.message || e.code || 'HTTP ' + resp.status}`);
    if (resp.status === 429 || resp.status >= 500) {
      if (tentativa < 3) await espera((resp.status === 429 ? 15000 : 3000) * tentativa);
      continue;
    }
    throw ultimo; // erro do pedido (invalid_param...)
  }
  throw ultimo;
}

// Regras oficiais: pedaços de 5 a 64 MB; abaixo de 5 MB vai inteiro; o último pedaço leva a sobra (até 128 MB).
function planoDePedacos(tamanho, pedaco = 10 * MB) {
  if (!tamanho) throw new Error('O vídeo está vazio.');
  if (tamanho > 4 * 1024 * MB) throw new Error('O vídeo passa de 4 GB.');
  if (tamanho < 5 * MB) return { chunkSize: tamanho, total: 1, pedacos: [{ inicio: 0, fim: tamanho - 1 }] };
  const chunkSize = Math.min(64 * MB, Math.max(5 * MB, pedaco));
  const total = Math.max(1, Math.floor(tamanho / chunkSize));
  const pedacos = [];
  for (let i = 0; i < total; i++) pedacos.push({ inicio: i * chunkSize, fim: i === total - 1 ? tamanho - 1 : (i + 1) * chunkSize - 1 });
  return { chunkSize, total, pedacos };
}

// Manda o arquivo em pedaços, na ordem (PUT no upload_url, que vale 1 hora).
async function enviarArquivo(uploadUrl, buffer, plano, fetchFn = fetch, tipo = 'video/mp4') {
  for (let i = 0; i < plano.pedacos.length; i++) {
    const { inicio, fim } = plano.pedacos[i];
    const parte = buffer.subarray(inicio, fim + 1);
    const ultimo = i === plano.pedacos.length - 1;
    let ok = false;
    for (let tentativa = 1; tentativa <= 3 && !ok; tentativa++) {
      let resp;
      try {
        resp = await fetchFn(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': tipo, 'Content-Length': String(parte.length), 'Content-Range': `bytes ${inicio}-${fim}/${buffer.length}` },
          body: parte,
          signal: AbortSignal.timeout(5 * TEMPO_LIMITE_MS),
        });
      } catch (e) {
        if (tentativa === 3) throw new Error('A internet caiu no meio do envio do vídeo.');
        await espera(3000 * tentativa);
        continue;
      }
      if (resp.status === 206 || resp.status === 201 || resp.status === 200) ok = true;
      else if (resp.status === 403) throw new Error('O endereço de envio do TikTok venceu (vale 1 hora).');
      else if (resp.status >= 500 && tentativa < 3) await espera(3000 * tentativa);
      else throw new Error(`O TikTok recusou o pedaço ${i + 1} de ${plano.pedacos.length} do vídeo (HTTP ${resp.status}).`);
      if (ok && ultimo && resp.status === 206) throw new Error('O TikTok ainda espera mais pedaços do vídeo (tamanho errado?).');
    }
  }
}

async function infoCriador(token, fetchFn = fetch) {
  return api(token, '/v2/post/publish/creator_info/query/', {}, fetchFn);
}

// Espera o TikTok processar. Rascunho termina em SEND_TO_USER_INBOX; direto em PUBLISH_COMPLETE.
async function esperarStatus(token, publishId, fetchFn = fetch, intervalo = 5000, maxTentativas = 36) {
  let ultimo = 'PROCESSANDO';
  for (let i = 0; i < maxTentativas; i++) {
    const d = await api(token, '/v2/post/publish/status/fetch/', { publish_id: publishId }, fetchFn);
    ultimo = d.status || ultimo;
    if (d.status === 'SEND_TO_USER_INBOX' || d.status === 'PUBLISH_COMPLETE') return { status: d.status, postId: (d.publicaly_available_post_id || [])[0] };
    if (d.status === 'FAILED') {
      const motivo = FALHAS[d.fail_reason] || d.fail_reason || 'sem motivo';
      const erro = new Error(`O TikTok não aceitou o vídeo: ${motivo}.`);
      if (d.fail_reason === 'auth_removed' || /^spam_risk/.test(d.fail_reason || '')) throw new ErroFatal(erro.message, d.fail_reason);
      throw erro;
    }
    await espera(intervalo);
  }
  return { status: ultimo }; // ainda processando: o TikTok termina sozinho
}

// Manda 1 vídeo. Devolve { publishId, status }.
async function enviarVideo(token, arquivo, legenda, opcoes = {}, fetchFn = fetch, intervalo) {
  const o = { ...PADRAO, ...opcoes };
  const buffer = fs.readFileSync(arquivo);
  const plano = planoDePedacos(buffer.length);
  const source_info = { source: 'FILE_UPLOAD', video_size: buffer.length, chunk_size: plano.chunkSize, total_chunk_count: plano.total };
  let init;
  if (o.modo === 'direto') {
    const c = await infoCriador(token, fetchFn);
    const opcoesPriv = c.privacy_level_options || [];
    if (!opcoesPriv.includes(o.privacidade)) {
      throw new ErroFatal(`O TikTok não aceita a privacidade "${o.privacidade}" para @${c.creator_username || '?'} agora (aceita: ${opcoesPriv.join(', ') || 'nenhuma'}).`, 'privacy_level_option_mismatch');
    }
    if (o.duracaoSeg && c.max_video_post_duration_sec && o.duracaoSeg > c.max_video_post_duration_sec) {
      throw new Error(`O vídeo é mais longo que o permitido (${c.max_video_post_duration_sec}s).`);
    }
    init = await api(token, '/v2/post/publish/video/init/', {
      post_info: {
        title: legenda,
        privacy_level: o.privacidade,
        disable_comment: !o.permitirComentarios || !!c.comment_disabled,
        disable_duet: !o.permitirDueto || !!c.duet_disabled,
        disable_stitch: !o.permitirCostura || !!c.stitch_disabled,
        brand_content_toggle: !!o.conteudoPago,
        brand_organic_toggle: !!o.suaMarca,
        is_aigc: !!o.ia,
      },
      source_info,
    }, fetchFn);
  } else {
    init = await api(token, '/v2/post/publish/inbox/video/init/', { source_info }, fetchFn);
  }
  if (!init.publish_id || !init.upload_url) throw new Error('O TikTok não devolveu o endereço para enviar o vídeo.');
  await enviarArquivo(init.upload_url, buffer, plano, fetchFn);
  const s = await esperarStatus(token, init.publish_id, fetchFn, intervalo);
  return { publishId: init.publish_id, ...s };
}

// ---------- Fila: quais vídeos mandar agora ----------
// Pasta: <pasta>/<AAAA-MM-DD>/<hora>-video[-aquecimento|-sacolinha].mp4 + <hora>-legenda.txt (saída do aquecimento-tiktok.js).
// Manda só os de HOJE cuja hora já chegou e que ainda não foram mandados (vídeo atrasado de outro dia não vai).
const AVISO_IA = /\n*\(Ao postar: ligar "Conteúdo gerado por IA"\)\s*$/;
function lerLegenda(arq) {
  const bruto = fs.existsSync(arq) ? fs.readFileSync(arq, 'utf8').replace(/^﻿/, '').trim() : '';
  const ia = AVISO_IA.test(bruto);
  const legenda = bruto.replace(AVISO_IA, '').trim();
  if (/shopee|xopi|link na bio|@achadinhoabessa/i.test(legenda)) throw new Error('legenda do TikTok misturou plataforma: ' + legenda.split('\n')[0]);
  return { legenda, ia };
}

function videosDaVez(pastaFila, agora = new Date(), feitos = {}, limite = 1) {
  const data = agora.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const horaAgora = Number(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hourCycle: 'h23' }));
  const pastaDia = path.join(pastaFila, data);
  if (!fs.existsSync(pastaDia)) return [];
  return fs
    .readdirSync(pastaDia)
    .map((f) => f.match(/^(\d{1,2})h-video(?:-(?:aquecimento|sacolinha))?\.mp4$/))
    .filter(Boolean)
    .map((m) => ({ hora: Number(m[1]), nome: m[0], chave: `${data}/${m[0]}` }))
    .filter((v) => v.hora <= horaAgora && !feitos[v.chave])
    .sort((a, b) => a.hora - b.hora)
    .slice(0, limite)
    .map((v) => ({ ...v, arquivo: path.join(pastaDia, v.nome), ...lerLegenda(path.join(pastaDia, `${v.hora}h-legenda.txt`)) }));
}

function configTikTok(pastaConta, conta) {
  const c = { ...PADRAO, ...(maquina.lerConfig(pastaConta).tiktok || {}) };
  c.pastaFila = path.resolve(RAIZ, c.pasta.replace('{conta}', conta));
  return c;
}

// Rodada do robô.
async function publicar(conta, { fetchFn = fetch, agora = new Date(), simular = false, segredos, log = console.log, intervalo } = {}) {
  const pastaConta = path.join(RAIZ, 'contas', conta);
  const cfg = configTikTok(pastaConta, conta);
  if (!cfg.ativo && !simular) {
    log('TikTok: desligado no config (tiktok.ativo = false). Nada foi enviado.');
    return { enviados: 0 };
  }
  const arqFeitos = path.join(pastaConta, 'tiktok-publicados.json');
  const feitos = fs.existsSync(arqFeitos) ? JSON.parse(fs.readFileSync(arqFeitos, 'utf8')) : {};
  const fila = videosDaVez(cfg.pastaFila, agora, feitos, cfg.porRodada);
  if (!fila.length) {
    log('TikTok: nenhum vídeo na vez agora.');
    return { enviados: 0 };
  }
  if (simular) {
    log(`SIMULAÇÃO (modo ${cfg.modo}): mandaria ${fila.length} vídeo(s):`);
    for (const v of fila) log(`  - ${v.chave}${v.ia ? ' (IA)' : ''}\n${v.legenda.replace(/^/gm, '      ')}`);
    return { enviados: 0, fila };
  }
  const seg = segredos || maquina.lerSegredos(pastaConta);
  const token = await tokenValido(pastaConta, seg, fetchFn, agora.getTime());
  let enviados = 0;
  for (const v of fila) {
    try {
      const r = await enviarVideo(token, v.arquivo, v.legenda, { ...cfg, ia: v.ia }, fetchFn, intervalo);
      feitos[v.chave] = { publishId: r.publishId, status: r.status, modo: cfg.modo, quando: agora.toISOString() };
      fs.writeFileSync(arqFeitos, JSON.stringify(feitos, null, 2) + '\n');
      enviados++;
      log(cfg.modo === 'direto' ? `  publicado no TikTok: ${v.chave} (${r.status})` : `  na caixa de entrada do TikTok: ${v.chave} (${r.status})`);
    } catch (e) {
      if (e instanceof ErroFatal) throw e;
      log(`  aviso: não mandei ${v.chave}: ${e.message}`);
    }
  }
  log(`TikTok: ${enviados} vídeo(s) enviados.`);
  return { enviados };
}

// Lê a área de transferência do Windows sem mostrar nada na tela.
function lerAreaDeTransferencia() {
  const { execFileSync } = require('child_process');
  return execFileSync('powershell', ['-NoProfile', '-Command', 'Get-Clipboard -Raw'], { encoding: 'utf8' }).trim();
}

async function linhaDeComando(a) {
  const conta = a[0] && !a[0].startsWith('--') ? a[0] : 'lusia';
  const pastaConta = path.join(RAIZ, 'contas', conta);
  const config = maquina.lerConfig(pastaConta);
  const cfg = configTikTok(pastaConta, conta);
  const redirectUri = cfg.redirectUri || `${config.site.urlBase}/tiktok-retorno.html`;
  const seg = maquina.lerSegredos(pastaConta);
  if (a.includes('--link')) {
    if (!seg.tiktokKey) throw new Error('Falta o TIKTOK_CLIENT_KEY no CHAVES.txt.');
    console.log('Abra este link logada no TikTok @shopabessa e toque em Autorizar:\n\n' + linkDeAutorizacao({ clientKey: seg.tiktokKey, redirectUri, escopos: cfg.escopos }) + '\n\nDepois copie o código que aparecer e rode: node app/tiktok.js ' + conta + ' --codigo');
  } else if (a.includes('--codigo')) {
    let codigo = lerAreaDeTransferencia();
    const m = codigo.match(/[?&]code=([^&\s]+)/); // se ela copiou o endereço inteiro
    if (m) codigo = m[1];
    if (!codigo || /\s/.test(codigo)) throw new Error('A área de transferência não tem o código. Toque em "Copiar código" na página do TikTok e rode de novo.');
    const t = await trocarCodigo(seg, codigo, redirectUri);
    salvarCofre(pastaConta, seg.tiktokSecret, t);
    console.log(`Pronto! TikTok conectado (permissões: ${t.escopos}). A autorização vale até ${new Date(t.refresh_expira_em).toLocaleDateString('pt-BR')}.`);
  } else if (a.includes('--checar')) {
    const token = await tokenValido(pastaConta, seg);
    const t = lerCofre(pastaConta, seg.tiktokSecret);
    let quem = '';
    try {
      const c = await infoCriador(token);
      quem = ` como @${c.creator_username} (${c.creator_nickname}); privacidades aceitas: ${(c.privacy_level_options || []).join(', ')}`;
    } catch (e) {
      quem = ` (não consegui ler o perfil: ${e.message})`;
    }
    console.log(`TikTok conectado${quem}. Permissões: ${t.escopos}. Autorização vence em ${new Date(t.refresh_expira_em).toLocaleDateString('pt-BR')}. Ligado: ${cfg.ativo ? 'sim' : 'NÃO'} (modo ${cfg.modo}).`);
  } else {
    await publicar(conta, { simular: a.includes('--simular') });
  }
}

if (require.main === module) {
  linhaDeComando(process.argv.slice(2)).catch((e) => {
    console.error('ERRO: ' + e.message);
    process.exitCode = 1;
  });
}

module.exports = {
  ErroFatal,
  PADRAO,
  trancar,
  destrancar,
  lerCofre,
  salvarCofre,
  linkDeAutorizacao,
  trocarCodigo,
  tokenValido,
  planoDePedacos,
  enviarArquivo,
  enviarVideo,
  esperarStatus,
  videosDaVez,
  lerLegenda,
  publicar,
};
