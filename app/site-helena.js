// SITE DA HELENA NO ENDEREÇO PRÓPRIO (06/11, pedido da dona: o nome dela não pode aparecer no link).
// Copia publico/colorir/ para o repositório colorecomhelena/colorecomhelena.github.io
// (https://colorecomhelena.github.io/), apaga das anotações do código qualquer menção ao nome dela,
// troca os endereços antigos e CONFERE que não sobrou o nome. Depois faz commit e push lá.
// Uso:  node app/site-helena.js            (copia, confere e envia)
//       node app/site-helena.js --simular  (só copia para uma pasta temporária e confere)
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ORIGEM = path.join(__dirname, '..', 'publico', 'colorir');
const SIMULAR = process.argv.includes('--simular');
const DESTINO = SIMULAR ? fs.mkdtempSync(path.join(os.tmpdir(), 'site-helena-')) : path.join(__dirname, '..', '..', 'site-colorecomhelena');
const REPO = 'https://github.com/colorecomhelena/colorecomhelena.github.io.git';
const NOVO = 'https://colorecomhelena.github.io/';
const PROIBIDO = /lusia|bessa/i;
const GIT = (args, cwd = DESTINO) => execFileSync('git', args, { cwd, stdio: 'pipe' }).toString().trim();

// Tira o nome dela do texto do arquivo (só anotações e endereços; nada que a mãe vê muda)
function limpar(txt, ext) {
  let t = txt.replace(/https?:\/\/lusiabessa-rgb\.github\.io\/achadinhos\/colorir\//g, NOVO);
  if (ext === '.html') t = t.replace(/<!--[\s\S]*?-->/g, (c) => (PROIBIDO.test(c) ? '' : c));
  if (ext === '.html' || ext === '.js' || ext === '.css') {
    t = t.replace(/\/\*[\s\S]*?\*\//g, (c) => (PROIBIDO.test(c) ? '' : c));
    // comentário de linha: só do "//" que vem depois de espaço/início (não pega "https://")
    t = t.split('\n').map((l) => {
      const m = l.match(/(^|[\s;{},)])\/\/(?!\/).*$/);
      return m && PROIBIDO.test(m[0]) ? l.slice(0, m.index + m[1].length).replace(/\s+$/, '') : l;
    }).join('\n');
  }
  return t;
}

function copiar(de, para) {
  fs.mkdirSync(para, { recursive: true });
  for (const nome of fs.readdirSync(de)) {
    if (nome.startsWith('.')) continue;
    const a = path.join(de, nome), b = path.join(para, nome);
    if (fs.statSync(a).isDirectory()) { copiar(a, b); continue; }
    const ext = path.extname(nome).toLowerCase();
    if (['.html', '.js', '.css', '.json', '.webmanifest', '.txt'].includes(ext)) fs.writeFileSync(b, limpar(fs.readFileSync(a, 'utf8'), ext));
    else fs.copyFileSync(a, b);
  }
}

function conferir(pasta) {
  const achados = [];
  const ver = (p) => {
    for (const nome of fs.readdirSync(p)) {
      if (nome === '.git') continue;
      const f = path.join(p, nome);
      if (fs.statSync(f).isDirectory()) { ver(f); continue; }
      if (PROIBIDO.test(nome)) achados.push(`${f} (nome do arquivo)`);
      if (/\.(html|js|css|json|webmanifest|txt)$/i.test(nome)) {
        fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => { if (PROIBIDO.test(l)) achados.push(`${path.relative(pasta, f)}:${i + 1}: ${l.trim().slice(0, 120)}`); });
      }
    }
  };
  ver(pasta);
  return achados;
}

if (!SIMULAR && !fs.existsSync(path.join(DESTINO, '.git'))) {
  console.log('Baixando o repositório da Helena...');
  execFileSync('git', ['clone', REPO, DESTINO], { stdio: 'inherit' });
}
// limpa o destino (menos .git e CNAME) para não sobrar arquivo velho
if (!SIMULAR) for (const n of fs.readdirSync(DESTINO)) if (!['.git', 'CNAME', '.nojekyll'].includes(n)) fs.rmSync(path.join(DESTINO, n), { recursive: true, force: true });
copiar(ORIGEM, DESTINO);
fs.writeFileSync(path.join(DESTINO, '.nojekyll'), '');
const sobrou = conferir(DESTINO);
if (sobrou.length) {
  console.log('ERRO: o nome dela ainda aparece. Nada foi enviado:\n' + sobrou.join('\n'));
  process.exit(1);
}
console.log(`Conferido: nenhum "Lusia/Bessa" em ${DESTINO}.`);
if (SIMULAR) { console.log('(simulação: nada enviado)'); process.exit(0); }
GIT(['add', '-A']);
if (!GIT(['status', '--porcelain'])) { console.log('Nada mudou.'); process.exit(0); }
// identidade da marca, sem o nome dela
execFileSync('git', ['-c', 'user.name=Colore com Helena', '-c', 'user.email=colorecomhelena@gmail.com', 'commit', '-qm', 'Atualiza o site do Colore com Helena'], { cwd: DESTINO, stdio: 'inherit' });
execFileSync('git', ['push', '-q', 'origin', 'HEAD'], { cwd: DESTINO, stdio: 'inherit' });
console.log('Enviado. No ar em ' + NOVO + ' em 1 a 2 minutos.');
