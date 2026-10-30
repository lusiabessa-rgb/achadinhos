// Assinatura do app: parte grátis + cadeado + tela "Assinar".
// Entra no app pelo montar.js; o esboço continua igual. Roda depois do script principal,
// por isso troca as funções de abrir (abrir, abrirVale...) por versões que olham o cadeado.
(() => {
  // ===== O que fica grátis (a Lusia decide; é só mudar os números) =====
  const GRATIS = { desenhos: 3, formas: 2, letras: 5, numeros: 3, quebra: 2 };
  // Jogo das Cores e Feira das Frutas ficam abertos. Vale Encantado e Sequência são da assinatura.
  const LINK_ASSINAR = ""; // link da Kiwify: fica vazio até o produto ser criado
  const SAL = "colore-com-helena";
  const VALE_SEM_INTERNET = 35 * 864e5; // 35 dias: depois disso precisa conferir de novo com internet

  let st = {};
  try { st = JSON.parse(localStorage.getItem("helena-assinatura")) || {}; } catch (e) {}
  const salva = () => { try { localStorage.setItem("helena-assinatura", JSON.stringify(st)); } catch (e) {} };
  const assinante = () => !!st.ok && Date.now() - (st.conferido || 0) < VALE_SEM_INTERNET;

  async function hashDo(email) {
    const dados = new TextEncoder().encode(SAL + ":" + email.trim().toLowerCase());
    const h = await crypto.subtle.digest("SHA-256", dados);
    return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("");
  }

  // Confere o e-mail na lista do site. Devolve true/false, ou null se estiver sem internet.
  async function confere(email) {
    try {
      const r = await fetch("assinantes.json?t=" + Date.now(), { cache: "no-store" });
      if (!r.ok) return null;
      const lista = await r.json();
      return (lista.hashes || []).includes(await hashDo(email));
    } catch (e) { return null; }
  }

  // ===== Visual do cadeado e da janela =====
  const css = document.createElement("style");
  css.textContent = `
    .trancado { position: relative; opacity: .55; }
    .trancado::after { content: "🔒"; position: absolute; top: 6px; right: 8px; font-size: 18px; }
    .secao.trancado { opacity: .7; }
    .cartaoAssinatura { display: flex; align-items: center; gap: 12px; background: #fff; border-radius: 18px;
      padding: 12px 14px; margin: 0 0 14px; box-shadow: 0 2px 10px rgba(0,0,0,.07); }
    .cartaoAssinatura p { margin: 0; flex: 1; font-size: 14px; line-height: 1.35; }
    .cartaoAssinatura .btn { white-space: nowrap; }
    #janelaAss { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: none; place-items: center;
      z-index: 50; padding: 16px; }
    #janelaAss.aberta { display: grid; }
    #janelaAss .caixa { background: #fff; border-radius: 22px; padding: 22px 18px; max-width: 380px; width: 100%;
      text-align: center; }
    #janelaAss h2 { margin: 4px 0 8px; }
    #janelaAss p { margin: 0 0 14px; line-height: 1.4; }
    #janelaAss input { width: 100%; font-size: 18px; padding: 12px; border-radius: 12px; border: 2px solid #ddd;
      margin-bottom: 12px; text-align: center; }
    #janelaAss .botoes { display: flex; flex-direction: column; gap: 8px; }
    #janelaAss .msg { min-height: 20px; color: #B3261E; font-size: 14px; margin: 0 0 8px; }`;
  document.head.appendChild(css);

  const jan = document.createElement("div");
  jan.id = "janelaAss";
  jan.innerHTML = `<div class="caixa" id="janelaConteudo"></div>`;
  document.body.appendChild(jan);
  jan.addEventListener("click", e => { if (e.target === jan) fecha(); });
  const fecha = () => jan.classList.remove("aberta");
  const mostra = html => { $("janelaConteudo").innerHTML = html; jan.classList.add("aberta"); };

  // Tela do cadeado (é o que a criança vê): pede para chamar um adulto.
  function cadeado() {
    if (typeof calar === "function") calar();
    mostra(`<div style="font-size:52px">🔒</div>
      <h2>Essa parte é da assinatura</h2>
      <p>Chame um adulto para liberar todos os desenhos, letras, números, quebra-cabeças e jogos.</p>
      <div class="botoes">
        <button class="btn verde" id="assAdulto">👩 Sou o adulto</button>
        <button class="btn" id="assFecha">Voltar</button>
      </div>`);
    $("assAdulto").onclick = () => portaoDoAdulto();
    $("assFecha").onclick = fecha;
  }

  // Pergunta simples para a criança pequena não chegar sozinha no pagamento.
  function portaoDoAdulto(depois = paraAdulto) {
    const a = 3 + Math.floor(Math.random() * 6), b = 4 + Math.floor(Math.random() * 5);
    mostra(`<h2>Só para adultos</h2>
      <p>Quanto é ${a} + ${b}?</p>
      <input id="assConta" inputmode="numeric" autocomplete="off">
      <p class="msg" id="assMsg"></p>
      <div class="botoes">
        <button class="btn verde" id="assOk">Continuar</button>
        <button class="btn" id="assFecha">Voltar</button>
      </div>`);
    $("assOk").onclick = () => +$("assConta").value === a + b ? depois() : ($("assMsg").textContent = "Resposta errada.");
    $("assFecha").onclick = fecha;
  }

  function paraAdulto() {
    mostra(`<div style="font-size:44px">⭐</div>
      <h2>Assinatura Colore com Helena</h2>
      <p>Libera tudo: todos os desenhos, letras de A a Z, números, formas, quebra-cabeças e jogos. Desenhos novos chegando sempre. Cancele quando quiser.</p>
      <div class="botoes">
        <button class="btn verde" id="assQuero">Quero assinar</button>
        <button class="btn forte" id="assJa">Já sou assinante</button>
        <button class="btn" id="assFecha">Agora não</button>
      </div>`);
    $("assQuero").onclick = () => {
      if (LINK_ASSINAR) return window.open(LINK_ASSINAR, "_blank");
      mostra(`<h2>Quase lá! 💛</h2><p>A assinatura abre em breve.</p>
        <div class="botoes"><button class="btn" id="assFecha">Ok</button></div>`);
      $("assFecha").onclick = fecha;
    };
    $("assJa").onclick = pedeEmail;
    $("assFecha").onclick = fecha;
  }

  function pedeEmail() {
    mostra(`<h2>Já sou assinante</h2>
      <p>Digite o e-mail usado na compra.</p>
      <input id="assEmail" type="email" inputmode="email" autocomplete="email" placeholder="seu@email.com" value="${st.email || ""}">
      <p class="msg" id="assMsg"></p>
      <div class="botoes">
        <button class="btn verde" id="assEntrar">Liberar o app</button>
        <button class="btn" id="assFecha">Voltar</button>
      </div>`);
    $("assFecha").onclick = fecha;
    $("assEntrar").onclick = async () => {
      const email = $("assEmail").value.trim();
      if (!/^\S+@\S+\.\S+$/.test(email)) return ($("assMsg").textContent = "Confira o e-mail.");
      $("assMsg").textContent = "Conferindo...";
      const ok = await confere(email);
      if (ok === null) return ($("assMsg").textContent = "Sem internet agora. Tente de novo com internet.");
      if (!ok) return ($("assMsg").textContent = "Não achei esse e-mail. Se acabou de assinar, espere alguns minutos.");
      st = { email, ok: true, conferido: Date.now() };
      salva();
      montaInicio();
      mostra(`<div style="font-size:52px">🎉</div><h2>Tudo liberado!</h2><p>Bom divertimento!</p>
        <div class="botoes"><button class="btn verde" id="assFecha">Vamos lá</button></div>`);
      $("assFecha").onclick = fecha;
    };
  }

  // ===== Trava nas funções do app =====
  const original = { abrir, abrirSecao, abrirVale, abrirSequencia, abrirQuebra, montaQuebra, montaInicio };
  const livreNaSecao = i => assinante() || i < (GRATIS[secaoAtual] ?? 0);
  const indiceQC = f => Object.keys(FIGURAS_QC).indexOf(f);

  abrir = (i, ...resto) => livreNaSecao(i) ? original.abrir(i, ...resto) : cadeado();
  abrirVale = () => assinante() ? original.abrirVale() : cadeado();
  abrirSequencia = () => assinante() ? original.abrirSequencia() : cadeado();
  montaQuebra = f => assinante() || indiceQC(f) < GRATIS.quebra ? original.montaQuebra(f) : cadeado();

  abrirSecao = id => {
    original.abrirSecao(id);
    if (assinante()) return;
    [...$("itens").children].forEach((b, i) => b.classList.toggle("trancado", i >= (GRATIS[id] ?? 0)));
  };
  abrirQuebra = () => {
    original.abrirQuebra();
    if (assinante()) return;
    [...$("qcLista").children].forEach((b, i) => b.classList.toggle("trancado", i >= GRATIS.quebra));
  };
  montaInicio = () => {
    original.montaInicio();
    const cartao = document.createElement("div");
    cartao.className = "cartaoAssinatura";
    if (assinante()) {
      cartao.innerHTML = `<span style="font-size:26px">⭐</span><p><b>Assinante</b><br>Tudo liberado. Obrigada!</p>`;
    } else {
      cartao.innerHTML = `<span style="font-size:26px">🔒</span><p><b>Versão grátis</b><br>Parte do app liberada. Assine para abrir tudo.</p>
        <button class="btn verde" id="assAbrir">Assinar</button>`;
      document.querySelectorAll(".secao.s-vale, .secao.s-seq").forEach(b => b.classList.add("trancado"));
    }
    $("secoes").before(cartao);
    const velho = cartao.previousElementSibling;
    if (velho && velho.classList.contains("cartaoAssinatura")) velho.remove();
    const btn = $("assAbrir");
    if (btn) btn.onclick = () => portaoDoAdulto();
  };

  // Os botões do início foram criados antes da trava: monta de novo.
  montaInicio();

  // Assinante: confere de novo sempre que abrir com internet (se cancelou, trava).
  if (st.email) confere(st.email).then(ok => {
    if (ok === null) return;
    st.ok = ok; st.conferido = Date.now(); salva();
    montaInicio();
  });
})();
