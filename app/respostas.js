// RESPOSTA AUTOMÁTICA: comentou "QUERO", recebe o link no direct
// Uso:  node app/respostas.js <conta> [--simular]
// Olha os comentários dos posts dos últimos dias. Para cada comentário com a palavra-chave:
//   1) manda o link no direct da pessoa (resposta privada oficial do Instagram, 1 por comentário);
//   2) responde embaixo do comentário ("Te mandei no direct! 💌"), o que ainda ajuda o post a crescer.
// Nunca responde 2 vezes o mesmo comentário (anota em contas/<conta>/respondidos.json).
// Liga e desliga no config.json:  "instagram": { "respostas": { "ativo": true } }
const fs = require('fs');
const path = require('path');
const instagram = require('./instagram');
const maquina = require('./maquina');

const RAIZ = path.join(__dirname, '..');
const DIA = 86400000;

const PADRAO = {
  ativo: false,
  palavras: ['quero', 'eu quero', 'link', 'manda', 'me manda', 'eu'],
  diasParaTras: 7, // o Instagram só deixa responder no direct até 7 dias depois do comentário
  maxPorRodada: 40,
  respostaPublica: ['Te mandei no direct! 💌', 'Enviei no seu direct, confere lá! 💖', 'Já está no seu direct! ✨', 'Mandei o link no direct 🛍️'],
};

// "Quéééro!!! 😍" -> "quero" (sem acento, sem emoji, sem letra repetida)
const normalizar = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/([a-z])\1{2,}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

// O comentário pede o link? Palavra inteira ("quero", "eu quero"), não pedaço ("requerimento" não vale).
// "eu" sozinho só vale se o comentário for só isso.
function pedeLink(texto, palavras) {
  const t = normalizar(texto);
  if (!t) return false;
  return palavras.map(normalizar).some((p) => (p === 'eu' ? t === 'eu' : (' ' + t + ' ').includes(' ' + p + ' ')));
}

const nomeCurto = (s, max = 45) => (String(s).length > max ? String(s).slice(0, max - 1).trim() + '…' : String(s));
const AVISO = '\n\n(Link de afiliada: posso ganhar uma comissão, sem custo extra para você 💖)';
const LIMITE_DM = 950; // o direct aceita até 1000 caracteres

// Monta a mensagem do direct conforme o post comentado
function mensagem({ chave, dados, vitrine }) {
  const ofertas = (dados && dados.ofertas) || [];
  const m = String(chave || '').match(/^(.+):(carrossel|post):?(.*)$/);
  if (m && ofertas.length) {
    const lista = m[2] === 'post' ? ofertas.filter((o) => String(o.itemId) === m[3]) : ofertas;
    if (lista.length) {
      let txt = lista.length === 1 ? 'Oi! 💖 Aqui está o link do achadinho:' : 'Oi! 💖 Aqui estão os links dos achadinhos:';
      const rodape = `\n\nTodos os achadinhos: ${vitrine}`;
      let cabem = 0;
      for (const o of lista) {
        const item = `\n\n${o.numero}. ${nomeCurto(o.nome)} | ${o.preco}\n${o.link}`;
        if ((txt + item + rodape + AVISO).length > LIMITE_DM) break;
        txt += item;
        cabem++;
      }
      if (cabem) return txt + (cabem < lista.length ? rodape : '') + AVISO;
    }
  }
  return `Oi! 💖 Os achadinhos do dia, com preço e link, estão aqui:\n${vitrine}${AVISO}`;
}

function lerJson(arq, padrao) {
  try {
    return JSON.parse(fs.readFileSync(arq, 'utf8')) || padrao;
  } catch {
    return padrao;
  }
}

