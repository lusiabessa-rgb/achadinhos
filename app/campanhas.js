// CALENDÁRIO DE CAMPANHAS
// Nas semanas das datas fortes de venda (11.11, Black Friday, 12.12, Natal, Dia das Mães...) a máquina
// troca sozinha o título da arte, a cor, a frase de abertura das legendas, as hashtags e as palavras de busca.
// Datas que mudam todo ano (Black Friday, Carnaval, Páscoa, Dia das Mães/Pais) são calculadas.
//
// No config.json da conta (opcional):
//   "campanhas": { "desligadas": ["carnaval"], "extras": [ { "id": "aniversario", "nome": "...", "de": "2026-11-20", "ate": "2026-11-22", ... } ] }

const DIA = 86400000;
const data = (ano, mes, dia) => new Date(Date.UTC(ano, mes - 1, dia));
const iso = (d) => d.toISOString().slice(0, 10);
const somar = (d, dias) => new Date(d.getTime() + dias * DIA);

// n-ésimo dia da semana do mês (semana: 0 = domingo ... 6 = sábado)
function enesimo(ano, mes, semana, n) {
  const primeiro = data(ano, mes, 1);
  return somar(primeiro, ((semana - primeiro.getUTCDay() + 7) % 7) + (n - 1) * 7);
}

// Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher)
function pascoa(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return data(ano, mes, dia);
}

// Campanha "dupla" da Shopee (9.9, 10.10, 11.11, 12.12): a semana antes + o dia
const dupla = (mes) => (ano) => ({ de: somar(data(ano, mes, mes), -6), ate: data(ano, mes, mes) });

// Ordem não importa: se duas valem no mesmo dia, ganha a mais curta (a mais específica, ex.: Black Friday dentro do Natal).
const CALENDARIO = [
  {
    id: 'volta-as-aulas', nome: 'Volta às aulas', titulo: 'VOLTA ÀS AULAS', cor: '#1f6fb2',
    frase: '🎒 Especial VOLTA ÀS AULAS: achadinhos para começar o ano organizada!',
    hashtags: ['#voltaasaulas', '#materialescolar'], palavrasChave: ['material escolar', 'mochila infantil', 'estojo escolar'],
    datas: (ano) => ({ de: data(ano, 1, 5), ate: data(ano, 2, 20) }),
  },
  {
    id: 'carnaval', nome: 'Carnaval', titulo: 'ESPECIAL CARNAVAL', cor: '#8e3fbf',
    frase: '🎉 Especial CARNAVAL: achadinhos para curtir a folia!',
    hashtags: ['#carnaval'], palavrasChave: ['fantasia carnaval', 'acessórios carnaval'],
    datas: (ano) => { const c = somar(pascoa(ano), -47); return { de: somar(c, -10), ate: c }; },
  },
  {
    id: 'pascoa', nome: 'Páscoa', titulo: 'ESPECIAL PÁSCOA', cor: '#c77d2e',
    frase: '🐰 Especial PÁSCOA: achadinhos para uma Páscoa linda!',
    hashtags: ['#pascoa'], palavrasChave: ['decoração páscoa', 'forma ovo de páscoa'],
    datas: (ano) => { const p = pascoa(ano); return { de: somar(p, -14), ate: p }; },
  },
  {
    id: 'dia-das-maes', nome: 'Dia das Mães', titulo: 'DIA DAS MÃES', cor: '#c2185b',
    frase: '💐 Especial DIA DAS MÃES: presentes lindos que cabem no bolso!',
    hashtags: ['#diadasmaes', '#presenteparamae'], palavrasChave: ['presente dia das mães', 'kit presente feminino'],
    datas: (ano) => { const d = enesimo(ano, 5, 0, 2); return { de: somar(d, -14), ate: d }; },
  },
  {
    id: '6-6', nome: '6.6 da Shopee', titulo: 'OFERTAS 6.6', frase: '🧡 Chegou o 6.6 da Shopee: ofertas só nesses dias!',
    hashtags: ['#66shopee'], palavrasChave: [], datas: dupla(6),
  },
  {
    id: '7-7', nome: '7.7 da Shopee', titulo: 'OFERTAS 7.7', frase: '🧡 Chegou o 7.7 da Shopee: ofertas só nesses dias!',
    hashtags: ['#77shopee'], palavrasChave: [], datas: dupla(7),
  },
  {
    id: 'dia-dos-pais', nome: 'Dia dos Pais', titulo: 'DIA DOS PAIS', cor: '#2e5e8e',
    frase: '👔 Especial DIA DOS PAIS: presentes que ele vai amar!',
    hashtags: ['#diadospais', '#presenteparapai'], palavrasChave: ['presente dia dos pais'],
    datas: (ano) => { const d = enesimo(ano, 8, 0, 2); return { de: somar(d, -14), ate: d }; },
  },
  {
    id: '8-8', nome: '8.8 da Shopee', titulo: 'OFERTAS 8.8', frase: '🧡 Chegou o 8.8 da Shopee: ofertas só nesses dias!',
    hashtags: ['#88shopee'], palavrasChave: [], datas: dupla(8),
  },
  {
    id: '9-9', nome: '9.9 da Shopee', titulo: 'OFERTAS 9.9', frase: '🧡 Chegou o 9.9 da Shopee: ofertas só nesses dias!',
    hashtags: ['#99shopee'], palavrasChave: [], datas: dupla(9),
  },
  {
    id: '10-10', nome: '10.10 da Shopee', titulo: 'OFERTAS 10.10', frase: '🧡 Chegou o 10.10 da Shopee: ofertas só nesses dias!',
    hashtags: ['#1010shopee'], palavrasChave: [], datas: dupla(10),
  },
  {
    id: 'dia-das-criancas', nome: 'Dia das Crianças', titulo: 'DIA DAS CRIANÇAS', cor: '#e8891d',
    frase: '🧸 Especial DIA DAS CRIANÇAS: presentes que encantam!',
    hashtags: ['#diadascriancas'], palavrasChave: ['brinquedo educativo', 'presente infantil'],
    datas: (ano) => ({ de: data(ano, 9, 28), ate: data(ano, 10, 12) }),
  },
  {
    id: '11-11', nome: '11.11 da Shopee', titulo: 'OFERTAS 11.11', frase: '🧡 Chegou o 11.11 da Shopee: um dos maiores dias de oferta do ano!',
    hashtags: ['#1111shopee'], palavrasChave: [], datas: dupla(11),
  },
  {
    id: 'black-friday', nome: 'Black Friday', titulo: 'BLACK FRIDAY', cor: '#111111',
    frase: '🖤 BLACK FRIDAY: os achadinhos com os melhores preços do ano!',
    hashtags: ['#blackfriday', '#blackfridayshopee'], palavrasChave: [],
    // Sexta depois da 4ª quinta-feira de novembro; vale da segunda antes até a Cyber Monday
    datas: (ano) => { const bf = somar(enesimo(ano, 11, 4, 4), 1); return { de: somar(bf, -4), ate: somar(bf, 3) }; },
  },
  {
    id: '12-12', nome: '12.12 da Shopee', titulo: 'OFERTAS 12.12', frase: '🧡 Chegou o 12.12 da Shopee: ofertas de Natal antecipadas!',
    hashtags: ['#1212shopee'], palavrasChave: [], datas: dupla(12),
  },
  {
    id: 'natal', nome: 'Natal', titulo: 'ESPECIAL DE NATAL', cor: '#b3202a',
    frase: '🎄 Especial de NATAL: achadinhos para deixar a casa encantada!',
    hashtags: ['#natal', '#decoracaodenatal'], palavrasChave: ['decoração de natal', 'presente de natal'],
    datas: (ano) => ({ de: data(ano, 11, 1), ate: data(ano, 12, 24) }),
  },
  {
    id: 'ano-novo', nome: 'Ano Novo', titulo: 'ESPECIAL ANO NOVO', cor: '#b08a2e',
    frase: '✨ Especial ANO NOVO: achadinhos para a virada!',
    hashtags: ['#anonovo', '#reveillon'], palavrasChave: ['decoração ano novo', 'roupa branca réveillon'],
    datas: (ano) => ({ de: data(ano, 12, 26), ate: data(ano, 12, 31) }),
  },
];

