// FILA DE CARROSSÉIS EDUCATIVOS (contas com "tipo": "educativo", ex.: @colorecomhelena)
// Projeto SEPARADO das vendas: aqui nunca entra oferta, #publi, Shopee, carrinho nem link.
//   contas/<conta>/carrosseis/fila.json          -> a fila, na ordem em que sai (1 por dia)
//   publico/<conta>/carrosseis/<slug>/01.jpg...  -> as imagens (servidas pelo GitHub Pages)
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

// Palavras de VENDA: travam a fila educativa (pedido da dona: nada de bagunça entre os projetos)
const PROIBIDAS = [
  [/#publi\b/i, '#publi'],
  [/shopee/i, 'Shopee'],
  [/carrinho/i, 'carrinho'],
  [/\blinks?\b/i, 'link'],
  [/ofertas?\b/i, 'oferta'],
  [/sacolinha/i, 'sacolinha'],
  [/tiktok\s*shop/i, 'TikTok Shop'],
  [/achadinho/i, 'achadinho'],
  [/cupom|cupons/i, 'cupom'],
  [/desconto/i, 'desconto'],
  [/comiss[aã]o/i, 'comissão'],
];

// Carrossel do @achadinhoabessa (conta de vendas, modo "achadinho"): conteúdo de pesquisa, SEM venda direta.
// Pode falar "achadinho", @achadinhoabessa e TikTok Shop; não pode #publi, link, carrinho, sacolinha, preço, cupom, criança.
const PROIBIDAS_ACHADINHO = [
  [/#publi\b/i, '#publi'],
  [/\blinks?\b/i, 'link'],
  [/carrinho/i, 'carrinho'],
  [/sacolinha/i, 'sacolinha'],
  [/R\$|\breais\b|pre[cç]o/i, 'preço'],
  [/cupom|cupons/i, 'cupom'],
  [/crian[cç]a|\bbeb[êe]|\bmenin[oa]s?\b|\bfilh[oa]s?\b/i, 'criança'],
];

function problemasDoTexto(texto, modo = 'educativo') {
  const t = String(texto || '');
  if (modo === 'achadinho') return PROIBIDAS_ACHADINHO.filter(([re]) => re.test(t)).map(([, nome]) => `a legenda tem "${nome}" (carrossel do achadinho não leva venda)`);
  return PROIBIDAS.filter(([re]) => re.test(t)).map(([, nome]) => `a legenda tem "${nome}" (conta educativa não leva venda)`);
}

// Faixa vermelha de oferta (#b0294a): uma linha inteira (mais de 50%) dessa cor = arte de oferta antiga, proibida
async function temFaixaVermelha(arquivo) {
  const sharp = require('sharp');
  const { data, info } = await sharp(arquivo).removeAlpha().resize(108, 135, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const [r0, g0, b0] = [0xb0, 0x29, 0x4a];
  for (let y = 0; y < info.height; y++) {
    let n = 0;
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 3;
      if (Math.abs(data[i] - r0) + Math.abs(data[i + 1] - g0) + Math.abs(data[i + 2] - b0) < 45) n++;
    }
    if (n / info.width > 0.5) return true;
  }
  return false;
}

// Modo do carrossel da conta: "educativo" (helena), "achadinho" (conta de vendas com carrosselAtivo) ou null
function modoDaConta(config) {
  if (config && config.tipo === 'educativo') return 'educativo';
  if (config && config.instagram && config.instagram.carrosselAtivo === true) return 'achadinho';
  return null;
}

// Linhas de anotação interna ("Informação de pesquisa, sem link e sem preço.") não vão para a legenda do achadinho
const limparLegenda = (t) =>
  String(t || '')
    .split(/\r?\n/)
    .filter((l) => !/^\s*informa[cç][aã]o de pesquisa/i.test(l))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

// Confere as imagens de um carrossel: 2 a 10, todas 1080x1350 (o Instagram não corta nada)
async function problemasDasImagens(arquivos, { formato, semFaixa = false } = {}) {
  const sharp = require('sharp');
  const p = [];
  if (arquivos.length < 2 || arquivos.length > 10) p.push(`carrossel precisa de 2 a 10 imagens (tem ${arquivos.length})`);
  for (const a of arquivos) {
    if (!fs.existsSync(a)) {
      p.push(`imagem não encontrada: ${path.basename(a)}`);
      continue;
    }
    const m = await sharp(a).metadata();
    if (m.width !== 1080 || m.height !== 1350) p.push(`${path.basename(a)} está em ${m.width}x${m.height} (precisa 1080x1350)`);
    if (formato && m.format !== formato) p.push(`${path.basename(a)} está em ${m.format} (precisa ${formato})`);
    if (semFaixa && (await temFaixaVermelha(a))) p.push(`${path.basename(a)} tem a faixa vermelha de oferta (#b0294a), proibida`);
  }
  return p;
}

function exigirEducativa(conta, config) {
  if (!modoDaConta(config)) {
    throw new Error(`A conta "${conta}" não é educativa ("tipo": "educativo" no config.json) nem tem "carrosselAtivo": true. Carrossel não entra em conta de vendas sem isso.`);
  }
}

const arqFila = (conta, raiz = RAIZ) => path.join(raiz, 'contas', conta, 'carrosseis', 'fila.json');

function lerFila(conta, raiz = RAIZ) {
  try {
    return JSON.parse(fs.readFileSync(arqFila(conta, raiz), 'utf8')) || [];
  } catch {
    return [];
  }
}

// Confere 1 item da fila inteiro (texto + imagens já copiadas). Devolve a lista de problemas.
async function conferirItem(conta, item, raiz = RAIZ) {
  const p = [];
  if (!item || !item.slug || !Array.isArray(item.imagens) || !item.legenda) return ['item da fila incompleto (precisa slug, imagens e legenda)'];
  const modo = modoDaConta(require('./maquina').lerConfig(path.join(raiz, 'contas', conta))) || 'educativo';
  p.push(...problemasDoTexto(item.legenda, modo));
  const locais = item.imagens.map((i) => path.join(raiz, 'publico', conta, i));
  p.push(...(await problemasDasImagens(locais, { formato: 'jpeg', semFaixa: modo === 'achadinho' })));
  return p;
}

// Põe 1 carrossel na fila: copia os slides (PNG/JPG 1080x1350 -> JPEG) e a legenda.
// pastaOrigem: .../carrosseis/<slug> com slides/01.png... e legenda.txt
async function enfileirar(conta, pastaOrigem, { raiz = RAIZ, log = console.log } = {}) {
  const sharp = require('sharp');
  const maquina = require('./maquina');
  const configConta = maquina.lerConfig(path.join(raiz, 'contas', conta));
  exigirEducativa(conta, configConta);
  const modo = modoDaConta(configConta);
  const slug = path.basename(path.resolve(pastaOrigem)).toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  // slides em <pasta>/slides/01.png ou direto na pasta (slide-01.png)
  const pastaSlides = fs.existsSync(path.join(pastaOrigem, 'slides')) ? path.join(pastaOrigem, 'slides') : pastaOrigem;
  const arqLegenda = path.join(pastaOrigem, 'legenda.txt');
  if (!fs.existsSync(pastaSlides)) throw new Error(`Não achei a pasta de slides: ${pastaSlides}`);
  if (!fs.existsSync(arqLegenda)) throw new Error(`Não achei a legenda: ${arqLegenda}`);
  const slides = fs
    .readdirSync(pastaSlides)
    .filter((f) => /^(slide-)?\d+\.(png|jpe?g)$/i.test(f))
    .sort((a, b) => parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10))
    .map((f) => path.join(pastaSlides, f));
  let legenda = fs.readFileSync(arqLegenda, 'utf8').replace(/^﻿/, '').trim();
  if (modo === 'achadinho') legenda = limparLegenda(legenda);
  if (!legenda) throw new Error('A legenda está vazia.');

  const problemas = [...problemasDoTexto(legenda, modo), ...(await problemasDasImagens(slides, { semFaixa: modo === 'achadinho' }))];
  if (problemas.length) throw new Error(`Não entrou na fila:\n  - ${problemas.join('\n  - ')}`);

  const fila = lerFila(conta, raiz);
  if (fila.some((c) => c.slug === slug)) throw new Error(`"${slug}" já está na fila (nada foi mudado).`);

  const destino = path.join(raiz, 'publico', conta, 'carrosseis', slug);
  fs.mkdirSync(destino, { recursive: true });
  const imagens = [];
  for (let i = 0; i < slides.length; i++) {
    const nome = String(i + 1).padStart(2, '0') + '.jpg';
    await sharp(slides[i]).flatten({ background: '#ffffff' }).jpeg({ quality: 92, mozjpeg: true }).toFile(path.join(destino, nome));
    imagens.push(`carrosseis/${slug}/${nome}`);
  }
  const item = { slug, imagens, legenda, entrouEm: new Date().toISOString().slice(0, 10) };
  const p2 = await conferirItem(conta, item, raiz);
  if (p2.length) throw new Error(`Não entrou na fila:\n  - ${p2.join('\n  - ')}`);
  fila.push(item);
  fs.mkdirSync(path.dirname(arqFila(conta, raiz)), { recursive: true });
  fs.writeFileSync(arqFila(conta, raiz), JSON.stringify(fila, null, 2) + '\n');
  log(`Na fila de ${conta}: ${slug} (${imagens.length} slides). Posição ${fila.length}.`);
  return item;
}

// Próximo carrossel a sair: SEMPRE o primeiro da fila ainda não publicado (a ordem nunca pula),
// no máximo "porDia" por dia, só a partir de "aPartirDas" (hora de Brasília) e, se houver, só a partir do dia "comecaEm" (AAAA-MM-DD).
function proximo(fila, feitos, { hojeBR, horaBR, aPartirDas = 19, porDia = 1, ignorarHora = false, comecaEm } = {}) {
  if (!ignorarHora && comecaEm && hojeBR < comecaEm) return null;
  if (!ignorarHora && horaBR < aPartirDas) return null;
  const diaDe = (iso) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const jaHoje = Object.entries(feitos || {}).filter(([k, v]) => k.startsWith('carrossel:') && v && v.quando && diaDe(v.quando) === hojeBR).length;
  if (jaHoje >= porDia) return null;
  return (fila || []).find((c) => c && c.slug && !(feitos || {})[`carrossel:${c.slug}`]) || null;
}

module.exports = { PROIBIDAS, PROIBIDAS_ACHADINHO, modoDaConta, temFaixaVermelha, limparLegenda, problemasDoTexto, problemasDasImagens, exigirEducativa, lerFila, conferirItem, enfileirar, proximo, arqFila };
