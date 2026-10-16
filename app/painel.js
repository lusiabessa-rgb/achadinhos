// Painel do dia: uma página só (painel.html) que abre no PC e no celular.
// Cada produto tem foto, preço e botões de copiar legenda / abrir produto.
// Os dados vão embutidos na página, então ela funciona sem internet e sem servidor.

const seguroNoScript = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c');

function gerar({ data, conta, shopee, tiktok, mensagensGrupo }) {
  const dados = seguroNoScript({ data, conta, shopee, tiktok, mensagensGrupo });
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#ee4d2d">
<title>Ofertas do dia</title>
<style>
  :root { --fundo:#fff7f3; --cartao:#fff; --texto:#2b2b2b; --suave:#6b6b6b; --borda:#f0d9d0;
          --shopee:#ee4d2d; --tiktok:#111; --ok:#1f9d55; }
  @media (prefers-color-scheme: dark) {
    :root { --fundo:#1b1714; --cartao:#26201c; --texto:#f3ece8; --suave:#b9aca5; --borda:#3a302a; --tiktok:#f3ece8; }
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--fundo); color:var(--texto);
         font: 16px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  header { position:sticky; top:0; z-index:2; background:var(--fundo); padding:14px 16px 8px;
           border-bottom:1px solid var(--borda); }
  h1 { font-size:20px; margin:0 0 2px; }
  .sub { color:var(--suave); font-size:14px; margin:0 0 10px; }
  .abas { display:flex; gap:8px; }
  .aba { flex:1; padding:10px; border-radius:12px; border:1px solid var(--borda); background:var(--cartao);
         color:var(--texto); font-weight:600; font-size:15px; cursor:pointer; }
  .aba[aria-selected="true"] { background:var(--shopee); color:#fff; border-color:var(--shopee); }
  main { max-width:720px; margin:0 auto; padding:12px 16px 80px; }
  .cartao { background:var(--cartao); border:1px solid var(--borda); border-radius:16px;
            padding:14px; margin:12px 0; }
  .topo { display:flex; gap:12px; align-items:flex-start; }
  .topo img { width:84px; height:84px; object-fit:cover; border-radius:12px; flex:none; background:var(--borda); }
  .nome { font-weight:700; margin:0 0 4px; }
  .info { color:var(--suave); font-size:14px; margin:0; }
  .preco { color:var(--shopee); font-weight:700; }
  .botoes { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:12px; }
  button.b, a.b { display:block; text-align:center; padding:12px 8px; border-radius:12px; font-size:15px;
                  font-weight:600; border:1px solid var(--borda); background:var(--fundo); color:var(--texto);
                  text-decoration:none; cursor:pointer; min-height:44px; }
  .b.forte { background:var(--shopee); color:#fff; border-color:var(--shopee); }
  .b.largo { grid-column:1 / -1; }
  .b.feito { background:var(--ok); color:#fff; border-color:var(--ok); }
  details { margin-top:10px; }
  summary { cursor:pointer; color:var(--suave); font-size:14px; }
  pre { white-space:pre-wrap; font:14px/1.4 inherit; font-family:inherit; background:var(--fundo);
        padding:10px; border-radius:10px; margin:8px 0 0; }
  .vazio { text-align:center; color:var(--suave); padding:40px 12px; }
  .aviso { position:fixed; left:50%; bottom:20px; transform:translateX(-50%); background:var(--ok); color:#fff;
           padding:10px 18px; border-radius:999px; font-weight:600; opacity:0; transition:opacity .2s; pointer-events:none; }
  .aviso.ver { opacity:1; }
</style>
</head>
<body>
<header>
  <h1>Ofertas do dia</h1>
  <p class="sub" id="sub"></p>
  <div class="abas" role="tablist">
    <button class="aba" role="tab" data-aba="shopee" aria-selected="true">Shopee</button>
    <button class="aba" role="tab" data-aba="tiktok" aria-selected="false">TikTok Shop</button>
    <button class="aba" role="tab" data-aba="grupo" aria-selected="false">Grupos</button>
  </div>
</header>
<main id="lista"></main>
<div class="aviso" id="aviso">Copiado!</div>
<script>
const D = ${dados};
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const FEITOS_KEY = 'feitos-' + D.conta + '-' + D.data;
let feitos = {};
try { feitos = JSON.parse(localStorage.getItem(FEITOS_KEY) || '{}'); } catch (e) {}
const marcar = (id) => { feitos[id] = 1; try { localStorage.setItem(FEITOS_KEY, JSON.stringify(feitos)); } catch (e) {} };

$('#sub').textContent = D.data.split('-').reverse().join('/') + ' · ' + D.shopee.length + ' Shopee · ' + D.tiktok.length + ' TikTok';

function avisar(txt) { const a = $('#aviso'); a.textContent = txt; a.classList.add('ver'); setTimeout(() => a.classList.remove('ver'), 1400); }

async function copiar(texto, botao, id) {
  let ok = false;
  try { await navigator.clipboard.writeText(texto); ok = true; } catch (e) {}
  if (!ok) { // plano B para navegadores que bloqueiam a área de transferência
    const t = document.createElement('textarea'); t.value = texto; t.setAttribute('readonly', '');
    t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select();
    try { ok = document.execCommand('copy'); } catch (e) {}
    t.remove();
  }
  if (ok) { avisar('Copiado!'); botao.classList.add('feito'); if (id) marcar(id); }
  else { avisar('Não deu para copiar: segure o texto abaixo'); }
}

function cartao(p, i, loja) {
  const pid = loja + '-' + i;
  const foto = p.foto || p.imageUrl;
  const legendas = p.legendas.map((l, k) => {
    const id = pid + '-leg' + k;
    return '<button class="b' + (k === 0 ? ' forte' : '') + (feitos[id] ? ' feito' : '') +
      '" data-copiar="' + esc(l) + '" data-id="' + id + '">Copiar legenda ' + (k + 1) + '</button>';
  }).join('');
  const abrir = p.link ? '<a class="b" href="' + esc(p.link) + '" target="_blank" rel="noopener">Abrir produto</a>' : '';
  const grupo = p.textoGrupo ? '<button class="b largo' + (feitos[pid + '-grupo'] ? ' feito' : '') +
      '" data-copiar="' + esc(p.textoGrupo) + '" data-id="' + pid + '-grupo">Copiar texto do grupo</button>' : '';
  const linhaInfo = [p.preco ? '<span class="preco">' + esc(p.preco) + '</span>' : '',
                     p.comissao ? 'comissão ' + esc(p.comissao) : '', esc(p.vendas || '')].filter(Boolean).join(' · ');
  return '<article class="cartao">' +
    '<div class="topo">' + (foto ? '<img src="' + esc(foto) + '" alt="" loading="lazy" onerror="this.remove()">' : '') +
    '<div><p class="nome">' + (i + 1) + '. ' + esc(p.nome) + '</p><p class="info">' + linhaInfo + '</p></div></div>' +
    '<div class="botoes">' + legendas + abrir + grupo + '</div>' +
    '<details><summary>Ver as legendas</summary>' + p.legendas.map((l) => '<pre>' + esc(l) + '</pre>').join('') + '</details>' +
    '</article>';
}

function mostrar(aba) {
  document.querySelectorAll('.aba').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.aba === aba)));
  try { localStorage.setItem('aba', aba); } catch (e) {}
  let html = '';
  if (aba === 'grupo') {
    html = D.mensagensGrupo.length
      ? '<article class="cartao"><p class="nome">Todas as mensagens do dia</p><div class="botoes">' +
        '<button class="b forte largo" data-copiar="' + esc(D.mensagensGrupo.join('\\n\\n━━━━━━━━━━\\n\\n')) + '">Copiar todas</button></div></article>' +
        D.mensagensGrupo.map((m, i) => '<article class="cartao"><pre>' + esc(m) + '</pre><div class="botoes">' +
          '<button class="b largo" data-copiar="' + esc(m) + '" data-id="msg-' + i + '">Copiar</button></div></article>').join('')
      : '<p class="vazio">Nenhuma mensagem hoje.</p>';
  } else {
    const lista = D[aba];
    html = lista.length ? lista.map((p, i) => cartao(p, i, aba)).join('')
      : '<p class="vazio">' + (aba === 'tiktok' ? 'Nenhum produto do TikTok hoje. Mande os prints dos "Mais vendidos" para a Claude.' : 'Nenhum produto hoje.') + '</p>';
  }
  $('#lista').innerHTML = html;
}

document.addEventListener('click', (e) => {
  const aba = e.target.closest('.aba'); if (aba) return mostrar(aba.dataset.aba);
  const b = e.target.closest('[data-copiar]'); if (b) copiar(b.dataset.copiar, b, b.dataset.id);
});

let inicial = 'shopee';
try { inicial = localStorage.getItem('aba') || 'shopee'; } catch (e) {}
mostrar(['shopee', 'tiktok', 'grupo'].includes(inicial) ? inicial : 'shopee');
</script>
</body>
</html>
`;
}

module.exports = { gerar };
