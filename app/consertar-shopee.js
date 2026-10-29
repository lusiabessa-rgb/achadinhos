// Botão da Shopee (CONSERTAR-SHOPEE.cmd chama este arquivo).
// 1) Pede para a dona copiar o AppID e apertar Enter; lê da área de transferência SEM mostrar.
// 2) Mesmo para o Secret.
// 3) Grava no contas/lusia/CHAVES.txt (linhas APP_ID e SECRET, que o app lê) e nos Secrets do GitHub
//    (SHOPEE_APP_ID e SHOPEE_SECRET, com --body: nada de "enter" sobrando no fim).
// 4) Testa a Open API (productOfferV2, palavra "natal") e mostra PRONTO + quantos produtos vieram.
// Nunca imprime as chaves: só o tamanho. O resultado (sem chave) vai para CONSERTAR-SHOPEE-resultado.txt.
// Teste sem chave e sem internet: node app/consertar-shopee.js --simular
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execFileSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const PASTA_CONTA = path.join(RAIZ, 'contas', 'lusia');
const ARQ_CHAVES = path.join(PASTA_CONTA, 'CHAVES.txt');
const ARQ_RESULTADO = path.join(RAIZ, 'CONSERTAR-SHOPEE-resultado.txt');
const GH = 'C:\\Program Files\\GitHub CLI\\gh.exe';

const verde = (t) => `\x1b[32m${t}\x1b[0m`;
const vermelho = (t) => `\x1b[31m${t}\x1b[0m`;

function lerAreaDeTransferencia() {
  const t = execFileSync('powershell', ['-NoProfile', '-Command', 'Get-Clipboard -Raw'], { encoding: 'utf8' });
  return limpar(t);
}