async function responder(conta, { simular = false, fetchFn = fetch, log = console.log, agora = Date.now(), segredos } = {}) {
  const pastaConta = path.join(RAIZ, 'contas', conta);
  const config = maquina.lerConfig(pastaConta);
  const cfg = { ...PADRAO, ...((config.instagram && config.instagram.respostas) || {}) };
  if (!cfg.ativo && !simular) {
    log('Resposta automática desligada no config.json ("respostas": { "ativo": false }).');
    return { respondidos: 0 };
  }
  const { igToken: token, igUserId: userId } = segredos || maquina.lerSegredos(pastaConta);
  if (!token || !userId) {
    log('Sem INSTAGRAM_TOKEN / INSTAGRAM_USER_ID: pulando as respostas.');
    return { respondidos: 0 };
  }
  const cred = { token, userId };
  const base = String(config.site.urlBase || '').replace(/\/+$/, '');
  const vitrine = `${base}/${encodeURI(conta)}/`;

  // Qual post é qual: publicados.json guarda { chave: { id } }; aqui vira { id: chave }
  const publicados = lerJson(path.join(pastaConta, 'publicados.json'), {});
  const chaveDoPost = {};
  for (const [chave, v] of Object.entries(publicados)) if (v && v.id) chaveDoPost[v.id] = chave;
  const dadosDoDia = (chave) => {
    const dia = String(chave || '').split(':')[0];
    return /^\d{4}-\d{2}-\d{2}/.test(dia) ? lerJson(path.join(RAIZ, 'publico', conta, dia, 'dados.json'), null) : null;
  };

  const arqResp = path.join(pastaConta, 'respondidos.json');
  const feitos = lerJson(arqResp, {});
  // Limpa o que tem mais de 30 dias (o arquivo não cresce para sempre)
  for (const [k, v] of Object.entries(feitos)) if (!v || agora - Date.parse(v.quando) > 30 * DIA) delete feitos[k];
  const salvar = () => {
    if (simular) return;
    fs.writeFileSync(arqResp + '.tmp', JSON.stringify(feitos, null, 2));
    fs.renameSync(arqResp + '.tmp', arqResp);
  };

  const desde = agora - cfg.diasParaTras * DIA;
  const posts = (await instagram.postsRecentes(cred, 25, fetchFn)).filter((p) => Date.parse(p.timestamp) >= desde);
  let respondidos = 0;
  let errosSeguidos = 0;
  for (const post of posts) {
    let lista;
    try {
      lista = await instagram.comentarios(cred, post.id, fetchFn);
    } catch (e) {
      if (e instanceof instagram.ErroFatal) throw e;
      log(`  aviso: não consegui ler os comentários do post ${post.id}: ${e.message}`);
      continue;
    }
    for (const c of lista) {
      if (respondidos >= cfg.maxPorRodada) break;
      if (feitos[c.id]) continue;
      if (c.from && String(c.from.id) === String(userId)) continue; // comentário da própria conta
      if (Date.parse(c.timestamp) < desde) continue;
      if (!pedeLink(c.text, cfg.palavras)) continue;

      const chave = chaveDoPost[post.id];
      const texto = mensagem({ chave, dados: dadosDoDia(chave), vitrine });
      const publica = cfg.respostaPublica[respondidos % cfg.respostaPublica.length];
      if (simular) {
        log(`SIMULAÇÃO: responderia @${c.username || '?'} ("${c.text}")\n${texto.replace(/^/gm, '      ')}`);
        respondidos++;
        continue;
      }
      try {
        await instagram.responderNoDirect(cred, c.id, texto, fetchFn);
        feitos[c.id] = { quando: new Date(agora).toISOString(), post: post.id, ok: true };
        salvar();
        respondidos++;
        errosSeguidos = 0;
        log(`  direct enviado para @${c.username || '?'}`);
        // A resposta pública é um bônus: se falhar, o direct já foi
        await instagram.responderComentario(cred, c.id, publica, fetchFn).catch((e) => log(`  aviso: não respondi o comentário em público: ${e.message}`));
      } catch (e) {
        // Token vencido: para tudo. Outros erros: anota (não tenta de novo para sempre) e segue
        if (e instanceof instagram.ErroFatal && e.codigo === 190) throw e;
        feitos[c.id] = { quando: new Date(agora).toISOString(), post: post.id, ok: false, erro: e.message };
        salvar();
        log(`  aviso: não consegui mandar o direct para @${c.username || '?'}: ${e.message}`);
        if (++errosSeguidos >= 3) throw new Error('3 erros seguidos ao mandar direct. Confira as permissões do app no Meta: ' + e.message);
      }
    }
  }
  log(`Respostas automáticas: ${respondidos} direct(s) ${simular ? 'simulados' : 'enviados'}.`);
  return { respondidos };
}

if (require.main === module) {
  const conta = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'lusia';
  responder(conta, { simular: process.argv.includes('--simular') }).catch((e) => {
    console.error('ERRO: ' + e.message);
    process.exitCode = 1;
  });
}

module.exports = { responder, pedeLink, mensagem, normalizar };
