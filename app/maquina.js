// MÁQUINA DE OFERTAS
// Uso:  node app/maquina.js <conta> [--teste]
// Cada conta (pessoa) tem a sua pasta em contas/<conta>, com config.json e CHAVES.txt.
// Isso já deixa a máquina pronta para, no futuro, ter várias assinantes.
//
// Duas lojas:
//  - SHOPEE: automática pela API oficial (acha produto, gera link, escreve os textos).
//  - TIKTOK SHOP: o TikTok não libera API de produtos para afiliadas no Brasil (até 16/10/2026).
//    Então a dona lista os produtos em contas/<conta>/tiktok-produtos.txt e a máquina faz o resto.
const fs = require('fs');
const path = require('path');
const cacador = require('./cacador');
const textos = require('./textos');
const historico = require('./historico');
const shopee = require('./shopee');
const painel = require('./painel');
const artes = require('./artes');
const vitrine = require('./vitrine');

const RAIZ = path.join(__dirname, '..');

const PADRAO = {
  palavrasChave: [],
  produtosPorDia: 5,
  naoRepetirPorDias: 7,
  filtros: { comissaoMinimaPct: 5, vendasMinimas: 100, notaMinima: 4.3, precoMin: 10, precoMax: 250, palavrasProibidas: [] },
  hashtags: ['#achadinhosshopee'],
  hashtagsTikTok: ['#tiktokshop', '#achadinhos'],
  hashtagsInstagram: ['#achadinhos', '#achadinhosshopee'],
  marca: '',
  corArte: '#ee4d2d',
  site: { titulo: 'Achadinhos do dia', subtitulo: 'As melhores ofertas' },
};

function lerConfig(pastaConta) {
  const arq = path.join(pastaConta, 'config.json');
  let c;
  try {
    c = JSON.parse(fs.readFileSync(arq, 'utf8'));
  } catch (e) {
    throw new Error(`O arquivo ${arq} está com erro de digitação (${e.message}).`);
  }
  const config = { ...PADRAO, ...c, filtros: { ...PADRAO.filtros, ...(c.filtros || {}) }, site: { ...PADRAO.site, ...(c.site || {}) }, instagram: { ...(c.instagram || {}) } };
  if (!Array.isArray(config.palavrasChave) || !config.palavrasChave.length) {
    throw new Error('O config.json precisa de pelo menos 1 palavra em "palavrasChave".');
  }
  return config;
}

