// Página "link na bio": as ofertas do dia, numeradas, com botão de comprar.
// É a página pública que vai no link da bio do Instagram.
const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function gerar({ titulo, subtitulo, data, ofertas }) {
  const cartoes = ofertas
    .map(
      (o) => `
    <article class="oferta" id="oferta-${o.numero}">
      <span class="num">${o.numero}</span>
      <img src="${esc(o.arte)}" alt="${esc(o.nome)}" loading="lazy" width="1080" height="1350">
      <div class="txt">
        <h2>${esc(o.nome)}</h2>
        <p class="preco">${esc(o.preco)}</p>
        <a class="comprar" href="${esc(o.link)}" target="_blank" rel="noopener nofollow sponsored">Ver na Shopee</a>
      </div>
    </article>`
    )
    .join('');
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#b0294a">
<title>${esc(titulo)}</title>
<style>
  :root { --fundo:#fff5f7; --cartao:#fff; --texto:#2b2b2b; --suave:#6b6b6b; --cor:#b0294a; --borda:#f2d6dd; }
  @media (prefers-color-scheme: dark) { :root { --fundo:#1c1517; --cartao:#271d20; --texto:#f5ecee; --suave:#bba9ae; --borda:#3b2a2f; } }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--fundo); color:var(--texto); font:16px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
  header { text-align:center; padding:28px 16px 8px; }
  h1 { margin:0; font-size:24px; color:var(--cor); }
  header p { margin:6px 0 0; color:var(--suave); font-size:14px; }
  main { max-width:560px; margin:0 auto; padding:8px 16px 40px; }
  .oferta { position:relative; background:var(--cartao); border:1px solid var(--borda); border-radius:18px; overflow:hidden; margin:16px 0; }
  .oferta img { display:block; width:100%; height:auto; }
  .num { position:absolute; top:12px; left:12px; background:var(--cor); color:#fff; font-weight:800; border-radius:999px; min-width:40px; height:40px; display:grid; place-items:center; padding:0 10px; }
  .txt { padding:14px 16px 16px; }
  h2 { font-size:17px; margin:0 0 4px; }
  .preco { margin:0 0 12px; font-weight:800; color:var(--cor); font-size:20px; }
  .comprar { display:block; text-align:center; background:var(--cor); color:#fff; text-decoration:none; font-weight:700; padding:14px; border-radius:12px; }
  footer { text-align:center; color:var(--suave); font-size:12px; padding:0 16px 32px; }
</style>
</head>
<body>
<header><h1>${esc(titulo)}</h1><p>${esc(subtitulo)} · ofertas de ${esc(data.split('-').reverse().join('/'))}</p></header>
<main>${cartoes || '<p style="text-align:center">As ofertas de hoje já já aparecem aqui 💖</p>'}</main>
<footer>Links de afiliada: posso ganhar uma comissão, sem custo extra para você. Preços podem mudar.</footer>
</body>
</html>
`;
}

module.exports = { gerar };
