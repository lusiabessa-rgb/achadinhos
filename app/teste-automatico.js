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
    const arqPub = path.join(__dirname, '..', 'contas', 'lusia', 'publicados.json');
    const antes = fs.existsSync(arqPub) ? fs.readFileSync(arqPub, 'utf8') : null;
    try {
      const sim = await publicar('lusia', { simular: true, dia, log: () => {} });
      assert.strictEqual(sim.tarefas.filter((t) => t.tipo === 'carrossel').length, 1);
      assert(sim.tarefas[0].legenda.includes('bio'));
      const reg = [];
      const opcoes = { dia, ignorarDesligado: true, segredos: { igToken: 't', igUserId: '9' }, fetchFn: instagramFalso(reg), intervaloNoAr: 1, intervaloStatus: 1, log: () => {} };
      const lerCfg = maquina.lerConfig;
      maquina.lerConfig = (p) => ({ ...lerCfg(p), site: { ...lerCfg(p).site, urlBase: 'https://teste.github.io/ofertas' } });
      const r1 = await publicar('lusia', opcoes);
      const r2 = await publicar('lusia', opcoes);
      maquina.lerConfig = lerCfg;
      assert.strictEqual(r1.publicados, sim.tarefas.length);
      assert.strictEqual(r2.publicados, 0, 'publicou de novo o que já tinha publicado');
      assert(reg.some((x) => x.corpo.image_url && x.corpo.image_url.startsWith('https://teste.github.io/ofertas/lusia/')));
    } finally {
      if (antes === null) fs.rmSync(arqPub, { force: true });
      else fs.writeFileSync(arqPub, antes);
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

  console.log(`\nResultado: ${passou} ok, ${falhou} falhou.`);
  process.exitCode = falhou ? 1 : 0;
})();
