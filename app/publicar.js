// PUBLICADOR DO INSTAGRAM
// Uso:  node app/publicar.js <conta> [--simular]
// Lê as ofertas que a máquina preparou hoje (publico/<conta>/<dia>/dados.json) e publica.
// --simular: mostra o que publicaria, sem publicar nada. --conferir-token (com --simular): testa a chave só lendo (GET /me).
const fs = require('fs');
const path = require('path');
const instagram = require('./instagram');
const maquina = require('./maquina');
const carrosseis = require('./carrosseis');
const reels = require('./reels');
const { enviarTelegram } = require('./conferencia');

const RAIZ = path.join(__dirname, '..');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// Antes de publicar, confere se a arte (ou o vídeo do Reel) já está no ar (o site pode levar alguns minutos para atualizar)
async function arteNoAr(url, fetchFn, tentativas = 10, intervalo = 30000, aceita = 'jpeg') {
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetchFn(url, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
      const tipo = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
      if (r.ok && (!tipo || tipo.includes(aceita))) return true;
    } catch {}
    if (i < tentativas - 1) await espera(intervalo);
  }
  return false;
}

// TRAVA DE CONTA (pedido da dona: nada de bagunça entre os projetos)
// - conta com "idDaConta" no config só publica nesse ID do Instagram;
// - conta educativa sem "idDaConta" não publica;
// - nenhuma conta publica no ID que outra conta declarou como dela.
function conferirConta(conta, config, userId, raiz = RAIZ) {
  const ig = (config && config.instagram) || {};
  const id = String(userId || '');
  if (config && config.tipo === 'educativo' && !ig.idDaConta) {
    throw new instagram.ErroFatal(`A conta "${conta}" é educativa e precisa de "idDaConta" no config.json. Nada publicado.`);
  }
  if (ig.idDaConta && String(ig.idDaConta) !== id) {
    throw new instagram.ErroFatal(`A chave do Instagram não é da conta "${conta}" (ID diferente do "idDaConta"). Nada publicado.`);
  }
  const pastaContas = path.join(raiz, 'contas');
  for (const outra of fs.existsSync(pastaContas) ? fs.readdirSync(pastaContas) : []) {
    if (outra === conta) continue;
    let c;
    try {
      c = JSON.parse(fs.readFileSync(path.join(pastaContas, outra, 'config.json'), 'utf8'));
    } catch {
      continue;
    }
    const idOutra = c && c.instagram && c.instagram.idDaConta;
    if (idOutra && String(idOutra) === id) {
      throw new instagram.ErroFatal(`A chave usada pela conta "${conta}" é da conta "${outra}". Nada publicado.`);
    }
  }
}

