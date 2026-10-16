// PUBLICADOR DO INSTAGRAM
// Uso:  node app/publicar.js <conta> [--simular]
// Lê as ofertas que a máquina preparou hoje (publico/<conta>/<dia>/dados.json) e publica.
// --simular: mostra o que publicaria, sem publicar nada.
const fs = require('fs');
const path = require('path');
const instagram = require('./instagram');
const maquina = require('./maquina');

const RAIZ = path.join(__dirname, '..');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// Antes de publicar, confere se a arte já está no ar (o site pode levar alguns minutos para atualizar)
async function arteNoAr(url, fetchFn, tentativas = 10, intervalo = 30000) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetchFn(url, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
      const tipo = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
      if (r.ok && (!tipo || tipo.includes('jpeg'))) return true;
    } catch {}
    if (i < tentativas - 1) await espera(intervalo);
  }
  return false;
}

async function publicar(conta, { simular = false, fetchFn = fetch, intervaloNoAr, intervaloStatus, log = console.log, dia: diaForcado, ignorarDesligado = false, segredos } = {}) {
  const pastaConta = path.join(RAIZ, 'contas', conta);
  const config = maquina.lerConfig(pastaConta);
  const ig = config.instagram || {};
  if (!ig.ativo && !simular && !ignorarDesligado) {
    log('Instagram desligado no config.json ("ativo": false). Nada publicado.');
    return { publicados: 0 };
  }

  const pastaPublica = path.join(RAIZ, 'publico', conta);
  const arqHoje = path.join(pastaPublica, 'hoje.txt');
  if (!diaForcado && !fs.existsSync(arqHoje)) throw new Error('A máquina ainda não preparou as ofertas de hoje. Rode a máquina primeiro.');
  const dia = diaForcado || fs.readFileSync(arqHoje, 'utf8').trim();
  const dados = JSON.parse(fs.readFileSync(path.join(pastaPublica, dia, 'dados.json'), 'utf8'));
  if (!dados.ofertas.length) {
    log('Nenhuma oferta hoje. Nada publicado.');
    return { publicados: 0 };
  }

  const base = String(config.site.urlBase || '').replace(/\/+$/, '');
  if (!base && !simular) throw new Error('Falta o endereço do site ("urlBase" no config.json).');
  const urlArte = (o) => `${base}/${encodeURI(conta)}/${o.arte}`;

  const arqPublicados = path.join(pastaConta, 'publicados.json');
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
  if (ig.modo === 'carrossel' && !feitos[`${dia}:carrossel`]) {
    tarefas.push({ chave: `${dia}:carrossel`, tipo: 'carrossel', urls: dados.ofertas.map(urlArte), legenda: dados.legendaCarrossel });
  }
  const individuais = ig.modo === 'individual' ? dados.ofertas.length : Number(ig.postsIndividuaisPorRodada) || 0;
  dados.ofertas
    .filter((o) => !feitos[`${dia}:post:${o.itemId}`])
    .slice(0, individuais)
    .forEach((o) => tarefas.push({ chave: `${dia}:post:${o.itemId}`, tipo: 'post', urls: [urlArte(o)], legenda: o.legendaInstagram }));
  if (ig.stories) {
    dados.ofertas
      .slice(0, 3)
      .filter((o) => !feitos[`${dia}:story:${o.itemId}`])
      .forEach((o) => tarefas.push({ chave: `${dia}:story:${o.itemId}`, tipo: 'story', urls: [urlArte(o)] }));
  }

  if (!tarefas.length) {
    log('Tudo de hoje já foi publicado.');
    return { publicados: 0 };
  }

  if (simular) {
    log(`SIMULAÇÃO: publicaria ${tarefas.length} item(ns):`);
    for (const t of tarefas) log(`  - ${t.tipo} com ${t.urls.length} imagem(ns)${t.legenda ? `\n${t.legenda.replace(/^/gm, '      ')}` : ''}`);
    return { publicados: 0, tarefas };
  }

  const { igToken: token, igUserId: userId } = segredos || maquina.lerSegredos(pastaConta);
  if (!token || !userId) throw new Error('Falta o INSTAGRAM_TOKEN e o INSTAGRAM_USER_ID no CHAVES.txt (ou nos Secrets do GitHub).');
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
      for (const u of t.urls) {
        if (!(await arteNoAr(u, fetchFn, intervaloNoAr ? 3 : 10, intervaloNoAr))) throw new Error(`a arte não está no ar: ${u}`);
      }
      let id;
      if (t.tipo === 'carrossel') id = await instagram.publicarCarrossel(cred, t.urls, t.legenda, fetchFn, intervaloStatus);
      else if (t.tipo === 'post') id = await instagram.publicarImagem(cred, t.urls[0], t.legenda, fetchFn, intervaloStatus);
      else id = await instagram.publicarStory(cred, t.urls[0], fetchFn, intervaloStatus);
      marcar(t.chave, id);
      publicados++;
      livres--;
      log(`  publicado: ${t.tipo} (id ${id})`);
    } catch (e) {
      if (e instanceof instagram.ErroFatal) throw e;
      log(`  aviso: não publiquei ${t.tipo}: ${e.message}`);
    }
  }
  log(`Instagram: ${publicados} publicação(ões) feitas.`);
  return { publicados };
}

if (require.main === module) {
  const conta = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'lusia';
  publicar(conta, { simular: process.argv.includes('--simular') }).catch((e) => {
    console.error('ERRO: ' + e.message);
    process.exitCode = 1;
  });
}

module.exports = { publicar };