// Todas as campanhas de um ano, com datas prontas (já tirando as desligadas e somando as extras da conta)
function doAno(ano, config = {}) {
  const c = config.campanhas || {};
  const desligadas = new Set((c.desligadas || []).map(String));
  const lista = CALENDARIO.filter((k) => !desligadas.has(k.id)).map(({ datas, ...k }) => {
    const { de, ate } = datas(ano);
    return { ...k, de: iso(de), ate: iso(ate) };
  });
  for (const e of c.extras || []) {
    if (e && e.nome && /^\d{4}-\d{2}-\d{2}$/.test(e.de || '') && /^\d{4}-\d{2}-\d{2}$/.test(e.ate || '') && e.de.slice(0, 4) == ano) {
      lista.push({ hashtags: [], palavrasChave: [], titulo: String(e.nome).toUpperCase(), frase: '', id: e.id || e.nome, ...e });
    }
  }
  return lista;
}

const dias = (k) => (Date.parse(k.ate) - Date.parse(k.de)) / DIA;

// Campanha que vale no dia (YYYY-MM-DD). Sem campanha: null.
function ativa(hoje, config = {}) {
  const ano = Number(hoje.slice(0, 4));
  const valendo = doAno(ano, config).filter((k) => k.de <= hoje && hoje <= k.ate);
  if (!valendo.length) return null;
  return valendo.sort((a, b) => dias(a) - dias(b))[0];
}

// Próximas campanhas que começam nos próximos N dias (para avisar a dona e preparar conteúdo)
function proximas(hoje, config = {}, janela = 30) {
  const ano = Number(hoje.slice(0, 4));
  const limite = iso(somar(new Date(hoje + 'T00:00:00Z'), janela));
  return [...doAno(ano, config), ...doAno(ano + 1, config)]
    .filter((k) => k.de > hoje && k.de <= limite)
    .sort((a, b) => (a.de < b.de ? -1 : 1));
}

// Junta a campanha com o config: hashtags e palavras de busca da campanha vêm na frente (sem repetir)
function aplicar(config, campanha) {
  if (!campanha) return config;
  const juntar = (a = [], b = []) => [...new Set([...a, ...b])];
  return {
    ...config,
    palavrasChave: juntar(campanha.palavrasChave, config.palavrasChave),
    hashtags: juntar(campanha.hashtags, config.hashtags),
    hashtagsTikTok: juntar(campanha.hashtags, config.hashtagsTikTok),
    hashtagsInstagram: juntar(campanha.hashtags, config.hashtagsInstagram),
    corArte: campanha.cor || config.corArte,
  };
}

const dataBR = (s) => s.slice(8, 10) + '/' + s.slice(5, 7);

module.exports = { ativa, proximas, aplicar, doAno, pascoa, dataBR, CALENDARIO };
