// Teste automático da máquina. Roda com:  node app/teste-automatico.js
// Não usa internet nem chaves de verdade.
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const shopee = require('./shopee');
const cacador = require('./cacador');
const textos = require('./textos');
const historico = require('./historico');
const maquina = require('./maquina');

let passou = 0;
let falhou = 0;
async function teste(nome, fn) {
  try {
    await fn();
    passou++;
    console.log('  ok   ' + nome);
  } catch (e) {
    falhou++;
    console.log('  FALHOU ' + nome + ': ' + e.message);
  }
}

const CHAVES = { appId: '123456', secret: 'segredo' };
const resposta = (status, json) => ({ ok: status === 200, status, json: async () => json });

(async () => {
  console.log('Testando a Máquina de Ofertas...');

  await teste('assinatura SHA256 no formato da Shopee', async () => {
    let cabecalho, corpo;
    const fakeFetch = async (url, opt) => {
      cabecalho = opt.headers.Authorization;
      corpo = opt.body;
      return resposta(200, { data: { productOfferV2: { nodes: [] } } });
    };
    await shopee.buscarProdutos(CHAVES, { palavra: 'natal' }, fakeFetch);
    const m = cabecalho.match(/^SHA256 Credential=123456, Timestamp=(\d+), Signature=([0-9a-f]{64})$/);
    assert(m, 'cabeçalho fora do formato: ' + cabecalho);
    const esperado = crypto.createHash('sha256').update('123456' + m[1] + corpo + 'segredo').digest('hex');
    assert.strictEqual(m[2], esperado);
    assert(Math.abs(Number(m[1]) - Date.now() / 1000) < 5, 'timestamp não está em segundos');
  });

  await teste('chave errada para na hora, sem ficar tentando', async () => {
    let chamadas = 0;
    const fakeFetch = async () => {
      chamadas++;
      return resposta(200, { errors: [{ message: 'Invalid Signature', extensions: { code: 10020 } }] });
    };
    await assert.rejects(shopee.buscarProdutos(CHAVES, { palavra: 'x' }, fakeFetch), shopee.ErroFatal);
    assert.strictEqual(chamadas, 1);
  });

  await teste('internet falhando: tenta de novo e consegue', async () => {
    let chamadas = 0;
    const fakeFetch = async () => {
      chamadas++;
      if (chamadas < 2) throw new Error('rede caiu');
      return resposta(200, { data: { generateShortLink: { shortLink: 'https://s.shopee.com.br/abc' } } });
    };
    const link = await shopee.gerarLinkCurto(CHAVES, 'https://shopee.com.br/p', 'x', fakeFetch);
    assert.strictEqual(link, 'https://s.shopee.com.br/abc');
    assert.strictEqual(chamadas, 2);
  });

  await teste('produto com dados faltando é ignorado sem quebrar', async () => {
    const fakeFetch = async () =>
      resposta(200, { data: { productOfferV2: { nodes: [null, { itemId: 1 }, { itemId: 2, productName: 'Ok' }] } } });
    const lista = await shopee.buscarProdutos(CHAVES, { palavra: 'x' }, fakeFetch);
    assert.strictEqual(lista.length, 1);
  });

  await teste('filtros barram comissão baixa e palavra proibida', async () => {
    const f = { comissaoMinimaPct: 5, vendasMinimas: 100, notaMinima: 4.3, precoMin: 10, precoMax: 250, palavrasProibidas: ['vape'] };
    const bom = { commissionRate: '0.08', sales: 500, ratingStar: '4.8', priceMin: '30', productName: 'Pisca', productLink: 'x' };
    assert(cacador.passaNosFiltros(bom, f));
    assert(!cacador.passaNosFiltros({ ...bom, commissionRate: '0.02' }, f));
    assert(!cacador.passaNosFiltros({ ...bom, productName: 'Vape natal' }, f));
    assert(!cacador.passaNosFiltros({ ...bom, priceMin: 'abc' }, f));
  });

  await teste('legendas de vídeo sem link e sem linha vazia', async () => {
    const p = { itemId: 9, productName: 'Guirlanda', priceMin: '59.9', priceDiscountRate: 15 };
    for (const loja of ['shopee', 'tiktok']) {
      for (const l of textos.legendasVideo(p, ['#natal'], loja)) {
        assert(!/https?:\/\//.test(l), 'legenda de vídeo com link');
        assert(l.split('\n').every((linha) => linha.trim()), 'linha vazia na legenda');
        assert(!l.includes('undefined') && !l.includes('NaN'));
      }
    }
  });

  await teste('cada plataforma fala do seu jeito: TikTok nunca cita Shopee, link na bio ou o Instagram', async () => {
    for (let id = 1; id <= 60; id++) {
      const p = { itemId: 'x'.repeat(id), productName: 'Guirlanda', priceMin: '59.9' };
      for (const l of textos.legendasVideo(p, ['#tiktokshop'], 'tiktok')) {
        assert(!/shopee|xopi|link na bio|@achadinhoabessa/i.test(l), 'legenda do TikTok misturou plataforma: ' + l);
      }
      assert(!/sacolinha|#tiktokshop/i.test(textos.legendaInstagram(p, 1, ['#natal'])), 'legenda do Instagram falou do TikTok');
    }
  });

  await teste('padrão de qualidade (olhar de consumidora): fundo liso sem desfoque, foto centralizada e nítida, rótulo de IA só em IA', async () => {
    const aq = require('./aquecimento-tiktok');
    const sharp = require('sharp');
    const os = require('os');
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'q-'));
    const foto = path.join(pasta, 'f.png');
    await sharp({ create: { width: 800, height: 800, channels: 3, background: '#d00000' } }).png().toFile(foto);
    const saida = path.join(pasta, 'q.jpg');
    await aq.quadro({ arquivo: foto, ia: false }, 'Teste', saida, { cor: '#b0294a' });
    const { data, info } = await sharp(saida).raw().toBuffer({ resolveWithObject: true });
    const px = (x, y) => { const i = (y * info.width + x) * info.channels; return [data[i], data[i + 1], data[i + 2]]; };
    const perto = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 12);
    // canto de baixo = fundo liso claro (nada de foto desfocada atrás)
    assert(perto(px(20, info.height - 20), [0xf7, 0xf0, 0xea]), 'fundo não é liso: ' + px(20, info.height - 20));
    // centro = a foto, inteira e nítida (vermelho puro, sem borrão)
    assert(perto(px(info.width / 2, info.height / 2 + 60), [0xd0, 0, 0]), 'foto não está no centro');
    // foto repetida em duas pastas entra uma vez só, sem virar "IA"
    const fotos = aq.juntarFotos('lusia');
    const tamanhos = fotos.map((f) => fs.statSync(f.arquivo).size);
    assert.strictEqual(new Set(tamanhos).size, tamanhos.length, 'foto repetida no vídeo');
    const listaIa = path.join(__dirname, '..', 'contas', 'lusia', 'fotos', 'feitas-com-ia.txt');
    const comIa = fs.existsSync(listaIa) ? fs.readFileSync(listaIa, 'utf8') : '';
    assert(fotos.filter((f) => /[\/]fotos[\/]/.test(f.arquivo)).every((f) => f.ia === comIa.includes(path.basename(f.arquivo))), 'rótulo de IA errado em foto de produto');
    fs.rmSync(pasta, { recursive: true, force: true });
  });

  await teste('Instagram: NADA CORTADO, foto de produto entra inteira no post (presépio, flor e almofadas saíram cortados em 19 a 22/10)', async () => {
    const conteudo = require('./conteudo');
    const sharp = require('sharp');
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'corte-'));
    // foto deitada, quadrada e em pé, com moldura vermelha: a moldura tem que aparecer inteira na arte
    for (const [w, h] of [[1000, 600], [800, 800], [600, 1000]]) {
      const foto = path.join(pasta, `f-${w}x${h}.png`);
      const moldura = Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="${h}" fill="#fff"/><rect x="0" y="0" width="${w}" height="${h}" fill="none" stroke="#d00000" stroke-width="40"/></svg>`);
      await sharp(moldura).png().toFile(foto);
      const saida = path.join(pasta, `a-${w}x${h}.jpg`);
      await conteudo.fazerArte(foto, 'Troque só as capas e a sala vira Natal', saida, { marca: '@achadinhoabessa' });
      const { data, info } = await sharp(saida).raw().toBuffer({ resolveWithObject: true });
      let x0 = info.width, x1 = -1, y0 = info.height, y1 = -1;
      for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
        const i = (y * info.width + x) * info.channels;
        if (data[i] > 180 && data[i + 1] < 60 && data[i + 2] < 60) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      }
      assert(x1 > 0, `${w}x${h}: a foto sumiu da arte`);
      const proporcao = (x1 - x0 + 1) / (y1 - y0 + 1);
      assert(Math.abs(proporcao - w / h) < 0.03, `${w}x${h}: foto CORTADA (proporção ${proporcao.toFixed(2)} em vez de ${(w / h).toFixed(2)})`);
      assert(x0 >= 0 && x1 <= info.width - 1 && y0 >= 0, `${w}x${h}: foto encostando fora da tela`);
    }
    // as artes que estão na fila agora: todas 1080x1350, para o Instagram não cortar de novo
    for (const f of fs.readdirSync(path.join(__dirname, '..', 'publico', 'lusia', 'conteudo')).filter((n) => /\.(jpg|png)$/.test(n))) {
      const m = await sharp(path.join(__dirname, '..', 'publico', 'lusia', 'conteudo', f)).metadata();
      assert(m.width === 1080 && m.height === 1350, `${f} não está em 1080x1350 (o Instagram corta)`);
    }
    fs.rmSync(pasta, { recursive: true, force: true });
  });

  await teste('vídeo de aquecimento abre com a foto que combina com o gancho', async () => {
    const aq = require('./aquecimento-tiktok');
    const f = (n, t) => ({ arquivo: '/x/' + n, texto: t || '' });
    const flor = f('flor.jpg', 'Flor de Natal'), mesa = f('4-mesa.png', 'Mesa de Natal'), bola = f('bolas.jpg');
    assert.strictEqual(aq.abrirComOGancho('Inspiração para a mesa da ceia', [flor, bola], [flor, bola, mesa])[0], mesa);
    assert.strictEqual(aq.abrirComOGancho('Inspiração para a mesa da ceia', [flor, mesa], [flor, mesa])[0], mesa);
    const sem = [flor, bola];
    assert.strictEqual(aq.abrirComOGancho('Qual dessas você usaria?', sem, sem), sem);
  });

  await teste('vídeos de aquecimento do TikTok: legenda curta, sem link e sem misturar plataforma', async () => {
    const aq = require('./aquecimento-tiktok');
    const l = aq.legendaTikTok('Ideias de Natal', 0, ['#natal']);
    assert(!/https?:\/\/|shopee|link na bio/i.test(l) && l.split('\n').length <= 3);
    assert.throws(() => aq.legendaTikTok('Achei na Shopee', 0, []), /misturou/);
  });

  await teste('TikTok: legenda com frase de busca, no máximo 5 hashtags; sacolinha leva #publi', async () => {
    const aq = require('./aquecimento-tiktok');
    const tags = ['#tiktokshop', '#decoracaodenatal', '#natal', '#casadecorada', '#achadinhos', '#extra1', '#extra2'];
    const l = aq.legendaTikTok('Sua árvore fica com cara de vazia?', 0, tags, 'Como encher a árvore de natal gastando pouco');
    assert(l.includes('Como encher a árvore de natal'), 'sem a frase de busca');
    assert(l.split('\n').length <= 4);
    assert((l.match(/#/g) || []).length <= 5, 'hashtag demais: ' + l);
    assert(!/sacolinha|carrinho|#publi/i.test(l), 'aquecimento não vende');
    // todo gancho tem frase de busca com palavras de natal
    assert(aq.GANCHOS.every((g) => g.texto && /natal/i.test(g.busca)));
    const s = aq.legendaSacolinha('Sua árvore fica com cara de vazia?', 'Como encher a árvore de natal', 'Flor com glitter', tags);
    assert.strictEqual((s.match(/#publi/g) || []).length, 1);
    assert((s.match(/#/g) || []).length <= 5, 'hashtag demais: ' + s);
    assert(/carrinho|link/i.test(s) && !/sacolinha/i.test(s) && !/shopee|link na bio|https?:/i.test(s));
  });

  await teste('TikTok: texto só na área segura (nada embaixo, na direita nem no topo) e gancho grande no 1º quadro', async () => {
    const aq = require('./aquecimento-tiktok');
    const sharp = require('sharp');
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'zs-'));
    // foto da cor do fundo: tudo que não for fundo é texto/selo
    const foto = path.join(pasta, 'f.png');
    await sharp({ create: { width: 800, height: 1200, channels: 3, background: aq.FUNDO } }).png().toFile(foto);
    const saida = path.join(pasta, 'q.jpg');
    await aq.quadro({ arquivo: foto, ia: true }, 'Sua árvore de Natal fica com cara de vazia mesmo depois de montar tudo?', saida, { cor: '#b0294a', numero: 3, grande: true });
    const { data, info } = await sharp(saida).raw().toBuffer({ resolveWithObject: true });
    const fundo = [0xf7, 0xf0, 0xea];
    const limpo = (x0, y0, x1, y1) => {
      for (let y = y0; y < y1; y += 4) for (let x = x0; x < x1; x += 4) {
        const i = (y * info.width + x) * info.channels;
        if ([data[i], data[i + 1], data[i + 2]].some((v, k) => Math.abs(v - fundo[k]) > 14)) return `${x},${y}`;
      }
      return '';
    };
    assert.strictEqual(limpo(0, info.height - aq.ZONA.baixo, info.width, info.height), '', 'texto na parte de baixo (legenda/sacolinha do TikTok)');
    assert.strictEqual(limpo(info.width - aq.ZONA.direita, 0, info.width, info.height), '', 'texto na direita (botões do TikTok)');
    assert.strictEqual(limpo(0, 0, info.width, aq.ZONA.topo), '', 'texto no topo (abas do TikTok)');
    // o gancho existe (faixa colorida) logo abaixo do topo
    const i = ((aq.ZONA.topo + 40) * info.width + 200) * info.channels;
    assert(Math.abs(data[i] - 0xb0) < 20 && data[i + 1] < 80, 'gancho não aparece no 1º quadro');
    fs.rmSync(pasta, { recursive: true, force: true });
  });

  await teste('TikTok: vídeo de 12 a 18 s, cena nova a cada ~2 s, gancho de problema no início e final que emenda no começo', async () => {
    const aq = require('./aquecimento-tiktok');
    const fotos = Array.from({ length: 10 }, (_, k) => ({ arquivo: `/x/foto${k}.jpg`, texto: 'Produto ' + k, ia: false, clipes: [] }));
    for (const lista of [fotos, fotos.slice(0, 3)]) {
      for (let v = 0; v < 12; v++) {
        const p = aq.planoDoVideo(v, lista, { duracaoDe: () => 0 });
        assert(p.total >= aq.DURACAO.min && p.total <= aq.DURACAO.max, `duração fora: ${p.total}s`);
        if (lista.length >= 7) assert(p.seg <= 2.5, 'cena longa demais: ' + p.seg);
        assert(p.cenas[0].grande && p.cenas[0].texto === p.gancho.texto, '1ª cena sem gancho');
        assert.strictEqual(p.cenas[p.cenas.length - 1].foto, p.cenas[0].foto, 'o final não emenda no começo');
        const meio = p.cenas.slice(0, -1).map((c) => c.foto);
        assert.strictEqual(new Set(meio).size, meio.length, 'foto repetida no vídeo');
        assert.strictEqual(p.tipo, 'aquecimento');
        assert(!p.sacolinha, 'slideshow de fotos não pode ir com sacolinha');
      }
    }
    // ganchos de problema: perguntas ou dor que a pessoa reconhece
    assert(aq.GANCHOS.filter((g) => g.texto.includes('?')).length >= aq.GANCHOS.length / 2);
    // 4 dias x 3 vídeos sem repetir gancho (a dona não quer vídeo repetido em sequência, 20/10)
    assert.strictEqual(new Set(aq.GANCHOS.map((g) => g.texto)).size, aq.GANCHOS.length, 'gancho duplicado');
    assert(aq.GANCHOS.length >= 12, 'precisa de 12+ ganchos para 4 dias sem repetir');
    // dois vídeos seguidos nunca abrem com a mesma foto
    let antes = null;
    for (let v = 0; v < 12; v++) {
      const p = aq.planoDoVideo(v, fotos, { duracaoDe: () => 0, evitar: antes });
      assert.notStrictEqual(p.cenas[0].foto, antes, `vídeo ${v} abre igual ao anterior`);
      antes = p.cenas[0].foto;
    }
  });

  await teste('TikTok: clipe de vídeo do produto vira cenas (trechos diferentes) e só vídeo de clipe pode ir com sacolinha', async () => {
    const aq = require('./aquecimento-tiktok');
    const fotos = Array.from({ length: 5 }, (_, k) => ({ arquivo: `/x/foto${k}.jpg`, texto: 'Produto ' + k, ia: false, clipes: [] }));
    fotos[1].clipes = ['/x/foto1.mp4'];
    const dur = () => 8;
    // aquecimento: onde há clipe, usa o clipe no lugar da foto parada (e marca IA)
    const p = aq.planoDoVideo(0, fotos, { duracaoDe: dur });
    const c = p.cenas.find((x) => x.foto === fotos[1]);
    assert(c && c.clipe === '/x/foto1.mp4' && c.ia, 'não usou o clipe');
    assert.strictEqual(p.tipo, 'aquecimento');
    // sacolinha: tudo clipe, 1 produto, trechos diferentes, final = trecho logo antes do começo (loop)
    const vistos = new Set();
    for (let v = 0; v < 3; v++) {
      const s = aq.planoSacolinha(v, fotos[1], { duracaoDe: dur });
      assert(s.sacolinha && s.tipo === 'sacolinha' && s.cenas.every((x) => x.clipe));
      assert(s.total >= aq.DURACAO.min && s.total <= aq.DURACAO.max, 'duração fora: ' + s.total);
      const fim = s.cenas[s.cenas.length - 1];
      assert(Math.abs(fim.inicio + s.seg - s.cenas[0].inicio) < 0.01, 'o final não emenda no começo');
      s.cenas.forEach((x) => assert(x.inicio >= 0 && x.inicio + s.seg <= 8 + 0.01, 'trecho fora do clipe'));
      vistos.add(s.cenas.map((x) => x.inicio).join(','));
    }
    assert.strictEqual(vistos.size, 3, '1 clipe devia virar vídeos diferentes');
    assert.throws(() => aq.planoSacolinha(0, fotos[0]), /clipe/);
    // clipe com "-real" no nome é filmado de verdade: sem rótulo de IA
    const real = aq.planoSacolinha(0, { ...fotos[1], clipes: ['/x/foto1-real.mp4'] }, { duracaoDe: dur });
    assert(real.cenas.every((x) => !x.ia));
  });

  await teste('TikTok: clipe .mp4 na pasta de fotos é ligado à foto certa; nomes e LEIA marcam aquecimento x sacolinha', async () => {
    const aq = require('./aquecimento-tiktok');
    const sharp = require('sharp');
    const conta = 'teste-clipes-' + process.pid;
    const pastaConta = path.join(__dirname, '..', 'contas', conta);
    const pf = path.join(pastaConta, 'fotos');
    fs.mkdirSync(pf, { recursive: true });
    try {
      fs.writeFileSync(path.join(pastaConta, 'config.json'), JSON.stringify({ palavrasChave: ['natal'], hashtagsTikTok: ['#natal', '#tiktokshop'] }));
      const cores = ['#aa0000', '#00aa00', '#0000aa'];
      const nomes = ['flores.jpg', 'flores-3-cores.jpg', 'bola.jpg'];
      for (let k = 0; k < 3; k++) await sharp({ create: { width: 300 + k * 10, height: 300, channels: 3, background: cores[k] } }).jpeg().toFile(path.join(pf, nomes[k]));
      for (const v of ['flores-3-cores.mp4', 'flores-3-cores-2.mp4', 'flores.mp4', 'sem-foto.mp4']) fs.writeFileSync(path.join(pf, v), 'x');
      const minhas = aq.juntarFotos(conta).filter((f) => f.arquivo.startsWith(pf));
      const de = (n) => minhas.find((f) => path.basename(f.arquivo) === n).clipes.map((c) => path.basename(c)).sort();
      assert.deepStrictEqual(de('flores-3-cores.jpg'), ['flores-3-cores-2.mp4', 'flores-3-cores.mp4']);
      assert.deepStrictEqual(de('flores.jpg'), ['flores.mp4']);
      assert.deepStrictEqual(de('bola.jpg'), []);
      // gera 1 dia com montagem falsa (sem ffmpeg)
      const saida = path.join(pastaConta, 'saida');
      const feitos = [];
      await aq.gerar(conta, { dias: 1, porDia: 3, inicio: '2026-11-01', saida, duracaoDe: () => 6, log: () => {}, montar: (cenas, destino) => { feitos.push(cenas); fs.writeFileSync(destino, 'v'); } });
      const arqs = fs.readdirSync(path.join(saida, '2026-11-01'));
      assert(arqs.includes('12h-video-sacolinha.mp4'), 'faltou o vídeo de sacolinha: ' + arqs);
      assert(arqs.includes('18h-video-aquecimento.mp4') && arqs.includes('20h-video-aquecimento.mp4'));
      assert(feitos[0].every((c) => c.clipe), 'vídeo de sacolinha com foto parada');
      const leia = fs.readFileSync(path.join(saida, 'LEIA.txt'), 'utf8');
      assert(/12h \[COM SACOLINHA/.test(leia) && /18h \[AQUECIMENTO \(sem sacolinha\)\]/.test(leia));
      const leg = fs.readFileSync(path.join(saida, '2026-11-01', '12h-legenda.txt'), 'utf8');
      assert(leg.includes('#publi') && leg.includes('Conteúdo gerado por IA'));
      assert(!fs.readFileSync(path.join(saida, '2026-11-01', '18h-legenda.txt'), 'utf8').includes('#publi'));
      // o robô do TikTok reconhece os nomes novos
      const tiktok = require('./tiktok');
      const fila = tiktok.videosDaVez(saida, new Date('2026-11-01T23:30:00Z'), {}, 5);
      assert.deepStrictEqual(fila.map((v) => v.nome), ['12h-video-sacolinha.mp4', '18h-video-aquecimento.mp4', '20h-video-aquecimento.mp4']);
    } finally {
      fs.rmSync(pastaConta, { recursive: true, force: true });
    }
  });

  await teste('placar do TikTok: lê o arquivo colado, acha os 3 vencedores e os piores e sugere variações', async () => {
    const pl = require('./placar');
    assert.strictEqual(pl.numero('1.250'), 1250);
    assert.strictEqual(pl.numero('1,2 mil'), 1200);
    assert.strictEqual(pl.numero('3,4K'), 3400);
    assert.strictEqual(pl.numero(''), 0);
    assert.deepStrictEqual(pl.conclusao('22%'), { pct: 22, estimado: false });
    assert.strictEqual(pl.conclusao('4,5s').estimado, true);
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-'));
    const arq = path.join(pasta, 'metricas-tiktok.txt');
    fs.writeFileSync(
      arq,
      pl.CABECALHO +
        [
          '2026-10-20 | Árvore vazia? | 1.000 | 30% | 50 | 10 | 20 | 5 | 1',
          '2026-10-20 | Mesa sem graça? | 800 | 10% | 5 | 0 | 1 | 0 | 0',
          '2026-10-21 | Casa sem clima? | 2.000 | 25% | 40 | 4 | 6 | 2 | 0',
          '2026-10-21 | Apartamento pequeno | 500 | 5% | 1 | 0 | 0 | 0 | 0',
          '2026-10-22 | Gastando pouco? | 1,2 mil | 6s | 30 | 3 | 9 | 9 | 3',
          '2026-10-22 | Sala sem graça? | 300 | 8% | 2 | 0 | 0 | 0 | 0',
          'linha quebrada',
        ].join('\n')
    );
    const avisos = [];
    const linhas = pl.lerMetricas(arq, (m) => avisos.push(m));
    assert.strictEqual(linhas.length, 6);
    assert.strictEqual(avisos.length, 1);
    const p = pl.placar(linhas);
    assert.deepStrictEqual(p.vencedores.map((l) => l.titulo), ['Árvore vazia?', 'Gastando pouco?', 'Casa sem clima?']);
    assert.deepStrictEqual(p.piores.map((l) => l.titulo), ['Apartamento pequeno', 'Sala sem graça?', 'Mesa sem graça?']);
    assert(p.sugestoes[0].includes('3 variações') && p.sugestoes[0].includes('Árvore vazia?'));
    assert(p.sugestoes[1].includes('Gastando pouco?') && p.sugestoes[1].includes('3 venda'), 'não destacou o que mais vendeu');
    assert.strictEqual(p.totais.vendas, 4);
    assert(pl.relatorio(p).includes('Os 3 vencedores'));
    // fonte da API oficial (quando ligada): entra no placar sem repetir o que já foi colado
    const api = pl.linhasDaApi([{ title: 'Árvore vazia?', view_count: 9, share_count: 1 }, { title: 'Novo vídeo\n#natal', view_count: 400, like_count: 3, share_count: 8, create_time: 1792000000 }]);
    const juntas = pl.juntar(linhas, api);
    assert.strictEqual(juntas.length, 7);
    assert.strictEqual(juntas[6].titulo, 'Novo vídeo');
    assert.strictEqual(juntas[6].conclusao, null);
    assert(pl.relatorio(pl.placar([])).includes('vazio'));
    fs.rmSync(pasta, { recursive: true, force: true });
  });

  await teste('todo texto de divulgação leva #publi (regra do CONAR) e a frase de benefício', async () => {
    const p = { itemId: 9, productName: 'Guirlanda', priceMin: '59.9', info: 'Já vem com luz' };
    const textosTodos = [
      ...textos.legendasVideo(p, ['#natal', '#publi'], 'shopee'),
      textos.legendaInstagram(p, 1, ['#natal']),
      textos.legendaCarrossel([p], ['#natal']),
      textos.pinterest(p, 'https://s.shopee.com.br/x', ['decoração de natal']).descricao,
    ];
    for (const t of textosTodos) {
      assert.strictEqual((t.match(/#publi/g) || []).length, 1, 'sem #publi ou repetido: ' + t);
    }
    assert(textos.legendasVideo(p, [], 'tiktok')[0].includes('Já vem com luz'));
    assert(textos.postComLink(p, 'https://x').includes('Já vem com luz'));
    const pin = textos.pinterest({ productName: 'X'.repeat(150) }, 'https://x', []);
    assert(pin.titulo.length <= 100 && !pin.descricao.includes('undefined'));
  });

  await teste('pedido de vídeo IA: sem rosto, sem criança, produto fiel e fala curta', async () => {
    const p = { productName: 'Kit 30 Bolas de Natal 4cm Vermelho e Dourado', info: '30 bolinhas por menos de R$ 1 cada' };
    const v = textos.videoIA(p);
    for (const t of [v.imagem, v.video]) {
      assert(/no face/.test(t) && /no children/.test(t) && /EXACTLY like the reference/.test(t) && /9:16/.test(t));
    }
    assert(v.video.includes(v.fala), 'fala fora do prompt');
    assert(v.fala.split(/\s+/).length <= 30, 'fala longa demais para 8 segundos');
    assert(!/undefined|\.\./.test(v.fala + v.video));
    assert(textos.REGRAS_ORIGINALIDADE.some((r) => /nunca repostar/.test(r)));
  });

  await teste('histórico não repete e salva sem corromper', async () => {
    const arq = path.join(os.tmpdir(), `hist-${process.pid}.json`);
    const h = historico.abrir(arq);
    h.marcar(42);
    h.salvar();
    assert(historico.abrir(arq).jaUsado('42', 7));
    fs.writeFileSync(arq, '{quebrado');
    assert(!historico.abrir(arq).jaUsado('42', 7)); // arquivo estragado não derruba a máquina
    fs.unlinkSync(arq);
  });

  await teste('lista do TikTok entende preços brasileiros', async () => {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-'));
    fs.writeFileSync(path.join(pasta, 'tiktok-produtos.txt'), '# c\nA | 49,90 | 10\nB | 1.249,90\nC | 49.90 | 12%\n\nD\n');
    const l = maquina.lerTikTok(pasta);
    assert.deepStrictEqual(l.map((p) => p.price), [49.9, 1249.9, 49.9, 0]);
    assert.strictEqual(l[2].commissionRate, 0.12);
    fs.rmSync(pasta, { recursive: true });
  });

  await teste('CHAVES.txt sem preencher dá aviso claro', async () => {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-'));
    fs.writeFileSync(path.join(pasta, 'CHAVES.txt'), 'APP_ID = cole aqui o App ID\nSECRET = cole aqui o Secret\n');
    assert.throws(() => maquina.lerChaves(pasta), /Falta colar/);
    fs.writeFileSync(path.join(pasta, 'CHAVES.txt'), '﻿app_id = "111"\r\nSECRET=abc\r\n');
    assert.deepStrictEqual(maquina.lerChaves(pasta), { appId: '111', secret: 'abc' });
    fs.rmSync(pasta, { recursive: true });
  });

  await teste('painel não quebra com nome estranho de produto', async () => {
    const painel = require('./painel');
    const p = { nome: 'Pisca </script><b>"x"</b> & \'y\'', preco: 'R$ 1,00', legendas: ['a\nb'], textoGrupo: 'g', link: 'https://x' };
    const html = painel.gerar({ data: '2026-10-16', conta: 'c', shopee: [p], tiktok: [], mensagensGrupo: ['g'] });
    assert.strictEqual(html.match(/<\/script>/g).length, 1, 'nome do produto fechou o script');
    const dados = html.match(/const D = (.*);\n/)[1];
    assert.strictEqual(JSON.parse(dados).shopee[0].nome, p.nome);
  });

  await teste('rodada completa em modo teste', async () => {
    const r = await maquina.rodar('lusia', true);
    assert(r.shopee >= 1, 'nenhum produto Shopee');
    const resumo = fs.readFileSync(path.join(r.pastaDia, 'RESUMO.md'), 'utf8');
    const nomes = resumo.split('\n').filter((l) => /^\d\d\. /.test(l));
    assert.strictEqual(new Set(nomes).size, nomes.length, 'produto repetido no resumo');
  });

  // ---------- Instagram (com um "Instagram de mentira", nada é publicado de verdade) ----------
  const instagram = require('./instagram');
  function instagramFalso(registro) {
    let n = 0;
    return async (url, opt = {}) => {
      const u = String(url);
      const metodo = opt.method || 'GET';
      const corpo = opt.body ? Object.fromEntries(new URLSearchParams(String(opt.body))) : {};
      registro.push({ metodo, u, corpo });
      const ok = (json) => ({ ok: true, status: 200, headers: { get: () => 'image/jpeg' }, json: async () => json });
      if (metodo === 'HEAD') return ok({});
      if (u.includes('content_publishing_limit')) return ok({ data: [{ quota_usage: 2, config: { quota_total: 100 } }] });
      if (u.includes('/media_publish')) return ok({ id: 'POST' + ++n });
      if (u.endsWith('/media')) return ok({ id: 'C' + ++n });
      if (u.includes('fields=status_code') || metodo === 'GET') return ok({ status_code: 'FINISHED' });
      return { ok: false, status: 404, headers: { get: () => '' }, json: async () => ({}) };
    };
  }
  const CRED = { token: 'tok', userId: '999' };

  await teste('Instagram: carrossel segue os passos oficiais', async () => {
    const reg = [];
    const id = await instagram.publicarCarrossel(CRED, ['https://x/1.jpg', 'https://x/2.jpg'], 'oi', instagramFalso(reg), 1);
    assert(id.startsWith('POST'));
    const posts = reg.filter((r) => r.metodo === 'POST');
    assert.strictEqual(posts[0].corpo.is_carousel_item, 'true');
    assert.strictEqual(posts[2].corpo.media_type, 'CAROUSEL');
    assert.strictEqual(posts[2].corpo.children.split(',').length, 2);
    assert(posts[3].u.endsWith('/media_publish'));
    assert(reg.every((r) => r.u.startsWith('https://graph.instagram.com/v25.0/') || r.metodo === 'HEAD'));
  });

  await teste('Instagram: token vencido para na hora com aviso claro', async () => {
    const f = async () => ({ ok: false, status: 400, json: async () => ({ error: { code: 190, message: 'expired' } }) });
    await assert.rejects(instagram.publicarImagem(CRED, 'https://x/1.jpg', 'oi', f, 1), /token do Instagram venceu/);
  });

  await teste('Instagram: imagem recusada não trava a máquina', async () => {
    const f = async (url, opt = {}) => ({
      ok: true,
      status: 200,
      json: async () => ((opt.method || 'GET') === 'POST' ? { id: 'C1' } : { status_code: 'ERROR' }),
    });
    await assert.rejects(instagram.publicarImagem(CRED, 'https://x/1.jpg', 'oi', f, 1), /não aceitou a imagem/);
  });

  await teste('arte sai em JPEG 1080x1350 (formato que o Instagram aceita)', async () => {
    const sharp = require('sharp');
    const artes = require('./artes');
    const arq = path.join(os.tmpdir(), `arte-${process.pid}.jpg`);
    await artes.fazerArte({ nome: 'Teste <&> "aspas"', preco: 'R$ 10,00', desconto: 20, foto: null }, arq, { marca: '@x' });
    const m = await sharp(arq).metadata();
    assert.strictEqual(m.format, 'jpeg');
    assert.deepStrictEqual([m.width, m.height], [1080, 1350]);
    fs.unlinkSync(arq);
  });

  await teste('publicador completo: publica uma vez e não repete', async () => {
    const { publicar } = require('./publicar');
    const r = await maquina.rodar('lusia', true);
    const dia = path.basename(r.pastaDia).toLowerCase();
    // Arquivo de "já publicado" TEMPORÁRIO: o publicados.json de verdade nunca é lido nem mexido
    // (antes, às 20h, o post das 18h já anotado lá quebrava a conta do teste e o robô parava)
    const real = path.join(__dirname, '..', 'contas', 'lusia', 'publicados.json');
    const antesReal = fs.existsSync(real) ? fs.readFileSync(real, 'utf8') : null;
    const pastaTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pub-'));
    const arqPublicados = path.join(pastaTmp, 'publicados.json');
    const lerCfg = maquina.lerConfig;
    try {
      // 1 conteúdo por dia no teste: com mais, a 2ª rodada publica o próximo da fila (o que é certo)
      maquina.lerConfig = (p) => ({ ...lerCfg(p), site: { ...lerCfg(p).site, urlBase: 'https://teste.github.io/ofertas' }, instagram: { ...lerCfg(p).instagram, conteudoPorDia: 1 } });
      const sim = await publicar('lusia', { simular: true, dia, arqPublicados, log: () => {} });
      assert.strictEqual(sim.tarefas.filter((t) => t.tipo === 'carrossel').length, 1);
      assert(sim.tarefas[0].legenda.includes('bio'));
      const reg = [];
      const opcoes = { dia, arqPublicados, ignorarDesligado: true, segredos: { igToken: 't', igUserId: '9' }, fetchFn: instagramFalso(reg), intervaloNoAr: 1, intervaloStatus: 1, log: () => {} };
      const r1 = await publicar('lusia', opcoes);
      const r2 = await publicar('lusia', opcoes);
      assert.strictEqual(r1.publicados, sim.tarefas.length);
      assert.strictEqual(r2.publicados, 0, 'publicou de novo o que já tinha publicado');
      assert(reg.some((x) => x.corpo.image_url && x.corpo.image_url.startsWith('https://teste.github.io/ofertas/lusia/')));
      assert(fs.existsSync(arqPublicados), 'não anotou no arquivo temporário');
      assert.strictEqual(fs.existsSync(real) ? fs.readFileSync(real, 'utf8') : null, antesReal, 'o teste mexeu no publicados.json de verdade');
    } finally {
      maquina.lerConfig = lerCfg;
      fs.rmSync(pastaTmp, { recursive: true, force: true });
    }
  });

  await teste('publicador às 20h com post já feito no dia: o teste não depende do publicados.json real', async () => {
    // Simula o dia real: o 1º conteúdo de hoje já saiu (anotado só no arquivo temporário).
    const { publicar } = require('./publicar');
    const pastaTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pub20-'));
    const arqPublicados = path.join(pastaTmp, 'publicados.json');
    fs.writeFileSync(arqPublicados, JSON.stringify({ 'conteudo:ja-saiu': { id: '1', quando: new Date().toISOString() } }));
    const lerCfg = maquina.lerConfig;
    try {
      maquina.lerConfig = (p) => ({ ...lerCfg(p), instagram: { ...lerCfg(p).instagram, conteudoPorDia: 1, conteudoAPartirDas: 0 } });
      const sim = await publicar('lusia', { simular: true, dia: 'nao-existe', arqPublicados, log: () => {} });
      // limite de 1 por dia já usado: nada de conteúdo (e sem ofertas nesse dia)
      assert(!(sim.tarefas || []).some((t) => t.chave.startsWith('conteudo:')), 'passou do limite do dia');
    } finally {
      maquina.lerConfig = lerCfg;
      fs.rmSync(pastaTmp, { recursive: true, force: true });
    }
  });

  await teste('lista manual da Shopee: entende links, fotos e linhas erradas', async () => {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-'));
    fs.mkdirSync(path.join(pasta, 'fotos'));
    fs.writeFileSync(path.join(pasta, 'fotos', 'pisca.jpg'), 'x');
    fs.writeFileSync(
      path.join(pasta, 'shopee-produtos.txt'),
      [
        '# comentário',
        'Pisca LED | 29,90 | 8 | https://s.shopee.com.br/AbC123 | pisca.jpg | Acende sozinho',
        'Guirlanda | 1.049,90 | 10% | https://shopee.com.br/Guirlanda-i.111.222 | https://cf.shopee.com.br/file/x',
        'https://shopee.com.br/product/333/444 | Toalha | 59.90',
        'Sem link | 10,00',
        'Foto sumida | 10 | 5 | https://shp.ee/zz9 | nao-existe.jpg',
        '',
      ].join('\r\n')
    );
    const avisos = [];
    const l = maquina.lerShopeeManual(pasta, (m) => avisos.push(m));
    assert.deepStrictEqual(l.map((p) => p.itemId), ['sp-AbC123', '222', '444', 'sp-zz9']);
    assert.deepStrictEqual(l.map((p) => p.price), [29.9, 1049.9, 59.9, 10]);
    assert.strictEqual(l[1].commissionRate, 0.1);
    assert.strictEqual(l[0].info, 'Acende sozinho');
    assert.strictEqual(l[1].info, '');
    assert.strictEqual(l[0].imageUrl, path.join(pasta, 'fotos', 'pisca.jpg'));
    assert.strictEqual(l[3].imageUrl, '');
    assert.strictEqual(avisos.length, 2, 'devia avisar da linha sem link e da foto sumida');
    assert.strictEqual(maquina.lerShopeeManual(os.tmpdir() + '/nao-existe-' + process.pid), null);
    fs.rmSync(pasta, { recursive: true });
  });

  await teste('lista manual: preço antigo vira desconto e "vendidos" vira prova social', async () => {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-'));
    fs.writeFileSync(
      path.join(pasta, 'shopee-produtos.txt'),
      [
        'Capas | 39,50 | | https://s.shopee.com.br/a1 | Nº 1 mais vendido da loja | de 59,90 | 10 mil vendidos',
        'Bolas | 27,90 | | https://s.shopee.com.br/a2 | 4mil+ vendidos | de R$ 41,90',
        'Presépio | 19,80 | | https://s.shopee.com.br/a3 | 181 vendidos',
      ].join('\n')
    );
    const l = maquina.lerShopeeManual(pasta);
    assert.deepStrictEqual(l.map((p) => p.priceDiscountRate), [34, 33, 0]);
    assert.deepStrictEqual(l.map((p) => p.sales), [10000, 4000, 181]);
    assert.strictEqual(l[0].info, 'Nº 1 mais vendido da loja', 'frase com "vendido" virou número de vendas');
    assert(textos.legendasVideo(l[0], [], 'shopee')[0].includes('+10 mil vendidos'));
    fs.rmSync(pasta, { recursive: true });
  });

  await teste('rodada completa no modo manual (sem chaves da Shopee)', async () => {
    const sharp = require('sharp');
    const raiz = path.join(__dirname, '..');
    const conta = 'teste-manual-' + process.pid;
    const pastaConta = path.join(raiz, 'contas', conta);
    const salvaEnv = { a: process.env.SHOPEE_APP_ID, s: process.env.SHOPEE_SECRET };
    delete process.env.SHOPEE_APP_ID;
    delete process.env.SHOPEE_SECRET;
    try {
      fs.mkdirSync(path.join(pastaConta, 'fotos'), { recursive: true });
      fs.copyFileSync(path.join(raiz, 'contas', 'lusia', 'config.json'), path.join(pastaConta, 'config.json'));
      await sharp({ create: { width: 300, height: 300, channels: 3, background: '#c33' } }).jpeg().toFile(path.join(pastaConta, 'fotos', 'a.jpg'));
      fs.writeFileSync(
        path.join(pastaConta, 'shopee-produtos.txt'),
        'Pisca LED | 29,90 | 8 | https://s.shopee.com.br/AAA | a.jpg\nGuirlanda | 49,90 | 10 | https://s.shopee.com.br/BBB\n'
      );
      const r1 = await maquina.rodar(conta, false);
      assert.strictEqual(r1.shopee, 2);
      const leia = fs.readdirSync(path.join(r1.pastaDia, 'shopee'));
      assert(fs.existsSync(path.join(r1.pastaDia, 'shopee', leia[0], 'foto-produto.jpg')), 'foto local não foi copiada');
      assert(fs.readFileSync(path.join(r1.pastaDia, 'shopee', leia[0], 'LEIA.txt'), 'utf8').includes('https://s.shopee.com.br/AAA'));
      const dados = JSON.parse(fs.readFileSync(path.join(raiz, 'publico', conta, fs.readFileSync(path.join(raiz, 'publico', conta, 'hoje.txt'), 'utf8'), 'dados.json'), 'utf8'));
      assert.strictEqual(dados.ofertas.length, 2);
      const painelHtml = fs.readFileSync(path.join(r1.pastaDia, 'painel.html'), 'utf8');
      assert(!painelHtml.includes(pastaConta.replace(/\\/g, '\\\\')), 'painel aponta para foto do computador');
      // Rodar de novo no mesmo dia: não repete os mesmos produtos
      const r2 = await maquina.rodar(conta, false);
      assert.strictEqual(r2.shopee, 0, 'repetiu produto já usado');
    } finally {
      if (salvaEnv.a !== undefined) process.env.SHOPEE_APP_ID = salvaEnv.a;
      if (salvaEnv.s !== undefined) process.env.SHOPEE_SECRET = salvaEnv.s;
      for (const p of [pastaConta, path.join(raiz, 'publico', conta), path.join(raiz, 'POSTAR-HOJE', conta)]) {
        fs.rmSync(p, { recursive: true, force: true });
      }
    }
  });

  await teste('post de conteúdo: faz a arte, entra na fila, 1 por dia e nunca repete', async () => {
    const sharp = require('sharp');
    const { preparar } = require('./conteudo');
    const { publicar } = require('./publicar');
    const raiz = path.join(__dirname, '..');
    const conta = 'teste-conteudo-' + process.pid;
    const pastaConta = path.join(raiz, 'contas', conta);
    try {
      fs.mkdirSync(path.join(pastaConta, 'conteudo'), { recursive: true });
      fs.copyFileSync(path.join(raiz, 'contas', 'lusia', 'config.json'), path.join(pastaConta, 'config.json'));
      await sharp({ create: { width: 800, height: 600, channels: 3, background: '#2a6' } }).png().toFile(path.join(pastaConta, 'conteudo', 'Ideia 1.png'));
      fs.writeFileSync(path.join(pastaConta, 'conteudo', 'Ideia 1.txt'), 'Título com emoji 🎄 & <sinais>\nLegenda 🐾\n#natal');
      fs.copyFileSync(path.join(pastaConta, 'conteudo', 'Ideia 1.png'), path.join(pastaConta, 'conteudo', 'Ideia 2.png'));
      fs.writeFileSync(path.join(pastaConta, 'conteudo', 'Ideia 2.txt'), 'Segunda ideia\nOutra legenda');
      fs.writeFileSync(path.join(pastaConta, 'conteudo', 'sem-imagem.txt'), 'X\nY');
      const fila = await preparar(conta, () => {});
      assert.strictEqual(fila.length, 2);
      const m = await sharp(path.join(raiz, 'publico', conta, fila[0].arte)).metadata();
      assert.deepStrictEqual([m.format, m.width, m.height], ['jpeg', 1080, 1350]);
      const lerCfg = maquina.lerConfig;
      maquina.lerConfig = (p) => ({ ...lerCfg(p), site: { ...lerCfg(p).site, urlBase: 'https://teste.github.io/ofertas' }, instagram: { ...lerCfg(p).instagram, conteudoAPartirDas: 0, conteudoPorDia: 1, conteudoPorRodada: 1 } });
      const reg = [];
      const opcoes = { ignorarDesligado: true, segredos: { igToken: 't', igUserId: '9' }, fetchFn: instagramFalso(reg), intervaloNoAr: 1, intervaloStatus: 1, log: () => {} };
      const r1 = await publicar(conta, opcoes);
      const r2 = await publicar(conta, opcoes);
      maquina.lerConfig = lerCfg;
      assert.strictEqual(r1.publicados, 1, 'não publicou o post de conteúdo');
      assert.strictEqual(r2.publicados, 0, 'passou de 1 post de conteúdo no mesmo dia');
      assert(reg.some((x) => x.corpo.caption && x.corpo.caption.includes('Legenda')));
      // No dia seguinte sai o próximo da fila (e nunca o mesmo de novo)
      const arqPub = path.join(pastaConta, 'publicados.json');
      const pub = JSON.parse(fs.readFileSync(arqPub, 'utf8'));
      for (const k of Object.keys(pub)) pub[k].quando = new Date(Date.now() - 86400000 * 2).toISOString();
      fs.writeFileSync(arqPub, JSON.stringify(pub));
      maquina.lerConfig = (p) => ({ ...lerCfg(p), site: { ...lerCfg(p).site, urlBase: 'https://teste.github.io/ofertas' }, instagram: { ...lerCfg(p).instagram, conteudoAPartirDas: 0 } });
      const r3 = await publicar(conta, opcoes);
      maquina.lerConfig = lerCfg;
      assert.strictEqual(r3.publicados, 1, 'não publicou o próximo da fila no outro dia');
      assert(reg.some((x) => x.corpo.caption === 'Outra legenda'), 'o segundo post não saiu');
      assert.strictEqual(reg.filter((x) => (x.corpo.caption || '').startsWith('Legenda')).length, 1, 'repetiu o primeiro post');
    } finally {
      for (const p of [pastaConta, path.join(raiz, 'publico', conta)]) fs.rmSync(p, { recursive: true, force: true });
    }
  });

  await teste('campanhas: datas certas (Black Friday, Páscoa, 11.11) e a mais específica ganha', async () => {
    const campanhas = require('./campanhas');
    assert.strictEqual(campanhas.pascoa(2027).toISOString().slice(0, 10), '2027-03-28');
    assert.strictEqual(campanhas.pascoa(2026).toISOString().slice(0, 10), '2026-04-05');
    const bf = campanhas.doAno(2026).find((k) => k.id === 'black-friday');
    assert(bf.de <= '2026-11-27' && '2026-11-27' <= bf.ate, 'Black Friday 2026 é 27/11');
    assert.strictEqual(campanhas.ativa('2026-11-27').id, 'black-friday', 'Black Friday ganha do Natal');
    assert.strictEqual(campanhas.ativa('2026-11-11').id, '11-11');
    assert.strictEqual(campanhas.ativa('2026-12-01').id, 'natal');
    assert.strictEqual(campanhas.ativa('2026-10-20'), null);
    assert.strictEqual(campanhas.ativa('2026-11-11', { campanhas: { desligadas: ['11-11'] } }).id, 'natal');
    const extra = { campanhas: { extras: [{ id: 'niver', nome: 'Aniversário da loja', de: '2026-10-19', ate: '2026-10-21', frase: '🎂 Aniversário!' }] } };
    assert.strictEqual(campanhas.ativa('2026-10-20', extra).titulo, 'ANIVERSÁRIO DA LOJA');
    assert.deepStrictEqual(campanhas.proximas('2026-10-25').map((k) => k.id), ['natal', '11-11', 'black-friday']);
    const cfg = campanhas.aplicar({ palavrasChave: ['natal'], hashtags: ['#natal'], hashtagsTikTok: [], hashtagsInstagram: ['#a'], corArte: '#b0294a' }, bf);
    assert.strictEqual(cfg.corArte, '#111111');
    assert(cfg.hashtagsInstagram[0] === '#blackfriday' && cfg.hashtags.filter((h) => h === '#natal').length === 1);
  });

  await teste('legendas da campanha e "Comente QUERO" (só quando a resposta automática está ligada)', async () => {
    const p = { productName: 'Pisca LED', price: 20, itemId: '1' };
    const campanha = { frase: '🖤 BLACK FRIDAY: teste' };
    const ig = textos.legendaInstagram(p, 1, ['#a'], { campanha, comenteQuero: true });
    assert(ig.startsWith('🖤 BLACK FRIDAY') && ig.includes('Comente QUERO') && ig.includes('#publi'));
    assert(!/\n\n\n/.test(ig) && !/🛍️ Pisca LED\n\n/.test(ig), 'linha vazia sobrando');
    assert(!textos.legendaInstagram(p, 1, ['#a']).includes('QUERO'));
    assert(textos.legendaCarrossel([p], [], { comenteQuero: true }).includes('Comente QUERO'));
    assert(textos.postComLink(p, 'http://x', { campanha }).startsWith('🖤'));
    assert(textos.legendasVideo(p, [], 'shopee', { campanha }).every((l) => l.includes('BLACK FRIDAY')));
  });

  await teste('resposta automática: entende "QUERO" de vários jeitos e não confunde', async () => {
    const { pedeLink } = require('./respostas');
    const palavras = ['quero', 'eu quero', 'link', 'eu'];
    for (const t of ['QUERO', 'Quéééro!!! 😍', 'eu quero 🙋', 'me passa o link?', 'Eu']) assert(pedeLink(t, palavras), t);
    for (const t of ['lindo demais', 'requerimento', 'eu amei', '', '😍😍']) assert(!pedeLink(t, palavras), t);
  });

  await teste('resposta automática: mensagem do direct com os links certos e até 1000 letras', async () => {
    const { mensagem } = require('./respostas');
    const ofertas = Array.from({ length: 10 }, (_, i) => ({ numero: i + 1, itemId: 'p' + i, nome: 'Produto de Natal com nome bem comprido número ' + i, preco: 'R$ 29,90', link: 'https://s.shopee.com.br/abcdefgh' + i }));
    const vitrine = 'https://teste.github.io/x/lusia/';
    const todos = mensagem({ chave: '2026-11-27:carrossel', dados: { ofertas }, vitrine });
    assert(todos.length <= 1000 && todos.includes(ofertas[0].link) && todos.includes('comissão'), 'carrossel');
    const um = mensagem({ chave: '2026-11-27:post:p3', dados: { ofertas }, vitrine });
    assert(um.includes(ofertas[3].link) && !um.includes(ofertas[0].link), 'post de 1 produto');
    assert(mensagem({ chave: 'conteudo:salsichinha', dados: null, vitrine }).includes(vitrine), 'post sem venda manda a vitrine');
    assert(mensagem({ chave: undefined, dados: null, vitrine }).includes(vitrine), 'post desconhecido manda a vitrine');
  });

  await teste('resposta automática completa: manda 1 direct por comentário e nunca repete', async () => {
    const { responder } = require('./respostas');
    const raiz = path.join(__dirname, '..');
    const conta = 'teste-respostas-' + process.pid;
    const pastaConta = path.join(raiz, 'contas', conta);
    const agora = Date.parse('2026-11-27T20:00:00Z');
    try {
      fs.mkdirSync(path.join(raiz, 'publico', conta, '2026-11-27'), { recursive: true });
      fs.mkdirSync(pastaConta, { recursive: true });
      fs.copyFileSync(path.join(raiz, 'contas', 'lusia', 'config.json'), path.join(pastaConta, 'config.json'));
      fs.writeFileSync(path.join(pastaConta, 'publicados.json'), JSON.stringify({ '2026-11-27:carrossel': { id: 'M1' } }));
      fs.writeFileSync(path.join(raiz, 'publico', conta, '2026-11-27', 'dados.json'), JSON.stringify({ ofertas: [{ numero: 1, itemId: 'a', nome: 'Pisca', preco: 'R$ 10,00', link: 'https://s.shopee.com.br/xyz' }] }));
      const lerCfg = maquina.lerConfig;
      maquina.lerConfig = (p) => ({ ...lerCfg(p), instagram: { ...lerCfg(p).instagram, respostas: { ativo: true } } });
      const reg = [];
      const fake = async (url, opt = {}) => {
        const u = String(url);
        const corpo = opt.body ? Object.fromEntries(new URLSearchParams(String(opt.body))) : {};
        reg.push({ u, corpo });
        if (u.includes('/9/media?')) return resposta(200, { data: [{ id: 'M1', timestamp: '2026-11-27T15:00:00+0000' }, { id: 'VELHO', timestamp: '2026-11-01T15:00:00+0000' }] });
        if (u.includes('/M1/comments')) {
          return resposta(200, {
            data: [
              { id: 'C1', text: 'QUERO!!', timestamp: '2026-11-27T16:00:00+0000', username: 'ana', from: { id: '55' } },
              { id: 'C2', text: 'que lindo', timestamp: '2026-11-27T16:01:00+0000', username: 'bia', from: { id: '56' } },
              { id: 'C3', text: 'quero', timestamp: '2026-11-27T16:02:00+0000', username: 'eu', from: { id: '9' } },
            ],
          });
        }
        if (u.includes('/VELHO/')) throw new Error('não devia ler post velho');
        if (u.endsWith('/9/messages')) return resposta(200, { recipient_id: '55', message_id: 'X' });
        if (u.endsWith('/C1/replies')) return resposta(200, { id: 'R1' });
        return resposta(400, { error: { message: 'inesperado ' + u, code: 100 } });
      };
      const opcoes = { segredos: { igToken: 't', igUserId: '9' }, fetchFn: fake, agora, log: () => {} };
      const r1 = await responder(conta, opcoes);
      const r2 = await responder(conta, opcoes);
      maquina.lerConfig = lerCfg;
      assert.strictEqual(r1.respondidos, 1, 'devia responder só a Ana');
      assert.strictEqual(r2.respondidos, 0, 'respondeu de novo o mesmo comentário');
      const dm = reg.filter((x) => x.u.endsWith('/9/messages'));
      assert.strictEqual(dm.length, 1);
      assert.strictEqual(JSON.parse(dm[0].corpo.recipient).comment_id, 'C1');
      assert(JSON.parse(dm[0].corpo.message).text.includes('https://s.shopee.com.br/xyz'), 'link errado no direct');
      assert(reg.some((x) => x.u.endsWith('/C1/replies')), 'faltou a resposta pública');
    } finally {
      for (const p of [pastaConta, path.join(raiz, 'publico', conta)]) fs.rmSync(p, { recursive: true, force: true });
    }
  });

  // ---------- TikTok (Content Posting API) ----------
  const tiktok = require('./tiktok');
  const SEG_TT = { tiktokKey: 'chave-tt', tiktokSecret: 'segredo-tt' };

  await teste('TikTok: pedaços seguem a regra oficial (5 a 64 MB, sobra no último)', async () => {
    const MB = 1024 * 1024;
    const p1 = tiktok.planoDePedacos(4 * MB);
    assert.deepStrictEqual([p1.total, p1.chunkSize], [1, 4 * MB], 'abaixo de 5 MB vai inteiro');
    const p2 = tiktok.planoDePedacos(50000123, 10000000);
    assert.strictEqual(p2.total, 5);
    assert.strictEqual(p2.pedacos[4].fim - p2.pedacos[4].inicio + 1, 10000123, 'a sobra vai no último pedaço');
    assert.strictEqual(p2.pedacos[4].fim, 50000122);
    const p3 = tiktok.planoDePedacos(23 * MB);
    assert(p3.pedacos.every((x, i) => i === 0 || x.inicio === p3.pedacos[i - 1].fim + 1), 'pedaços com buraco');
    assert.throws(() => tiktok.planoDePedacos(0), /vazio/);
  });

  await teste('TikTok: cofre guarda o token criptografado e só abre com o segredo certo', async () => {
    const c = tiktok.trancar({ access_token: 'AT-secreto', refresh_token: 'RT' }, 'segredo-tt');
    assert(!JSON.stringify(c).includes('AT-secreto'), 'token apareceu sem criptografia');
    assert.strictEqual(tiktok.destrancar(c, 'segredo-tt').access_token, 'AT-secreto');
    assert.throws(() => tiktok.destrancar(c, 'outro'), tiktok.ErroFatal);
  });

  await teste('TikTok: link de autorização tem os campos oficiais', async () => {
    const u = new URL(tiktok.linkDeAutorizacao({ clientKey: 'ck', redirectUri: 'https://x.github.io/a/tiktok-retorno.html', estado: 'e1' }));
    assert.strictEqual(u.origin + u.pathname, 'https://www.tiktok.com/v2/auth/authorize/');
    assert.strictEqual(u.searchParams.get('client_key'), 'ck');
    assert.strictEqual(u.searchParams.get('response_type'), 'code');
    assert(u.searchParams.get('scope').includes('video.upload'));
    assert.strictEqual(u.searchParams.get('redirect_uri'), 'https://x.github.io/a/tiktok-retorno.html');
  });

  await teste('TikTok: renova o token vencido e guarda o refresh token novo', async () => {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-'));
    const agora = Date.UTC(2026, 9, 17, 15);
    tiktok.salvarCofre(pasta, 'segredo-tt', { access_token: 'velho', refresh_token: 'RT1', expira_em: agora - 1000, refresh_expira_em: agora + 1e10 });
    let corpo;
    const fake = async (url, opt) => {
      assert(url.endsWith('/v2/oauth/token/'));
      corpo = new URLSearchParams(String(opt.body));
      return resposta(200, { access_token: 'novo', refresh_token: 'RT2', expires_in: 86400, refresh_expires_in: 31536000, open_id: 'o', scope: 'video.upload' });
    };
    assert.strictEqual(await tiktok.tokenValido(pasta, SEG_TT, fake, agora), 'novo');
    assert.strictEqual(corpo.get('grant_type'), 'refresh_token');
    assert.strictEqual(corpo.get('refresh_token'), 'RT1');
    assert.strictEqual(corpo.get('client_secret'), 'segredo-tt');
    assert.strictEqual(tiktok.lerCofre(pasta, 'segredo-tt').refresh_token, 'RT2', 'não guardou o refresh token novo');
    // token ainda bom: não chama a internet
    assert.strictEqual(await tiktok.tokenValido(pasta, SEG_TT, async () => assert.fail('não devia renovar'), agora), 'novo');
    fs.rmSync(pasta, { recursive: true, force: true });
  });

  await teste('TikTok: autorização tirada para na hora com aviso claro', async () => {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-'));
    tiktok.salvarCofre(pasta, 'segredo-tt', { access_token: 'a', refresh_token: 'r', expira_em: 0, refresh_expira_em: Date.now() + 1e9 });
    let n = 0;
    const fake = async () => (n++, resposta(400, { error: 'invalid_grant', error_description: 'x' }));
    await assert.rejects(tiktok.tokenValido(pasta, SEG_TT, fake), /Autorize de novo/);
    assert.strictEqual(n, 1, 'ficou tentando à toa');
    await assert.rejects(tiktok.tokenValido(fs.mkdtempSync(path.join(os.tmpdir(), 'tt-')), SEG_TT), /ainda não foi autorizado/);
    await assert.rejects(tiktok.tokenValido(pasta, {}), /TIKTOK_CLIENT_KEY/);
    fs.rmSync(pasta, { recursive: true, force: true });
  });

  // fetch falso do TikTok: registra tudo e responde como a API oficial
  const fakeTikTok = (reg, { statusFinal = 'SEND_TO_USER_INBOX', initErro } = {}) => async (url, opt = {}) => {
    const u = String(url);
    reg.push({ u, opt });
    if (u.startsWith('https://upload.fake/')) {
      const [, , total] = opt.headers['Content-Range'].match(/bytes (\d+)-(\d+)\/(\d+)/).slice(1).map(Number);
      const fim = Number(opt.headers['Content-Range'].match(/-(\d+)\//)[1]);
      return { ok: true, status: fim === total - 1 ? 201 : 206, json: async () => ({}) };
    }
    const corpo = JSON.parse(opt.body || '{}');
    if (u.endsWith('/creator_info/query/')) return resposta(200, { data: { creator_username: 'shopabessa', privacy_level_options: ['SELF_ONLY'], max_video_post_duration_sec: 600 }, error: { code: 'ok' } });
    if (u.endsWith('/video/init/')) {
      if (initErro) return resposta(403, { error: { code: initErro, message: 'x' } });
      return resposta(200, { data: { publish_id: 'v_pub_' + reg.length, upload_url: 'https://upload.fake/' + corpo.source_info.total_chunk_count }, error: { code: 'ok' } });
    }
    if (u.endsWith('/status/fetch/')) {
      const vezes = reg.filter((x) => x.u.endsWith('/status/fetch/')).length;
      return resposta(200, { data: { status: vezes < 2 ? 'PROCESSING_UPLOAD' : statusFinal, fail_reason: 'duration_check_failed' }, error: { code: 'ok' } });
    }
    return resposta(404, { error: { code: 'nao_existe', message: u } });
  };

  await teste('TikTok: rascunho vai para a caixa de entrada com o passo a passo oficial', async () => {
    const arq = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tt-')), '12h-video.mp4');
    fs.writeFileSync(arq, Buffer.alloc(1234, 7));
    const reg = [];
    const r = await tiktok.enviarVideo('TOKEN', arq, 'legenda', { modo: 'rascunho' }, fakeTikTok(reg), 1);
    assert.strictEqual(r.status, 'SEND_TO_USER_INBOX');
    const init = reg.find((x) => x.u.endsWith('/video/init/'));
    assert(init.u.endsWith('/v2/post/publish/inbox/video/init/'), 'rascunho devia usar a caixa de entrada');
    assert.strictEqual(init.opt.headers.Authorization, 'Bearer TOKEN');
    assert.deepStrictEqual(JSON.parse(init.opt.body).source_info, { source: 'FILE_UPLOAD', video_size: 1234, chunk_size: 1234, total_chunk_count: 1 });
    const put = reg.find((x) => x.opt.method === 'PUT');
    assert.strictEqual(put.opt.headers['Content-Range'], 'bytes 0-1233/1234');
    assert.strictEqual(put.opt.headers['Content-Type'], 'video/mp4');
    assert(!reg.some((x) => x.u.endsWith('/creator_info/query/')), 'rascunho não precisa ler o perfil');
  });

  await teste('TikTok: modo direto confere a privacidade, marca IA e envia em vários pedaços', async () => {
    const MB = 1024 * 1024;
    const arq = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tt-')), '18h-video.mp4');
    fs.writeFileSync(arq, Buffer.alloc(23 * MB, 1));
    const reg = [];
    const r = await tiktok.enviarVideo('T', arq, 'Ideias de Natal #tiktokshop', { modo: 'direto', ia: true }, fakeTikTok(reg, { statusFinal: 'PUBLISH_COMPLETE' }), 1);
    assert.strictEqual(r.status, 'PUBLISH_COMPLETE');
    const init = JSON.parse(reg.find((x) => x.u.endsWith('/v2/post/publish/video/init/')).opt.body);
    assert.strictEqual(init.post_info.privacy_level, 'SELF_ONLY');
    assert.strictEqual(init.post_info.is_aigc, true, 'faltou o rótulo de IA');
    assert.strictEqual(init.post_info.title, 'Ideias de Natal #tiktokshop');
    const puts = reg.filter((x) => x.opt.method === 'PUT');
    assert.strictEqual(puts.length, init.source_info.total_chunk_count);
    assert.strictEqual(puts.length, 2);
    assert.strictEqual(puts[1].opt.headers['Content-Range'], `bytes ${10 * MB}-${23 * MB - 1}/${23 * MB}`);
    await assert.rejects(
      tiktok.enviarVideo('T', arq, 'x', { modo: 'direto', privacidade: 'PUBLIC_TO_EVERYONE' }, fakeTikTok([])),
      (e) => e instanceof tiktok.ErroFatal && /não aceita a privacidade/.test(e.message)
    );
    await assert.rejects(tiktok.enviarVideo('T', arq, 'x', { modo: 'direto' }, fakeTikTok([], { initErro: 'unaudited_client_can_only_post_to_private_accounts' })), /conta PRIVADA/);
    await assert.rejects(tiktok.enviarVideo('T', arq, 'x', { modo: 'rascunho' }, fakeTikTok([], { statusFinal: 'FAILED' }), 1), /duração do vídeo/);
  });

  await teste('TikTok: legenda tira o lembrete de IA e barra "Shopee"', async () => {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-'));
    fs.writeFileSync(path.join(pasta, 'a.txt'), 'Ideias 🎄\n#natal\n\n(Ao postar: ligar "Conteúdo gerado por IA")\n');
    assert.deepStrictEqual(tiktok.lerLegenda(path.join(pasta, 'a.txt')), { legenda: 'Ideias 🎄\n#natal', ia: true });
    fs.writeFileSync(path.join(pasta, 'b.txt'), 'Achei na Shopee');
    assert.throws(() => tiktok.lerLegenda(path.join(pasta, 'b.txt')), /misturou/);
  });

  await teste('TikTok: robô completo manda 1 vídeo por rodada, só na hora certa, e nunca repete', async () => {
    const conta = 'teste-tiktok-' + process.pid;
    const raiz = path.join(__dirname, '..');
    const pastaConta = path.join(raiz, 'contas', conta);
    const fila = path.join(pastaConta, 'tiktok-fila', '2026-10-17');
    fs.mkdirSync(fila, { recursive: true });
    try {
      for (const h of ['12h', '18h', '20h']) {
        fs.writeFileSync(path.join(fila, `${h}-video.mp4`), Buffer.alloc(100, 2));
        fs.writeFileSync(path.join(fila, `${h}-legenda.txt`), `Vídeo das ${h}\n#natal\n`);
      }
      const cfg = { palavrasChave: ['natal'], tiktok: { ativo: false, modo: 'rascunho', porRodada: 1 } };
      const gravarCfg = () => fs.writeFileSync(path.join(pastaConta, 'config.json'), JSON.stringify(cfg));
      gravarCfg();
      const agora = new Date('2026-10-17T21:30:00Z'); // 18h30 em Brasília
      tiktok.salvarCofre(pastaConta, 'segredo-tt', { access_token: 'AT', refresh_token: 'RT', expira_em: agora.getTime() + 3600e3, refresh_expira_em: agora.getTime() + 1e10 });
      const reg = [];
      const op = { fetchFn: fakeTikTok(reg), agora, segredos: SEG_TT, log: () => {}, intervalo: 1 };
      const r0 = await tiktok.publicar(conta, op);
      assert.strictEqual(r0.enviados, 0, 'desligado não pode mandar nada');
      assert.strictEqual(reg.length, 0);
      cfg.tiktok.ativo = true;
      gravarCfg();
      const r1 = await tiktok.publicar(conta, op);
      const r2 = await tiktok.publicar(conta, op);
      const r3 = await tiktok.publicar(conta, op);
      assert.deepStrictEqual([r1.enviados, r2.enviados, r3.enviados], [1, 1, 0], 'o das 20h ainda não devia ir');
      const feitos = JSON.parse(fs.readFileSync(path.join(pastaConta, 'tiktok-publicados.json'), 'utf8'));
      assert.deepStrictEqual(Object.keys(feitos).sort(), ['2026-10-17/12h-video.mp4', '2026-10-17/18h-video.mp4']);
      assert.strictEqual(reg.filter((x) => x.opt.method === 'PUT').length, 2);
    } finally {
      fs.rmSync(pastaConta, { recursive: true, force: true });
    }
  });

  // ---------- Pedido da dona (19/10): "sacolinha" nunca aparece no que o público vê ----------
  await teste('nenhum texto público fala "sacolinha" (usa carrinho/link)', async () => {
    const aq = require('./aquecimento-tiktok');
    const publicos = [];
    for (let id = 1; id <= 30; id++) {
      const p = { itemId: 'x'.repeat(id), productName: 'Guirlanda de Natal', priceMin: '59.9', priceDiscountRate: 20, sales: 120 };
      for (const loja of ['shopee', 'tiktok']) publicos.push(...textos.legendasVideo(p, ['#natal'], loja));
      publicos.push(textos.legendaInstagram(p, 1, ['#natal']), textos.postComLink(p, 'https://s.shopee.com.br/x'), textos.videoIA(p).fala, textos.videoIA(p).video);
      publicos.push(aq.legendaSacolinha('Gancho ' + 'a'.repeat(id), 'Como decorar', 'Guirlanda', ['#natal']));
    }
    publicos.push(textos.legendaCarrossel([{ itemId: '1', productName: 'Guirlanda', priceMin: '59.9' }], ['#natal']));
    publicos.push(...aq.GANCHOS.map((g) => JSON.stringify(g)));
    // frases que vão na tela dos vídeos (constante interna do aquecimento)
    const fonte = fs.readFileSync(path.join(__dirname, 'aquecimento-tiktok.js'), 'utf8');
    publicos.push(fonte.match(/const FRASES_SACOLINHA = \[[^\]]*\]/)[0].replace('FRASES_SACOLINHA', ''));
    for (const t of publicos) assert(!/sacolinha/i.test(t), 'texto público com "sacolinha": ' + t);
    assert(publicos.some((t) => /carrinho/i.test(t)) && publicos.some((t) => /Clica no link/.test(t)), 'faltou a chamada nova (carrinho/link)');
  });

  // ---------- Conferência das 21h30 (resumo pelo Telegram) ----------
  await teste('conferência: resumo do dia sem internet e sem mexer no publicados.json real', async () => {
    const conf = require('./conferencia');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'conf-'));
    try {
      const arqPublicados = path.join(tmp, 'publicados.json');
      const arqFila = path.join(tmp, 'fila.json');
      fs.writeFileSync(arqPublicados, JSON.stringify({
        '2026-10-19:carrossel': { id: '1', quando: '2026-10-19T15:05:00Z' },
        '2026-10-19:story:a': { id: '2', quando: '2026-10-19T15:06:00Z' },
        'conteudo:x': { id: '3', quando: '2026-10-19T23:02:00Z' },
        'conteudo:velho': { id: '4', quando: '2026-10-17T23:02:00Z' },
      }));
      fs.writeFileSync(arqFila, JSON.stringify(['x', 'velho', 'a', 'b', 'c', 'd', 'e'].map((slug) => ({ slug }))));
      const agora = new Date('2026-10-20T00:30:00Z'); // 21h30 do dia 19 em Brasília
      const config = { instagram: { ativo: true, conteudoPorDia: 2, tokenVenceEm: '2026-12-15' } };
      const d = conf.conferirArquivos('lusia', { agora, arqPublicados, arqFila, config });
      assert.strictEqual(d.hoje, '2026-10-19');
      assert.deepStrictEqual(d.publicadosHoje, { carrossel: 1, story: 1, post: 0, conteudo: 1 });
      assert.strictEqual(d.filaRestante, 5);
      assert.strictEqual(d.tokenDias, 57);
      const ok = conf.montarResumo({ ...d, insta: { feedHoje: 2 }, robo: { total: 4, falhas: [] } });
      const linhas = ok.split('\n');
      assert.ok(linhas.length <= 8, 'resumo comprido demais: ' + linhas.length);
      assert.ok(linhas[0].includes('19/10'));
      assert.ok(/✅ Instagram: 3 publica/.test(ok), ok);
      assert.ok(ok.includes('5 post(s), dá para 2 dia(s)') && ok.includes('⚠️ Fila'), 'fila curta tem que avisar');
      assert.ok(ok.includes('✅ Token do Instagram: vence em 57 dia(s)'));
      assert.ok(ok.includes('✅ Robô: nenhuma falha'));
      assert.ok(ok.includes('TikTok: conferir no app'));
      assert.ok(ok.includes('1 ponto(s)'));
      // dia ruim: nada publicado, token perto de vencer, robô falhou, fila vazia
      const ruim = conf.montarResumo({ hoje: '2026-12-10', instagramLigado: true, publicadosHoje: { carrossel: 0, story: 0, post: 0, conteudo: 0 }, filaRestante: 0, porDia: 2, tokenDias: 5, insta: { feedHoje: 0 }, robo: { total: 3, falhas: ['Maquina de Ofertas', 'Maquina de Ofertas'] } });
      assert.ok(ruim.includes('⚠️ Instagram: nada publicado hoje'));
      assert.ok(ruim.includes('VAZIA'));
      assert.ok(ruim.includes('⚠️ Token do Instagram: vence em 5 dia(s). Renovar já'));
      assert.ok(ruim.includes('2 rodada(s) falharam') && ruim.includes('(Maquina de Ofertas)'));
      assert.ok(ruim.split('\n').length <= 8);
      const vencido = conf.montarResumo({ ...d, insta: { erro: 'token vencido' }, robo: null });
      assert.ok(vencido.includes('VENCEU') && vencido.includes('não consegui conferir'));
      // a conferência só lê: o arquivo continua igual
      assert.strictEqual(Object.keys(JSON.parse(fs.readFileSync(arqPublicados, 'utf8'))).length, 4);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  await teste('conferência: Telegram e GitHub de mentira; sem segredos só imprime', async () => {
    const conf = require('./conferencia');
    const pedidos = [];
    const falso = async (url, opt = {}) => {
      const u = String(url);
      pedidos.push({ u, opt });
      if (u.includes('api.telegram.org')) return { ok: true, status: 200, json: async () => ({ ok: true }) };
      if (u.includes('api.github.com')) return { ok: true, status: 200, json: async () => ({ workflow_runs: [
        { id: 1, name: 'Maquina de Ofertas', conclusion: 'success' },
        { id: 2, name: 'Respostas QUERO', conclusion: 'failure' },
        { id: 3, name: 'Conferencia 21h30', conclusion: null },
      ] }) };
      return { ok: false, status: 404, json: async () => ({}) };
    };
    const robo = await conf.conferirRobo({ fetchFn: falso, ghToken: 'gh', repo: 'dona/repo', runAtual: '3' });
    assert.deepStrictEqual(robo, { total: 2, falhas: ['Respostas QUERO'] });
    assert.ok(pedidos[0].u.includes('/repos/dona/repo/actions/runs'));
    assert.strictEqual(await conf.conferirRobo({ fetchFn: falso, ghToken: '', repo: '' }), null);
    await conf.enviarTelegram('oi', { token: 'TK', chatId: '42', fetchFn: falso });
    const tg = pedidos.find((p) => p.u.includes('telegram'));
    assert.ok(tg.u.endsWith('/botTK/sendMessage'));
    assert.strictEqual(JSON.parse(tg.opt.body).chat_id, '42');
    // Telegram recusou: o erro não mostra o token
    const recusa = async () => ({ ok: false, status: 401, json: async () => ({ ok: false, description: 'Unauthorized' }) });
    await assert.rejects(conf.enviarTelegram('oi', { token: 'SEGREDO123', chatId: '1', fetchFn: recusa }), (e) => !e.message.includes('SEGREDO123'));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'conf-'));
    try {
      const arqPublicados = path.join(tmp, 'publicados.json');
      fs.writeFileSync(arqPublicados, '{}');
      const antes = pedidos.length;
      const r = await conf.conferir('lusia', { fetchFn: falso, segredos: {}, arqPublicados, log: () => {} });
      assert.strictEqual(r.enviado, false);
      assert.ok(r.resumo.includes('Conferência'));
      assert.ok(!pedidos.slice(antes).some((p) => p.u.includes('sendMessage')), 'sem segredo não pode mandar');
      const r2 = await conf.conferir('lusia', { fetchFn: recusa, segredos: { telegramToken: 'x', telegramChatId: '1' }, arqPublicados, log: () => {} });
      assert.strictEqual(r2.enviado, false, 'Telegram fora do ar não quebra o robô');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  await teste('produtos da semana: no máximo 4, marca o que vende nas duas e diz o que a dona faz', async () => {
    const ps = require('./produtos-semana');
    const t = (nome, vendas, categoria, extra = {}) => ({ nome, vendas, cresc: 30, afiliados: 100, comissao: 10, preco: 20, categoria, ...extra });
    const tiktok = [
      t('Kit 4 capas de almofada Natal 45x45', 1500, 'natal'),
      t('Árvore de Natal 1,20 m', 3600, 'natal'),
      t('Pisca-pisca 100 LED 9 m', 9000, 'natal'),
      t('Organizador de edredom', 9000, 'casa'),
      t('Porta-ovos rolante', 2500, 'casa'),
      t('Cesto de roupa pop-up', 1800, 'casa'),
    ];
    const shopee = [
      { nome: 'Kit Feliz Natal 4 Capas de Almofada 45x45', link: 'https://s.shopee.com.br/x' },
      { nome: 'Presépio de Mesa MDF', link: null },
    ];
    const { lista, soShopee } = ps.escolher({ tiktok, shopee, vitrine: ['Kit 4 Capas de Almofada Natal'] });
    assert.ok(lista.length <= 4, 'nunca mais de 4 (ela fica confusa)');
    const capas = lista.find((p) => /capas/.test(p.nome));
    assert.ok(capas && capas.nasDuas && capas.naVitrine, 'capas vendem nas duas e já estão na vitrine');
    assert.ok(lista.filter((p) => p.categoria === 'casa').length >= 1 && lista.filter((p) => p.categoria === 'natal').length >= 1, 'mistura Natal e casa');
    assert.ok(!ps.parecidos('Árvore de Natal 1,20 m', 'Presépio de Mesa MDF'));
    const msg = ps.montarMensagem({ data: '2026-10-19', lista, soShopee });
    assert.ok(/só \d\)/.test(msg) && msg.includes('vende nas DUAS') && msg.includes('Você só faz'));
    assert.ok(!/sacolinha/i.test(msg) && !/[a-z]+ing\b/.test(msg), 'sem "sacolinha" e sem inglês');
  });

  // ---------- CONTA EDUCATIVA @colorecomhelena: separação à prova de bagunça (26/10) ----------
  const ID_HELENA = '17841420312757652';

  await teste('helena: config só educativo (sem Shopee, ofertas, TikTok, #publi, campanhas)', async () => {
    const raiz = path.join(__dirname, '..');
    const cru = JSON.parse(fs.readFileSync(path.join(raiz, 'contas', 'helena', 'config.json'), 'utf8'));
    assert.strictEqual(cru.tipo, 'educativo');
    assert.strictEqual(String(cru.instagram.idDaConta), ID_HELENA);
    for (const k of ['palavrasChave', 'filtros', 'hashtags', 'hashtagsTikTok', 'hashtagsInstagram', 'tiktok', 'campanhas', 'produtosPorDia']) {
      assert(!(k in cru), `config da helena não pode ter "${k}"`);
    }
    // (o endereço do site é o mesmo GitHub Pages da máquina, por isso fica de fora da busca)
    assert(!/shopee|#publi|achadinho|tiktok|carrinho|oferta/i.test(JSON.stringify({ ...cru, site: { ...cru.site, urlBase: '' } })), 'config da helena tem coisa de venda');
    const cfg = maquina.lerConfig(path.join(raiz, 'contas', 'helena'));
    assert(!('palavrasChave' in cfg) && !('hashtagsInstagram' in cfg), 'a conta educativa herdou coisas de venda do PADRAO');
    assert.notStrictEqual(String((maquina.lerConfig(path.join(raiz, 'contas', 'lusia')).instagram || {}).idDaConta || ''), ID_HELENA, 'a lusia não pode ter o ID da helena');
  });

  await teste('helena x lusia: cada conta só lê a PRÓPRIA chave (nunca a da outra)', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'seg-'));
    const nomes = ['INSTAGRAM_TOKEN', 'INSTAGRAM_USER_ID', 'INSTAGRAM_TOKEN_HELENA', 'INSTAGRAM_USER_ID_HELENA'];
    const salva = Object.fromEntries(nomes.map((n) => [n, process.env[n]]));
    try {
      fs.mkdirSync(path.join(tmp, 'helena'));
      fs.mkdirSync(path.join(tmp, 'lusia'));
      // Na nuvem só com as chaves da lusia: a helena NÃO pega a da lusia
      process.env.INSTAGRAM_TOKEN = 'token-lusia';
      process.env.INSTAGRAM_USER_ID = '111';
      delete process.env.INSTAGRAM_TOKEN_HELENA;
      delete process.env.INSTAGRAM_USER_ID_HELENA;
      let h = maquina.lerSegredos(path.join(tmp, 'helena'));
      assert(!h.igToken && !h.igUserId, 'a helena pegou a chave da lusia');
      // Com os Secrets da helena: cada uma com a sua
      process.env.INSTAGRAM_TOKEN_HELENA = 'token-helena';
      process.env.INSTAGRAM_USER_ID_HELENA = ID_HELENA;
      h = maquina.lerSegredos(path.join(tmp, 'helena'));
      const l = maquina.lerSegredos(path.join(tmp, 'lusia'));
      assert.deepStrictEqual([h.igToken, h.igUserId], ['token-helena', ID_HELENA]);
      assert.deepStrictEqual([l.igToken, l.igUserId], ['token-lusia', '111']);
      // Só as chaves da helena: a lusia não pega a da helena
      delete process.env.INSTAGRAM_TOKEN;
      delete process.env.INSTAGRAM_USER_ID;
      const l2 = maquina.lerSegredos(path.join(tmp, 'lusia'));
      assert(!l2.igToken && !l2.igUserId, 'a lusia pegou a chave da helena');
      // CHAVES.txt de cada pasta é só daquela conta
      fs.writeFileSync(path.join(tmp, 'helena', 'CHAVES.txt'), 'INSTAGRAM_TOKEN=arquivo-helena\nINSTAGRAM_USER_ID=' + ID_HELENA + '\n');
      delete process.env.INSTAGRAM_TOKEN_HELENA;
      delete process.env.INSTAGRAM_USER_ID_HELENA;
      assert.strictEqual(maquina.lerSegredos(path.join(tmp, 'helena')).igToken, 'arquivo-helena');
      assert(!maquina.lerSegredos(path.join(tmp, 'lusia')).igToken, 'a lusia leu o CHAVES.txt da helena');
    } finally {
      for (const n of nomes) {
        if (salva[n] === undefined) delete process.env[n];
        else process.env[n] = salva[n];
      }
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  await teste('trava de conta: helena só publica no ID dela; lusia nunca publica no ID da helena', async () => {
    const { publicar, conferirConta } = require('./publicar');
    const instagram = require('./instagram');
    const raiz = path.join(__dirname, '..');
    const cfgH = maquina.lerConfig(path.join(raiz, 'contas', 'helena'));
    const cfgL = maquina.lerConfig(path.join(raiz, 'contas', 'lusia'));
    conferirConta('helena', cfgH, ID_HELENA); // certo: passa
    assert.throws(() => conferirConta('helena', cfgH, '999'), instagram.ErroFatal);
    assert.throws(() => conferirConta('lusia', cfgL, ID_HELENA), instagram.ErroFatal);
    assert.throws(() => conferirConta('educ', { tipo: 'educativo', instagram: {} }, '1'), instagram.ErroFatal, 'educativa sem idDaConta não publica');
    // De ponta a ponta: chave errada = nenhum pedido ao Instagram
    const pastaTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'trava-'));
    const lerCfg = maquina.lerConfig;
    try {
      maquina.lerConfig = (p) => {
        const c = lerCfg(p);
        return { ...c, instagram: { ...c.instagram, carrosselAPartirDas: 0 } };
      };
      const reg = [];
      const op = (id) => ({ arqPublicados: path.join(pastaTmp, 'p.json'), ignorarDesligado: true, segredos: { igToken: 't', igUserId: id }, fetchFn: instagramFalso(reg), intervaloNoAr: 1, intervaloStatus: 1, log: () => {} });
      await assert.rejects(publicar('helena', op('111')), instagram.ErroFatal);
      assert.strictEqual(reg.length, 0, 'mandou pedido ao Instagram com a chave errada');
      const r = await maquina.rodar('lusia', true);
      const dia = path.basename(r.pastaDia).toLowerCase();
      await assert.rejects(publicar('lusia', { ...op(ID_HELENA), dia }), instagram.ErroFatal);
      assert.strictEqual(reg.length, 0, 'conteúdo da lusia foi para a conta da helena');
    } finally {
      maquina.lerConfig = lerCfg;
      fs.rmSync(pastaTmp, { recursive: true, force: true });
    }
  });

  await teste('fila da helena: barra venda (#publi, Shopee, carrinho, link, oferta) e imagem fora de 1080x1350', async () => {
    const sharp = require('sharp');
    const car = require('./carrosseis');
    for (const t of ['Compre com #publi', 'Achei na Shopee', 'Toca no carrinho', 'Link na bio', 'Oferta do dia', 'Clica no link 🛒']) {
      assert(car.problemasDoTexto(t).length, `deixou passar: ${t}`);
    }
    assert.strictEqual(car.problemasDoTexto('Salva para lembrar e manda para quem tem filho pequeno. #BNCC').length, 0);
    const raiz = path.join(__dirname, '..');
    const conta = 'teste-educ-' + process.pid;
    const pastaConta = path.join(raiz, 'contas', conta);
    const origem = fs.mkdtempSync(path.join(os.tmpdir(), 'car-'));
    try {
      fs.mkdirSync(pastaConta, { recursive: true });
      fs.writeFileSync(path.join(pastaConta, 'config.json'), JSON.stringify({ tipo: 'educativo', site: { urlBase: 'https://teste.github.io/x' }, instagram: { ativo: false, idDaConta: '5' } }));
      const fazer = async (nome, legenda, w = 1080, h = 1350, n = 3) => {
        const p = path.join(origem, nome);
        fs.mkdirSync(path.join(p, 'slides'), { recursive: true });
        for (let i = 1; i <= n; i++) await sharp({ create: { width: w, height: h, channels: 3, background: '#fde' } }).png().toFile(path.join(p, 'slides', String(i).padStart(2, '0') + '.png'));
        fs.writeFileSync(path.join(p, 'legenda.txt'), legenda);
        return p;
      };
      for (const leg of ['Use o cupom #publi', 'Tem na Shopee', 'Link no carrinho 🛒', 'Clica no link']) {
        await assert.rejects(car.enfileirar(conta, await fazer('ruim-' + leg.length + leg[0], leg), { log: () => {} }), /Não entrou/);
      }
      await assert.rejects(car.enfileirar(conta, await fazer('quadrado', 'Legenda boa', 1080, 1080), { log: () => {} }), /1080x1350/);
      await assert.rejects(car.enfileirar(conta, await fazer('um-so', 'Legenda boa', 1080, 1350, 1), { log: () => {} }), /2 a 10/);
      assert.strictEqual(car.lerFila(conta).length, 0, 'entrou coisa errada na fila');
      // Conta de vendas nunca recebe carrossel educativo
      await assert.rejects(car.enfileirar('lusia', await fazer('bom-lusia', 'Legenda boa'), { log: () => {} }), /não é educativa/);
      // O certo entra, vira JPEG 1080x1350 e não repete
      await car.enfileirar(conta, await fazer('03-bom', 'Legenda boa 🎨'), { log: () => {} });
      await assert.rejects(car.enfileirar(conta, path.join(origem, '03-bom'), { log: () => {} }), /já está na fila/);
      const fila = car.lerFila(conta);
      assert.strictEqual(fila.length, 1);
      const m = await sharp(path.join(raiz, 'publico', conta, fila[0].imagens[0])).metadata();
      assert.deepStrictEqual([m.format, m.width, m.height], ['jpeg', 1080, 1350]);
    } finally {
      for (const p of [pastaConta, path.join(raiz, 'publico', conta), origem]) fs.rmSync(p, { recursive: true, force: true });
    }
  });

  await teste('fila da helena de verdade: 01-bncc-cores antes de 02-maos-escola, tudo 1080x1350 e sem venda', async () => {
    const car = require('./carrosseis');
    const fila = car.lerFila('helena');
    const slugs = fila.map((c) => c.slug);
    assert(slugs.indexOf('01-bncc-cores') === 0 && slugs.indexOf('02-maos-escola') === 1, 'ordem errada: ' + slugs.join(', '));
    for (const c of fila) {
      const p = await car.conferirItem('helena', c);
      assert.strictEqual(p.length, 0, `${c.slug}: ${p.join('; ')}`);
    }
    assert(fila[0].legenda.includes('próximo post'), 'o post 1 promete o post 2');
  });

  await teste('helena: 1 carrossel por dia, às 19h, na ordem, nunca repete, sempre no ID da helena', async () => {
    const { publicar } = require('./publicar');
    const car = require('./carrosseis');
    // Regras de horário e ordem (função pura)
    const fila = [{ slug: 'a' }, { slug: 'b' }];
    assert.strictEqual(car.proximo(fila, {}, { hojeBR: '2026-10-27', horaBR: 18 }), null, 'antes das 19h não sai');
    assert.strictEqual(car.proximo(fila, {}, { hojeBR: '2026-10-27', horaBR: 19 }).slug, 'a');
    assert.strictEqual(car.proximo(fila, { 'carrossel:a': { quando: '2026-10-27T22:00:00Z' } }, { hojeBR: '2026-10-27', horaBR: 21 }), null, '2 no mesmo dia');
    assert.strictEqual(car.proximo(fila, { 'carrossel:a': { quando: '2026-10-26T22:00:00Z' } }, { hojeBR: '2026-10-27', horaBR: 19 }).slug, 'b');
    // De ponta a ponta com a fila real (arquivo de publicados TEMPORÁRIO)
    const pastaTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hel-'));
    const arqPublicados = path.join(pastaTmp, 'publicados.json');
    const real = path.join(__dirname, '..', 'contas', 'helena', 'publicados.json');
    const antesReal = fs.existsSync(real) ? fs.readFileSync(real, 'utf8') : null;
    const lerCfg = maquina.lerConfig;
    try {
      maquina.lerConfig = (p) => {
        const c = lerCfg(p);
        return c.tipo === 'educativo' ? { ...c, instagram: { ...c.instagram, carrosselAPartirDas: 0 } } : c;
      };
      const sim = await publicar('helena', { simular: true, arqPublicados, log: () => {} });
      assert.strictEqual(sim.tarefas.length, 1);
      assert.strictEqual(sim.tarefas[0].chave, 'carrossel:01-bncc-cores');
      const reg = [];
      const opcoes = { arqPublicados, ignorarDesligado: true, segredos: { igToken: 't', igUserId: ID_HELENA }, fetchFn: instagramFalso(reg), intervaloNoAr: 1, intervaloStatus: 1, log: () => {} };
      const r1 = await publicar('helena', opcoes);
      const r2 = await publicar('helena', opcoes);
      assert.strictEqual(r1.publicados, 1);
      assert.strictEqual(r2.publicados, 0, 'saíram 2 no mesmo dia');
      const posts = reg.filter((x) => x.metodo === 'POST');
      assert(posts.length && posts.every((x) => x.u.includes(`/${ID_HELENA}/`)), 'pedido fora do ID da helena');
      const filhos = posts.filter((x) => x.corpo.is_carousel_item);
      assert.strictEqual(filhos.length, 5);
      assert(filhos.every((x) => x.corpo.image_url.startsWith('https://lusiabessa-rgb.github.io/achadinhos/helena/carrosseis/01-bncc-cores/')));
      const legenda = posts.find((x) => x.corpo.media_type === 'CAROUSEL').corpo.caption;
      assert(!/#publi|shopee|carrinho|\blink\b/i.test(legenda));
      assert(!reg.some((x) => /\/lusia\//.test(x.corpo.image_url || '')), 'imagem da lusia na helena');
      // No dia seguinte: o 2º (e nunca o 1º de novo)
      const pub = JSON.parse(fs.readFileSync(arqPublicados, 'utf8'));
      for (const k of Object.keys(pub)) pub[k].quando = new Date(Date.now() - 86400000).toISOString();
      fs.writeFileSync(arqPublicados, JSON.stringify(pub));
      const r3 = await publicar('helena', opcoes);
      assert.strictEqual(r3.publicados, 1);
      assert.strictEqual(reg.filter((x) => x.corpo.is_carousel_item).slice(5).every((x) => x.corpo.image_url.includes('/02-maos-escola/')), true, 'não saiu o 2º na ordem');
      assert.strictEqual(fs.existsSync(real) ? fs.readFileSync(real, 'utf8') : null, antesReal, 'o teste mexeu no publicados.json real da helena');
    } finally {
      maquina.lerConfig = lerCfg;
      fs.rmSync(pastaTmp, { recursive: true, force: true });
    }
  });

  console.log(`\nResultado: ${passou} ok, ${falhou} falhou.`);
  process.exitCode = falhou ? 1 : 0;
})();