// Segredos: no PC vêm do CHAVES.txt; na nuvem (GitHub) vêm dos "Secrets", que viram variáveis de ambiente.
// Nomes aceitos: APP_ID, SECRET, INSTAGRAM_TOKEN, INSTAGRAM_USER_ID (na nuvem: SHOPEE_APP_ID, SHOPEE_SECRET...).
function lerSegredos(pastaConta) {
  const s = {};
  const arq = path.join(pastaConta, 'CHAVES.txt');
  if (fs.existsSync(arq)) {
    for (const linha of fs.readFileSync(arq, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
      const m = linha.match(/^\s*([A-Za-z_]+)\s*=\s*(.+?)\s*$/);
      if (m && !/cole aqui/i.test(m[2])) s[m[1].toUpperCase()] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  const env = process.env;
  return {
    appId: env.SHOPEE_APP_ID || s.APP_ID,
    secret: env.SHOPEE_SECRET || s.SECRET,
    igToken: env.INSTAGRAM_TOKEN || s.INSTAGRAM_TOKEN,
    igUserId: env.INSTAGRAM_USER_ID || s.INSTAGRAM_USER_ID,
  };
}

function lerChaves(pastaConta) {
  const { appId, secret } = lerSegredos(pastaConta);
  if (!appId || !secret) {
    throw new Error('Falta colar o APP_ID e o SECRET no arquivo ' + path.join(pastaConta, 'CHAVES.txt'));
  }
  return { appId, secret };
}

// "1.249,90" e "49,90" (jeito brasileiro) ou "49.90" -> número
function numeroBR(s) {
  let t = String(s || '').replace(/[^\d,.]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  return Number(t) || 0;
}

// Lista manual da Shopee (enquanto não há chaves da API), uma linha por produto:
//   nome | preço | comissão % | link de afiliada | foto | frase de benefício
//   (foto e frase são opcionais; foto = link da foto ou arquivo em contas/<conta>/fotos)
// O mesmo produto é reconhecido pelo número dele no link (não repete na semana).
function lerShopeeManual(pastaConta, avisar = () => {}) {
  const arq = path.join(pastaConta, 'shopee-produtos.txt');
  if (!fs.existsSync(arq)) return null;
  const lista = [];
  fs.readFileSync(arq, 'utf8')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .forEach((linha, i) => {
      const l = linha.trim();
      if (!l || l.startsWith('#')) return;
      const partes = l.split('|').map((s) => s.trim());
      // O link pode estar em qualquer coluna: acha o que começa com http e parece Shopee
      const iLink = partes.findIndex((s) => /^https?:\/\/(\S+\.)?(shopee\.com\.br|shp\.ee)\//i.test(s));
      if (iLink < 0) {
        avisar(`  aviso: linha ${i + 1} do shopee-produtos.txt sem link da Shopee; pulei.`);
        return;
      }
      const link = partes[iLink];
      const resto = partes.filter((_, k) => k !== iLink);
      const [nome, preco, comissao, ...extras] = resto;
      // Depois da comissão: o que parece foto (link ou arquivo .jpg/.png/.webp) é a foto; o resto é a frase de benefício
      const ehFoto = (s) => /^https?:\/\//i.test(s) || /\.(jpe?g|png|webp)$/i.test(s);
      const foto = extras.find(ehFoto);
      const info = extras.filter((s) => s && !ehFoto(s)).join(' ');
      if (!nome) {
        avisar(`  aviso: linha ${i + 1} do shopee-produtos.txt sem nome; pulei.`);
        return;
      }
      // Número do produto: ".../i.LOJA.ITEM", ".../product/LOJA/ITEM" ou o código do link curto
      const m = link.match(/i\.(\d+)\.(\d+)/) || link.match(/product\/(\d+)\/(\d+)/);
      const curto = link.match(/(?:s\.shopee\.com\.br|shp\.ee)\/([\w-]+)/i);
      const itemId = m ? m[2] : curto ? 'sp-' + curto[1] : 'sp-' + nome.toLowerCase();
      let imageUrl = '';
      if (foto) {
        if (/^https?:\/\//i.test(foto)) imageUrl = foto;
        else {
          const local = path.join(pastaConta, 'fotos', foto);
          if (fs.existsSync(local)) imageUrl = local;
          else avisar(`  aviso: não achei a foto "${foto}" na pasta fotos; a arte sai sem foto.`);
        }
      }
      lista.push({
        itemId,
        productName: nome,
        price: numeroBR(preco),
        commissionRate: numeroBR(comissao) / 100,
        offerLink: link,
        info,
        imageUrl,
      });
    });
  return lista;
}

// "Cortina LED | 49,90 | 12%"  ->  produto (preço e comissão são opcionais)
function lerTikTok(pastaConta) {
  const arq = path.join(pastaConta, 'tiktok-produtos.txt');
  if (!fs.existsSync(arq)) return [];
  return fs
    .readFileSync(arq, 'utf8')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const [nome, preco, comissao] = l.split('|').map((s) => (s || '').trim());
      return { itemId: 'tt-' + nome.toLowerCase(), productName: nome, price: numeroBR(preco), commissionRate: numeroBR(comissao) / 100 };
    })
    .filter((p) => p.productName);
}

const nomePasta = (s) =>
  s.slice(0, 45).replace(/[^\p{L}\p{N} -]/gu, '').replace(/\s+/g, ' ').trim() || 'produto';

async function baixarImagem(url, destino) {
  if (!url) return false;
  try {
    // Foto que já está no computador (lista manual): só copia
    if (!/^https?:\/\//i.test(url)) {
      fs.copyFileSync(url, destino);
      return true;
    }
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) return false;
    fs.writeFileSync(destino, Buffer.from(await r.arrayBuffer()));
    return true;
  } catch {
    return false;
  }
}

async function rodar(conta, modoTeste) {
  const pastaConta = path.join(RAIZ, 'contas', conta);
  if (!fs.existsSync(pastaConta)) throw new Error(`A conta "${conta}" não existe em ${path.join(RAIZ, 'contas')}`);

  const hoje = new Date().toLocaleDateString('sv-SE'); // 2026-10-16
  const pastaDia = path.join(RAIZ, 'POSTAR-HOJE', conta, hoje + (modoTeste ? '-TESTE' : ''));
  fs.mkdirSync(pastaDia, { recursive: true });

  const diario = [];
  const log = (msg) => {
    console.log(msg);
    diario.push(`[${new Date().toLocaleTimeString('pt-BR')}] ${msg}`);
  };
  const salvarDiario = () => fs.appendFileSync(path.join(pastaDia, 'diario.txt'), diario.join('\n') + '\n');

  try {
    const config = lerConfig(pastaConta);
    // Sem as chaves da Shopee ainda? Usa o modo manual (produtos escolhidos em shopee-manual.json)
    const seg = lerSegredos(pastaConta);
    const manual = !modoTeste && !(seg.appId && seg.secret);
    const chaves = modoTeste || manual ? null : lerChaves(pastaConta);
    let listaManual = [];
    if (manual) {
      // Preferência: a listinha de texto (shopee-produtos.txt); o shopee-manual.json antigo também vale
      listaManual = lerShopeeManual(pastaConta, log);
      const arqJson = path.join(pastaConta, 'shopee-manual.json');
      if (!listaManual && fs.existsSync(arqJson)) {
        try {
          listaManual = JSON.parse(fs.readFileSync(arqJson, 'utf8'));
        } catch (e) {
          throw new Error(`O arquivo ${arqJson} está com erro de digitação (${e.message}).`);
        }
      }
      if (!listaManual) {
        throw new Error('Sem chaves da Shopee e sem a lista de produtos (contas/' + conta + '/shopee-produtos.txt).');
      }
      if (!Array.isArray(listaManual)) throw new Error('A lista manual da Shopee precisa ser uma lista de produtos.');
    }
    const hist = historico.abrir(path.join(pastaConta, 'historico.json'));
    const resumo = [`# Postar hoje (${hoje})`, ''];
    const mensagens = [];
    const cartoesShopee = [];
    const cartoesTikTok = [];
    const ofertas = [];
    const produtosDoDia = [];
    const pastaPublica = path.join(RAIZ, 'publico', conta);
    const diaPublico = hoje + (modoTeste ? '-teste' : '');

    // ---------- SHOPEE ----------
    log(`Caçando produtos na Shopee para "${conta}"${modoTeste ? ' (MODO TESTE)' : ''}...`);
    const escolhidos = manual
      ? cacador.cacarManual(config, listaManual, hist)
      : await cacador.cacar(config, chaves, hist, modoTeste, log);
    if (manual) log('Modo manual: ' + escolhidos.length + ' produto(s) da lista escolhida.');
    // Dicas do curso (Desafio 3k): horários de mais movimento e Shopee Vídeos espalhado ao longo do dia
    resumo.push(
      '> Melhores horários para postar: 12h, 18h e 20h (se não der, poste quando puder: constância vale mais).',
      '> Shopee Vídeos: não poste tudo de uma vez; espalhe ao longo do dia. Remova os metadados antes.',
      ''
    );
    resumo.push('## Shopee (Shopee Vídeos + grupos)', '');
    if (!escolhidos.length) resumo.push('Nenhum produto passou nos filtros hoje. Afrouxe os filtros no config.json.');

    let ok = 0;
    for (const p of escolhidos) {
      try {
        const n = String(ok + 1).padStart(2, '0');
        let link = p.offerLink || p.productLink;
        if (!modoTeste && !manual) {
          link = await shopee
            .gerarLinkCurto(chaves, p.productLink || p.offerLink, `maq${hoje.replace(/-/g, '')}`)
            .catch((e) => {
              log(`  aviso: link curto falhou (${e.message}); usando o link de oferta.`);
              return p.offerLink || p.productLink;
            });
        }
        const pasta = path.join(pastaDia, 'shopee', `${n}-${nomePasta(p.productName)}`);
        fs.mkdirSync(pasta, { recursive: true });
        const temFoto = await baixarImagem(p.imageUrl, path.join(pasta, 'foto-produto.jpg'));
        const info = textos.resumo(p);
        const pct = (Number(p.commissionRate) * 100).toFixed(0);
        fs.writeFileSync(
          path.join(pasta, 'LEIA.txt'),
          [
            `PRODUTO: ${p.productName}`,
            `Preço: ${info.preco}${info.desc}  |  Comissão: ${pct}% (≈ R$ ${p.commission || '?'})`,
            `Vendas: ${info.vendas || '?'}  |  Nota: ${p.ratingStar || '?'}  |  Loja: ${p.shopName || '?'}`,
            `Link de afiliada: ${link}`,
            temFoto ? 'Foto: foto-produto.jpg (nesta pasta)' : 'Foto: não baixada',
            '',
            '=== SHOPEE VÍDEOS (sem link: marque o produto no vídeo) ===',
            ...textos.legendasVideo(p, config.hashtags, 'shopee').map((l, k) => `\n--- Variação ${k + 1} ---\n${l}`),
            '',
            '=== TELEGRAM / WHATSAPP (com link) ===',
            textos.postComLink(p, link),
            '',
            '=== PINTEREST (use a arte-oferta.jpg desta pasta) ===',
            ...(() => {
              const pin = textos.pinterest(p, link, config.palavrasChave);
              return [`Título: ${pin.titulo}`, `Descrição: ${pin.descricao}`, `Link: ${pin.link}`];
            })(),
          ].join('\n')
        );
        mensagens.push(textos.postComLink(p, link));
        cartoesShopee.push({
          nome: p.productName,
          preco: info.preco + info.desc,
          comissao: `${pct}%${p.commission ? ` (≈ R$ ${String(p.commission).replace('.', ',')})` : ''}`,
          vendas: info.vendas,
          link,
          // Foto do computador não abre no celular: o painel usa a arte publicada no site
          foto: /^https?:\/\//i.test(p.imageUrl || '') ? p.imageUrl : config.site.urlBase ? `${config.site.urlBase}/${conta}/${diaPublico}/${n}.jpg` : '',
          legendas: textos.legendasVideo(p, config.hashtags, 'shopee'),
          textoGrupo: textos.postComLink(p, link),
        });
        resumo.push(`${n}. ${p.productName} | ${info.preco} | comissão ${pct}% | ${info.vendas}`);

        // Arte da oferta: vai para a pasta do produto e para o site público (o Instagram busca de lá)
        const arteRel = `${diaPublico}/${n}.jpg`;
        const arteArq = path.join(pastaPublica, arteRel);
        fs.mkdirSync(path.dirname(arteArq), { recursive: true });
        const precoNum = Number(p.priceMin || p.price);
        const descNum = Math.round(Number(p.priceDiscountRate) || 0);
        await artes.fazerArte(
          {
            nome: p.productName,
            preco: info.preco,
            precoAntigo: descNum > 0 && descNum < 95 ? textos.resumo({ price: precoNum / (1 - descNum / 100) }).preco : '',
            desconto: descNum > 0 ? descNum : 0,
            foto: temFoto ? fs.readFileSync(path.join(pasta, 'foto-produto.jpg')) : p.imageUrl,
          },
          arteArq,
          { marca: config.marca, cor: config.corArte, chamada: `Link na bio  ·  oferta nº ${ok + 1}` }
        );
        fs.copyFileSync(arteArq, path.join(pasta, 'arte-oferta.jpg'));
        ofertas.push({
          numero: ok + 1,
          itemId: String(p.itemId),
          nome: p.productName,
          preco: info.preco + info.desc,
          link,
          arte: arteRel,
          legendaInstagram: textos.legendaInstagram(p, ok + 1, config.hashtagsInstagram),
        });
        produtosDoDia.push(p);
        hist.marcar(p.itemId);
        ok++;
      } catch (e) {
        log(`  aviso: pulei "${p.productName}" por causa de um erro: ${e.message}`);
      }
    }
    log(`Shopee: ${ok} produto(s) prontos.`);

    // ---------- TIKTOK SHOP ----------
    const tiktok = lerTikTok(pastaConta);
    resumo.push('', '## TikTok Shop', '');
    if (!tiktok.length) {
      resumo.push('Nenhum produto na lista (contas/' + conta + '/tiktok-produtos.txt).');
    }
    tiktok.forEach((p, i) => {
      const n = String(i + 1).padStart(2, '0');
      const pasta = path.join(pastaDia, 'tiktok', `${n}-${nomePasta(p.productName)}`);
      fs.mkdirSync(pasta, { recursive: true });
      fs.writeFileSync(
        path.join(pasta, 'LEIA.txt'),
        [
          `PRODUTO: ${p.productName}`,
          '',
          '=== TIKTOK SHOP (sem link: anexe o produto no carrinho) ===',
          ...textos.legendasVideo(p, config.hashtagsTikTok, 'tiktok').map((l, k) => `\n--- Variação ${k + 1} ---\n${l}`),
        ].join('\n')
      );
      resumo.push(`${n}. ${p.productName}`);
      cartoesTikTok.push({
        nome: p.productName,
        preco: textos.resumo(p).preco,
        comissao: p.commissionRate ? `${Math.round(p.commissionRate * 100)}%` : '',
        legendas: textos.legendasVideo(p, config.hashtagsTikTok, 'tiktok'),
      });
    });
    if (tiktok.length) log(`TikTok Shop: ${tiktok.length} produto(s) prontos.`);

    fs.writeFileSync(path.join(pastaDia, 'RESUMO.md'), resumo.join('\n') + '\n');
    fs.writeFileSync(path.join(pastaDia, 'mensagens-grupo.txt'), mensagens.join('\n\n━━━━━━━━━━\n\n') + '\n');

    // Painel: um na pasta do dia e uma cópia "ABRIR-HOJE.html" sempre no mesmo lugar
    const html = painel.gerar({ data: hoje, conta, shopee: cartoesShopee, tiktok: cartoesTikTok, mensagensGrupo: mensagens });
    fs.writeFileSync(path.join(pastaDia, 'painel.html'), html);
    if (!modoTeste) fs.writeFileSync(path.join(RAIZ, 'POSTAR-HOJE', conta, 'ABRIR-HOJE.html'), html);

    // Site público: página "link na bio" + painel + dados do dia (usados pelo publicador do Instagram)
    // Sem oferta nova? Não mexe no site: as ofertas de antes continuam no ar.
    if (!ok) log('Nenhuma oferta nova: o site continua com as ofertas de antes.');
    else {
      const sufixo = modoTeste ? '-teste' : '';
      fs.mkdirSync(path.join(pastaPublica, diaPublico), { recursive: true });
      fs.writeFileSync(
        path.join(pastaPublica, diaPublico, 'dados.json'),
        JSON.stringify(
          { data: hoje, conta, ofertas, legendaCarrossel: textos.legendaCarrossel(produtosDoDia, config.hashtagsInstagram) },
          null,
          2
        )
      );
      fs.writeFileSync(
        path.join(pastaPublica, `index${sufixo}.html`),
        vitrine.gerar({ titulo: config.site.titulo, subtitulo: config.site.subtitulo, data: hoje, ofertas })
      );
      fs.writeFileSync(path.join(pastaPublica, `painel${sufixo}.html`), html);
      if (!modoTeste) fs.writeFileSync(path.join(pastaPublica, 'hoje.txt'), diaPublico);
    }
    if (!modoTeste) hist.salvar();
    log(`Pronto! Abra a pasta: ${pastaDia}`);
    return { pastaDia, shopee: ok, tiktok: tiktok.length };
  } catch (e) {
    log('ERRO: ' + e.message);
    throw e;
  } finally {
    salvarDiario();
  }
}

if (require.main === module) {
  const conta = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'lusia';
  rodar(conta, process.argv.includes('--teste')).catch(() => {
    process.exitCode = 1;
  });
}

module.exports = { rodar, lerChaves, lerSegredos, lerTikTok, lerShopeeManual, lerConfig };