async function publicar(conta, { simular = false, fetchFn = fetch, intervaloNoAr, intervaloStatus, log = console.log, dia: diaForcado, ignorarDesligado = false, segredos, arqPublicados: arqForcado, conferirToken = false, agora = new Date(), filaReels: filaReelsForcada } = {}) {
  const pastaConta = path.join(RAIZ, 'contas', conta);
  const config = maquina.lerConfig(pastaConta);
  const ig = config.instagram || {};
  // Conta educativa (helena): só a fila de carrosséis dela; nunca ofertas, stories ou posts de venda
  const educativa = config.tipo === 'educativo';
  if (!ig.ativo && !simular && !ignorarDesligado) {
    log('Instagram desligado no config.json ("ativo": false). Nada publicado.');
    return { publicados: 0 };
  }

  const pastaPublica = path.join(RAIZ, 'publico', conta);
  const arqHoje = path.join(pastaPublica, 'hoje.txt');
  // Ofertas do dia (podem não existir: sem chaves/lista da Shopee ainda) + posts de conteúdo da fila
  const dia = educativa ? '' : diaForcado || (fs.existsSync(arqHoje) ? fs.readFileSync(arqHoje, 'utf8').trim() : '');
  const arqDados = dia ? path.join(pastaPublica, dia, 'dados.json') : '';
  const dados = arqDados && fs.existsSync(arqDados) ? JSON.parse(fs.readFileSync(arqDados, 'utf8')) : { ofertas: [] };
  let filaConteudo = [];
  try {
    filaConteudo = JSON.parse(fs.readFileSync(path.join(pastaPublica, 'conteudo', 'fila.json'), 'utf8')) || [];
  } catch {}
  if (educativa) filaConteudo = [];
  const filaCarrosseis = educativa ? carrosseis.lerFila(conta) : [];
  // Reels com dia e hora marcados (os mesmos do TikTok). Conta educativa não tem.
  // filaReels (opção): os testes da conta real passam uma fila própria e nunca leem a de verdade
  const filaReels = educativa ? [] : filaReelsForcada || reels.lerFila(conta);
  if (!dados.ofertas.length && !filaConteudo.length && !filaCarrosseis.length && !filaReels.length) {
    log('Nenhuma oferta nem post de conteúdo para publicar.');
    return { publicados: 0 };
  }

  const base = String(config.site.urlBase || '').replace(/\/+$/, '');
  if (!base && !simular) throw new Error('Falta o endereço do site ("urlBase" no config.json).');
  const urlArte = (o) => `${base}/${encodeURI(conta)}/${o.arte}`;

  // arqPublicados (opção): o teste usa um arquivo temporário e nunca mexe no publicados.json de verdade
  const arqPublicados = arqForcado || path.join(pastaConta, 'publicados.json');
  let feitos = {};
  try {
    feitos = JSON.parse(fs.readFileSync(arqPublicados, 'utf8')) || {};
  } catch {}
  const marcar = (chave, id) => {
    feitos[chave] = { id, quando: new Date().toISOString() };
    fs.writeFileSync(arqPublicados + '.tmp', JSON.stringify(feitos, null, 2));
    fs.renameSync(arqPublicados + '.tmp', arqPublicados);
  };

  // Lista do que publicar nesta rodada
  const tarefas = [];
  // REELS primeiro (pedido de 27/10): saem no dia e hora marcados; até 1 dia de atraso, nunca mais velho que isso
  const { prontos: reelsAgora, atrasados: reelsAtrasados } = reels.devidos(filaReels, feitos, agora);
  for (const r of reelsAgora) {
    tarefas.push({ chave: `reel:${r.id}`, tipo: 'reel', urls: [`${base}/${encodeURI(conta)}/${r.video}`], legenda: r.legenda, reel: r });
  }
  if (ig.modo === 'carrossel' && dados.ofertas.length && !feitos[`${dia}:carrossel`]) {
    tarefas.push({ chave: `${dia}:carrossel`, tipo: 'carrossel', urls: dados.ofertas.map(urlArte), legenda: dados.legendaCarrossel });
  }
  const individuais = ig.modo === 'individual' ? dados.ofertas.length : Number(ig.postsIndividuaisPorRodada) || 0;
  dados.ofertas
    .filter((o) => !feitos[`${dia}:post:${o.itemId}`])
    .slice(0, individuais)
    .forEach((o) => tarefas.push({ chave: `${dia}:post:${o.itemId}`, tipo: 'post', urls: [urlArte(o)], legenda: o.legendaInstagram }));
  // Posts de conteúdo (sem venda): no máximo "conteudoPorDia" por dia (padrão 1), cada um uma vez só, na ordem da fila
  const hojeBR = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const diaDe = (iso) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  // Só no horário de pico (pessoas em casa rolando o feed): a partir de "conteudoAPartirDas" (padrão 19h, Brasília)
  const horaBR = Number(new Date().toLocaleString('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }));
  const aPartir = ig.conteudoAPartirDas === undefined ? 19 : Number(ig.conteudoAPartirDas);
  // Reel no mesmo horário tem prioridade: nesta rodada a foto de conteúdo fica para a próxima
  const porDia = reelsAgora.length || horaBR < aPartir ? 0 : ig.conteudoPorDia === undefined ? 1 : Number(ig.conteudoPorDia) || 0;
  const jaHoje = Object.entries(feitos).filter(([k, v]) => k.startsWith('conteudo:') && v && v.quando && diaDe(v.quando) === hojeBR).length;
  filaConteudo
    .filter((c) => c && c.slug && c.arte && c.legenda && !feitos[`conteudo:${c.slug}`])
    // "conteudoPorRodada": no máximo N por rodada (12h, 18h, 20h), para espalhar os posts ao longo do dia
    .slice(0, Math.max(0, Math.min(porDia - jaHoje, ig.conteudoPorRodada === undefined ? Infinity : Number(ig.conteudoPorRodada) || 0)))
    .forEach((c) => tarefas.push({ chave: `conteudo:${c.slug}`, tipo: 'post', urls: [urlArte(c)], legenda: c.legenda, local: path.join(pastaPublica, c.arte) }));
  // Carrossel educativo: o 1º da fila ainda não publicado, 1 por dia, a partir das 19h (simulação ignora a hora)
  const prox = educativa
    ? carrosseis.proximo(filaCarrosseis, feitos, { hojeBR, horaBR, aPartirDas: ig.carrosselAPartirDas === undefined ? 19 : Number(ig.carrosselAPartirDas), porDia: ig.carrosselPorDia === undefined ? 1 : Number(ig.carrosselPorDia) || 0, comecaEm: ig.carrosselComecaEm, ignorarHora: simular })
    : null;
  if (prox) {
    tarefas.push({ chave: `carrossel:${prox.slug}`, tipo: 'carrossel', urls: prox.imagens.map((i) => `${base}/${encodeURI(conta)}/${i}`), legenda: prox.legenda, item: prox });
  }
  if (ig.stories && !educativa) {
    dados.ofertas
      .slice(0, 3)
      .filter((o) => !feitos[`${dia}:story:${o.itemId}`])
      .forEach((o) => tarefas.push({ chave: `${dia}:story:${o.itemId}`, tipo: 'story', urls: [urlArte(o)] }));
  }

  // Reel que passou mais de 1 dia do horário (a rodada falhou): NÃO posta velho, avisa no Telegram (1 vez)
  if (reelsAtrasados.length && !simular) {
    const seg = segredos || maquina.lerSegredos(pastaConta);
    const lista = reelsAtrasados.map((r) => `- ${r.data.split('-').reverse().slice(0, 2).join('/')} ${r.hora}h: ${r.origem || r.video}`).join('\n');
    const texto = `⚠️ Reels do Instagram que NÃO saíram no horário (passou de 1 dia, não postei atrasado):\n${lista}\nSe quiser, ponha de novo na fila com data nova (node app/fila-reels.js).`;
    log(texto);
    await avisar(seg, texto, fetchFn, log);
    for (const r of reelsAtrasados) marcar(`aviso:reel:${r.id}`, null);
  }

  if (!tarefas.length) {
    log('Tudo de hoje já foi publicado.');
    const proxReel = filaReels.find((r) => !feitos[`reel:${r.id}`] && reels.momento(r) > agora);
    if (proxReel) log(`Próximo Reel: ${proxReel.data} às ${proxReel.hora}h (${proxReel.video}).`);
    if (!simular && !arqForcado) limparReels(conta, filaReels, feitos, agora, log);
    return { publicados: 0 };
  }

  if (simular) {
    log(`SIMULAÇÃO: publicaria ${tarefas.length} item(ns):`);
    for (const t of tarefas) log(`  - ${t.tipo} com ${t.urls.length} ${t.tipo === 'reel' ? 'vídeo' : 'imagem(ns)'}${t.legenda ? `\n${t.legenda.replace(/^/gm, '      ')}` : ''}`);
    if (filaReels.length) {
      log(`Fila de Reels (${filaReels.length}), cada um no seu dia e hora:`);
      for (const r of filaReels) {
        const prob = reels.problemasItem(r, RAIZ, conta);
        const est = feitos[`reel:${r.id}`] ? 'já publicado' : feitos[`aviso:reel:${r.id}`] ? 'passou do prazo' : reelsAgora.includes(r) ? 'sai AGORA' : 'esperando';
        log(`  ${r.data} ${r.hora}h ${r.video} (${est})${prob.length && est !== 'já publicado' ? ' PROBLEMA: ' + prob.join('; ') : ''}`);
      }
    }
    if (educativa) {
      log(`Fila de carrosséis (${filaCarrosseis.length}), na ordem, 1 por dia a partir das ${ig.carrosselAPartirDas === undefined ? 19 : ig.carrosselAPartirDas}h:`);
      for (const [i, c] of filaCarrosseis.entries()) {
        const prob = await carrosseis.conferirItem(conta, c);
        log(`  ${i + 1}) ${c.slug}: ${c.imagens.length} slides${feitos[`carrossel:${c.slug}`] ? ' (já publicado)' : ''} - ${prob.length ? 'PROBLEMA: ' + prob.join('; ') : 'conferido (1080x1350, sem palavras de venda)'}`);
        for (const u of c.imagens) log(`       ${base}/${encodeURI(conta)}/${u}`);
      }
    }
    // --conferir-token: só LEITURA (GET /me), confere se a chave é desta conta. Nunca publica.
    if (conferirToken) {
      const seg = segredos || maquina.lerSegredos(pastaConta);
      if (!seg.igToken || !seg.igUserId) log('Sem token/ID desta conta (CHAVES.txt ou Secrets com o nome da conta).');
      else {
        conferirConta(conta, config, seg.igUserId);
        log(`Iria para o Instagram ID ${seg.igUserId} (confere com o "idDaConta" do config: ${ig.idDaConta ? 'sim' : 'sem idDaConta'}).`);
        const r = await fetchFn(`https://graph.instagram.com/v25.0/me?fields=user_id,username&access_token=${encodeURIComponent(seg.igToken)}`, { signal: AbortSignal.timeout(30000) });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j || j.error) log(`Token: NÃO funcionou (${(j && j.error && j.error.message) || 'HTTP ' + r.status}).`);
        else log(`Token: funcionando, conta @${j.username}, ID ${j.user_id}${String(j.user_id) === String(seg.igUserId) ? ' (igual ao ID)' : ' (DIFERENTE do ID!)'}.`);
      }
    }
    return { publicados: 0, tarefas };
  }

  const { igToken: token, igUserId: userId } = segredos || maquina.lerSegredos(pastaConta);
  if (!token || !userId) throw new Error('Falta o INSTAGRAM_TOKEN e o INSTAGRAM_USER_ID no CHAVES.txt (ou nos Secrets do GitHub).');
  conferirConta(conta, config, userId);
  const cred = { token, userId };

  const limite = await instagram.limiteDeHoje(cred, fetchFn);
  let livres = limite ? limite.total - limite.usados : Infinity;
  if (limite) log(`Instagram: ${limite.usados} de ${limite.total} publicações usadas nas últimas 24h.`);

  let publicados = 0;
  for (const t of tarefas) {
    if (livres <= 0) {
      log('Limite de publicações do Instagram atingido. O resto fica para a próxima rodada.');
      break;
    }
    try {
      // NADA CORTADO (pedido de 24/10): arte fora de 1080x1350 o Instagram corta, então não posta
      if (t.local) {
        const m = await require('sharp')(t.local).metadata();
        if (m.width !== 1080 || m.height !== 1350) throw new Error(`arte ${path.basename(t.local)} em ${m.width}x${m.height}, o Instagram cortaria (precisa 1080x1350)`);
      }
      // Carrossel educativo: confere de novo imagens (1080x1350 JPEG) e legenda (sem palavras de venda)
      if (t.item) {
        const prob = await carrosseis.conferirItem(conta, t.item);
        if (prob.length) throw new Error(`carrossel ${t.item.slug} barrado: ${prob.join('; ')}`);
      }
      // Reel: confere de novo a legenda (sem link/carrinho/sacolinha/#publi) e se o vídeo existe
      if (t.reel) {
        const prob = reels.problemasItem(t.reel, RAIZ, conta);
        if (prob.length) throw new Error(`Reel ${t.reel.id} barrado: ${prob.join('; ')}`);
      }
      for (const u of t.urls) {
        if (!(await arteNoAr(u, fetchFn, intervaloNoAr ? 3 : 10, intervaloNoAr, t.reel ? 'video' : 'jpeg'))) throw new Error(`${t.reel ? 'o vídeo' : 'a arte'} não está no ar: ${u}`);
      }
      let id;
      if (t.tipo === 'reel') id = await instagram.publicarReel(cred, t.urls[0], t.legenda, fetchFn, intervaloStatus);
      else if (t.tipo === 'carrossel') id = await instagram.publicarCarrossel(cred, t.urls, t.legenda, fetchFn, intervaloStatus);
      else if (t.tipo === 'post') id = await instagram.publicarImagem(cred, t.urls[0], t.legenda, fetchFn, intervaloStatus);
      else id = await instagram.publicarStory(cred, t.urls[0], fetchFn, intervaloStatus);
      marcar(t.chave, id);
      publicados++;
      livres--;
      log(`  publicado: ${t.tipo} (id ${id})`);
    } catch (e) {
      if (e instanceof instagram.ErroFatal) throw e;
      log(`  aviso: não publiquei ${t.tipo}: ${e.message}`);
      // Reel que falhou: a dona fica sabendo (a próxima rodada tenta de novo, até 1 dia depois do horário)
      if (t.reel) await avisar(segredos || maquina.lerSegredos(pastaConta), `⚠️ O Reel de ${t.reel.data.split('-').reverse().slice(0, 2).join('/')} ${t.reel.hora}h não saiu no Instagram: ${e.message}\nA próxima rodada tenta de novo.`, fetchFn, log);
    }
  }
  log(`Instagram: ${publicados} publicação(ões) feitas.`);
  // Só com o publicados.json de verdade (teste com arquivo temporário nunca apaga vídeo)
  if (!arqForcado) limparReels(conta, filaReels, feitos, agora, log);
  return { publicados };
}

// Aviso pelo Telegram da dona. Sem Telegram, fica só no registro. Nunca quebra a rodada.
async function avisar(seg, texto, fetchFn, log) {
  if (!seg || !seg.telegramToken || !seg.telegramChatId) return log('(Sem Telegram: o aviso ficou só no registro.)');
  try {
    await enviarTelegram(texto, { token: seg.telegramToken, chatId: seg.telegramChatId, fetchFn });
  } catch (e) {
    log('(Não consegui avisar no Telegram: ' + e.message + ')');
  }
}

// Vídeos de dias passados (já publicados ou fora do prazo) saem do site e do repositório (são pesados)
function limparReels(conta, fila, feitos, agora, log) {
  const apagados = reels.limparVelhos(conta, fila, feitos, { agora });
  if (apagados.length) log(`Reels velhos apagados do site: ${apagados.join(', ')}`);
}

if (require.main === module) {
  const conta = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'lusia';
  publicar(conta, { simular: process.argv.includes('--simular'), conferirToken: process.argv.includes('--conferir-token') }).catch((e) => {
    console.error('ERRO: ' + e.message);
    process.exitCode = 1;
  });
}

module.exports = { publicar, conferirConta };
