// Publica no Instagram pelo caminho OFICIAL (Instagram API com login do Instagram).
// Precisa de: conta profissional, um token (INSTAGRAM_TOKEN) e o ID da conta (INSTAGRAM_USER_ID).
// As imagens precisam estar num endereço público (o site da máquina) e ser JPEG.
const HOST = 'https://graph.instagram.com';
const VERSAO = 'v25.0';
const TEMPO_LIMITE_MS = 30000;

class ErroFatal extends Error {
  constructor(msg, codigo) {
    super(msg);
    this.codigo = codigo;
  }
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function chamar(cred, metodo, caminho, params = {}, fetchFn = fetch) {
  const url = new URL(`${HOST}/${VERSAO}/${caminho}`);
  const corpo = new URLSearchParams({ ...params, access_token: cred.token });
  let ultimoErro;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      const resp =
        metodo === 'GET'
          ? await fetchFn(url + '?' + corpo, { signal: AbortSignal.timeout(TEMPO_LIMITE_MS) })
          : await fetchFn(url, { method: 'POST', body: corpo, signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
      const json = await resp.json().catch(() => null);
      if (resp.ok && json && !json.error) return json;
      const e = (json && json.error) || {};
      // 190 = token vencido ou inválido; 10/200 = sem permissão: não adianta tentar de novo
      if ([190, 10, 200].includes(e.code)) {
        throw new ErroFatal(
          e.code === 190
            ? 'O token do Instagram venceu ou está errado. Gere um novo e troque no CHAVES.txt.'
            : `O Instagram negou permissão (código ${e.code}${e.error_subcode ? '/' + e.error_subcode : ''}). Confira se a conta é profissional e se o app tem as permissões de publicar, comentários e mensagens.`,
          e.code
        );
      }
      ultimoErro = new Error(`Instagram: ${e.message || 'HTTP ' + resp.status}${e.code ? ` (código ${e.code})` : ''}`);
      if (resp.status >= 400 && resp.status < 500 && e.code !== 4 && e.code !== 9) throw ultimoErro; // erro do pedido
    } catch (e) {
      if (e instanceof ErroFatal || (e.message || '').startsWith('Instagram:')) throw e;
      ultimoErro = e.name === 'TimeoutError' ? new Error('O Instagram demorou demais para responder.') : e;
    }
    if (tentativa < 3) await espera(3000 * tentativa);
  }
  throw ultimoErro;
}

// Espera o Instagram terminar de preparar a imagem (status FINISHED)
async function esperarPronto(cred, idContainer, fetchFn, intervalo = 3000, maxTentativas = 40) {
  for (let i = 0; i < maxTentativas; i++) {
    const r = await chamar(cred, 'GET', idContainer, { fields: 'status_code' }, fetchFn);
    if (r.status_code === 'FINISHED') return;
    if (r.status_code === 'ERROR' || r.status_code === 'EXPIRED') {
      throw new Error(`O Instagram não aceitou a imagem (${r.status_code}). Ela precisa ser JPEG e estar no ar.`);
    }
    await espera(intervalo);
  }
  throw new Error('O Instagram demorou demais para preparar a imagem.');
}

async function limiteDeHoje(cred, fetchFn) {
  try {
    const r = await chamar(cred, 'GET', `${cred.userId}/content_publishing_limit`, { fields: 'quota_usage,config' }, fetchFn);
    const d = r.data && r.data[0];
    return d ? { usados: d.quota_usage || 0, total: (d.config && d.config.quota_total) || 100 } : null;
  } catch (e) {
    if (e instanceof ErroFatal) throw e;
    return null; // se não der para saber, segue (o próprio Instagram barra se passar)
  }
}

// Post com 1 imagem. Devolve o ID do post publicado.
async function publicarImagem(cred, urlImagem, legenda, fetchFn = fetch, intervalo) {
  const c = await chamar(cred, 'POST', `${cred.userId}/media`, { image_url: urlImagem, caption: legenda }, fetchFn);
  await esperarPronto(cred, c.id, fetchFn, intervalo);
  const p = await chamar(cred, 'POST', `${cred.userId}/media_publish`, { creation_id: c.id }, fetchFn);
  return p.id;
}

// Carrossel com 2 a 10 imagens (conta como 1 post no limite do dia).
async function publicarCarrossel(cred, urlsImagens, legenda, fetchFn = fetch, intervalo) {
  const urls = urlsImagens.slice(0, 10);
  if (urls.length < 2) return publicarImagem(cred, urls[0], legenda, fetchFn, intervalo);
  const filhos = [];
  for (const u of urls) {
    const c = await chamar(cred, 'POST', `${cred.userId}/media`, { image_url: u, is_carousel_item: 'true' }, fetchFn);
    filhos.push(c.id);
  }
  for (const id of filhos) await esperarPronto(cred, id, fetchFn, intervalo);
  const pai = await chamar(
    cred,
    'POST',
    `${cred.userId}/media`,
    { media_type: 'CAROUSEL', children: filhos.join(','), caption: legenda },
    fetchFn
  );
  await esperarPronto(cred, pai.id, fetchFn, intervalo);
  const p = await chamar(cred, 'POST', `${cred.userId}/media_publish`, { creation_id: pai.id }, fetchFn);
  return p.id;
}

// Story com 1 imagem (sem legenda; o link fica na bio).
async function publicarStory(cred, urlImagem, fetchFn = fetch, intervalo) {
  const c = await chamar(cred, 'POST', `${cred.userId}/media`, { image_url: urlImagem, media_type: 'STORIES' }, fetchFn);
  await esperarPronto(cred, c.id, fetchFn, intervalo);
  const p = await chamar(cred, 'POST', `${cred.userId}/media_publish`, { creation_id: c.id }, fetchFn);
  return p.id;
}

// O token dura 60 dias. Renovar estende o prazo (precisa ter mais de 24h de vida).
async function renovarToken(cred, fetchFn = fetch) {
  const url = `${HOST}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(cred.token)}`;
  const r = await fetchFn(url, { signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
  const json = await r.json().catch(() => null);
  if (!r.ok || !json || !json.access_token) throw new Error('Não consegui renovar o token do Instagram.');
  return { token: json.access_token, expiraEmDias: Math.floor((json.expires_in || 0) / 86400) };
}

// ---------- Comentários e direct (resposta automática "comentou QUERO, recebe o link") ----------
// Precisam das permissões instagram_business_manage_comments e instagram_business_manage_messages.

// Posts recentes da conta: [{ id, timestamp, caption }]
async function postsRecentes(cred, limite = 25, fetchFn = fetch) {
  const r = await chamar(cred, 'GET', `${cred.userId}/media`, { fields: 'id,timestamp,caption', limit: String(limite) }, fetchFn);
  return r.data || [];
}

// Comentários de um post: [{ id, text, timestamp, from: { id, username } }]
async function comentarios(cred, idPost, fetchFn = fetch) {
  const r = await chamar(cred, 'GET', `${idPost}/comments`, { fields: 'id,text,timestamp,username,from', limit: '50' }, fetchFn);
  return r.data || [];
}

// "Resposta privada": manda 1 mensagem no direct de quem comentou (vale até 7 dias depois do comentário)
async function responderNoDirect(cred, idComentario, texto, fetchFn = fetch) {
  return chamar(
    cred,
    'POST',
    `${cred.userId}/messages`,
    { recipient: JSON.stringify({ comment_id: idComentario }), message: JSON.stringify({ text: texto }) },
    fetchFn
  );
}

// Resposta pública embaixo do comentário ("Te mandei no direct! 💌")
async function responderComentario(cred, idComentario, texto, fetchFn = fetch) {
  return chamar(cred, 'POST', `${idComentario}/replies`, { message: texto }, fetchFn);
}

module.exports = { postsRecentes, comentarios, responderNoDirect, responderComentario, publicarImagem, publicarCarrossel, publicarStory, limiteDeHoje, renovarToken, ErroFatal };