// Tira espaços, "enter", aspas e um "AppID:" que venha junto na cópia
function limpar(t) {
  return String(t || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/^(app\s*id|appid|secret|senha|chave)\s*[:=]\s*/i, '')
    .replace(/^["']|["']$/g, '')
    .trim();
}

function conferirAppId(v) {
  if (!v) return 'A área de transferência está vazia. Copie o AppID de novo.';
  if (/\s/.test(v)) return 'O que foi copiado tem espaço ou mais de uma linha. Copie só o número do AppID.';
  if (!/^\d{5,20}$/.test(v)) return 'O AppID da Shopee é só número. Copie só o AppID (sem outras palavras).';
  return '';
}

function conferirSecret(v, appId) {
  if (!v) return 'A área de transferência está vazia. Copie o Secret de novo.';
  if (v === appId) return 'Copiou o AppID de novo. Agora copie o Secret (a Senha, a chave comprida).';
  if (/\s/.test(v)) return 'O que foi copiado tem espaço ou mais de uma linha. Copie só o Secret.';
  if (v.length < 16 || v.length > 128) return 'Isso não parece o Secret (tamanho estranho). Copie o Secret de novo.';
  return '';
}

// Troca (ou acrescenta) a linha NOME = valor no texto do CHAVES.txt, sem mexer no resto
function trocarLinha(texto, nome, valor) {
  const quebra = texto.includes('\r\n') ? '\r\n' : '\n';
  const linhas = texto.split(/\r?\n/);
  const re = new RegExp('^\\s*' + nome + '\\s*[=:]');
  let achou = false;
  const novas = linhas.map((l) => {
    if (re.test(l)) {
      achou = true;
      return `${nome} = ${valor}`;
    }
    return l;
  });
  if (!achou) {
    while (novas.length && novas[novas.length - 1] === '') novas.pop();
    novas.push(`${nome} = ${valor}`, '');
  }
  return novas.join(quebra);
}

function gravarChaves(arq, appId, secret) {
  let texto = fs.existsSync(arq) ? fs.readFileSync(arq, 'utf8').replace(/^\uFEFF/, '') : '';
  texto = trocarLinha(texto, 'APP_ID', appId);
  texto = trocarLinha(texto, 'SECRET', secret);
  fs.writeFileSync(arq, texto, 'utf8'); // UTF-8 sem BOM
}

function gravarSecretGitHub(nome, valor) {
  try {
    execFileSync(GH, ['secret', 'set', nome, '--body', valor], { cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, msg: '' };
  } catch (e) {
    // A mensagem do gh não traz a chave, mas por garantia tiramos qualquer pedaço dela
    const msg = String((e.stderr || '') + (e.stdout || '') || e.message).split(valor).join('***').trim();
    return { ok: false, msg };
  }
}

function perguntar(rl, texto) {
  return new Promise((r) => rl.question(texto, () => r()));
}

async function pedir(rl, titulo, conferir) {
  for (;;) {
    console.log('');
    console.log(titulo);
    await perguntar(rl, '   Depois de copiar, aperte Enter aqui... ');
    const v = lerAreaDeTransferencia();
    const erro = conferir(v);
    if (!erro) {
      console.log(verde(`   Recebido (${v.length} caracteres).`));
      return v;
    }
    console.log(vermelho('   ' + erro));
  }
}

async function testarApi(appId, secret) {
  const { buscarProdutos } = require('./shopee');
  const produtos = await buscarProdutos({ appId, secret }, { palavra: 'natal', ordem: 'vendidos', limite: 5 });
  return produtos.length;
}

async function principal() {
  const simular = process.argv.includes('--simular');
  const log = [`${new Date().toISOString()} ${simular ? '(simulado)' : ''}`];
  const fim = (txt) => fs.writeFileSync(ARQ_RESULTADO, log.concat(txt || []).join('\n') + '\n', 'utf8');

  if (simular) {
    // Confere a gravação num arquivo temporário, sem área de transferência, sem GitHub e sem Shopee
    const os = require('os');
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'shopee-')), 'CHAVES.txt');
    fs.writeFileSync(tmp, '# teste\r\nAPP_ID = cole aqui o App ID\r\nSECRET = cole aqui o Secret\r\n\r\nINSTAGRAM_TOKEN = x\r\n');
    gravarChaves(tmp, '12345678901', 'abcdefghijklmnopqrstuvwxyz123456');
    const t = fs.readFileSync(tmp, 'utf8');
    const ok = /^APP_ID = 12345678901\r$/m.test(t) && /^SECRET = abcdefghijklmnopqrstuvwxyz123456\r$/m.test(t) && /INSTAGRAM_TOKEN = x/.test(t) && !/cole aqui/.test(t);
    const { lerSegredos } = require('./maquina');
    const seg = lerSegredos(path.dirname(tmp));
    const ok2 = seg.appId === '12345678901' && seg.secret === 'abcdefghijklmnopqrstuvwxyz123456';
    const ok3 = !conferirAppId('12345678901') && conferirAppId('AppID 123 abc') && conferirSecret('12345678901', '12345678901') && !conferirSecret('abcdefghijklmnopqrstuvwxyz123456', '1');
    const ok4 = limpar('  "12345"\r\n') === '12345' && limpar('AppID: 999') === '999';
    console.log(ok && ok2 && ok3 && ok4 ? 'SIMULADO: tudo certo' : 'SIMULADO: FALHOU', { gravar: ok, appLe: ok2, conferir: !!ok3, limpar: ok4 });
    fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
    process.exit(ok && ok2 && ok3 && ok4 ? 0 : 1);
  }

  console.log('');
  console.log('   LIGAR A SHOPEE NA MAQUINA (2 perguntas)');
  console.log('   Deixe aberta a pagina "Abrir API" da Shopee no Chrome.');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const appId = await pedir(rl, '1) Na pagina da Shopee, COPIE o AppID (selecione e Ctrl+C).', conferirAppId);
  const secret = await pedir(rl, '2) Agora COPIE o Secret / Senha (selecione e Ctrl+C).', (v) => conferirSecret(v, appId));
  rl.close();

  // Limpa a área de transferência para a chave não ficar lá
  try { execFileSync('powershell', ['-NoProfile', '-Command', 'Set-Clipboard -Value " "']); } catch (_) {}

  console.log('');
  console.log('   Gravando no computador...');
  gravarChaves(ARQ_CHAVES, appId, secret);
  log.push(`CHAVES.txt gravado (AppID ${appId.length} caracteres, Secret ${secret.length} caracteres)`);

  console.log('   Gravando no GitHub (robo da nuvem)...');
  const r1 = gravarSecretGitHub('SHOPEE_APP_ID', appId);
  const r2 = gravarSecretGitHub('SHOPEE_SECRET', secret);
  log.push(`GitHub SHOPEE_APP_ID=${r1.ok ? 'ok' : 'erro'} SHOPEE_SECRET=${r2.ok ? 'ok' : 'erro'}`);
  if (r1.msg) log.push('gh: ' + r1.msg);
  if (r2.msg) log.push('gh: ' + r2.msg);

  console.log('   Testando a Shopee...');
  let qtd = -1;
  let erroApi = '';
  try {
    qtd = await testarApi(appId, secret);
    log.push(`Teste Shopee: ${qtd} produtos (natal)`);
  } catch (e) {
    erroApi = String(e.message || e).split(secret).join('***').split(appId).join('***');
    log.push('Teste Shopee: ERRO ' + erroApi);
  }
  fim();

  console.log('');
  if (qtd > 0 && r1.ok && r2.ok) {
    console.log(verde(`   PRONTO! A Shopee respondeu: ${qtd} produtos de "natal".`));
    console.log(verde('   Chaves gravadas no computador e no GitHub.'));
  } else {
    if (qtd > 0) console.log(verde(`   A Shopee respondeu: ${qtd} produtos de "natal". Chaves gravadas no computador.`));
    else if (qtd === 0) console.log(vermelho('   As chaves foram aceitas, mas a busca veio vazia. O Claude confere.'));
    else console.log(vermelho('   A Shopee nao aceitou: ' + erroApi));
    if (!r1.ok || !r2.ok) console.log(vermelho('   O GitHub nao gravou. O Claude vai ler o resultado e resolver.'));
    else console.log(verde('   Chaves gravadas no GitHub.'));
  }
  process.exit(qtd > 0 && r1.ok && r2.ok ? 0 : 1);
}

if (require.main === module) {
  principal().catch((e) => {
    console.log(vermelho('   Deu um erro: ' + String(e.message || e).slice(0, 300)));
    process.exit(1);
  });
}

module.exports = { trocarLinha, limpar, conferirAppId, conferirSecret };
