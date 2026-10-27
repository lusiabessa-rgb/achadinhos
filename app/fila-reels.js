// PÔR UM REEL NA FILA DO INSTAGRAM (no mesmo dia e hora em que o vídeo foi agendado no TikTok)
// Uso:  node app/fila-reels.js <conta> <video.mp4> <data> <hora> <legenda-tiktok.txt | "texto da legenda"> [--trocar]
// Ex.:  node app/fila-reels.js lusia "../TIKTOK-SHOP/semana-1-27-10/V01-ter-27-10-18h-cortina.mp4" 27/10 18 legenda.txt
//       node app/fila-reels.js lusia --listar
// O que faz: confere o vídeo (H.264/AAC, 9:16, até 90 s, < 100 MB; converte sem cortar se precisar), copia para
// publico/<conta>/reels/, adapta a legenda do TikTok (tira link/carrinho/#publi, põe "Salva" e o rótulo de IA)
// e anota em contas/<conta>/fila-reels.json. Depois: rodar os testes, commit e git push (o robô precisa do vídeo).
const reels = require('./reels');

const a = process.argv.slice(2);
const trocar = a.includes('--trocar');
const [conta, video, data, hora, legenda] = a.filter((x) => !x.startsWith('--'));

if (conta && a.includes('--listar')) {
  const fila = reels.lerFila(conta);
  if (!fila.length) console.log('Fila de Reels vazia.');
  for (const r of fila) console.log(`${r.data} ${r.hora}h  ${r.video}\n   ${r.legenda.split('\n')[0]}`);
} else if (!conta || !video || !data || !hora || !legenda) {
  console.log('Uso: node app/fila-reels.js <conta> <video.mp4> <data DD/MM> <hora 18> <legenda-tiktok.txt ou "texto"> [--trocar]');
  process.exitCode = 1;
} else {
  try {
    const r = reels.enfileirar(conta, video, data, hora, legenda, { trocar });
    console.log(`Na fila: ${r.data} às ${r.hora}h -> ${r.video}${r.info.convertido ? ' (convertido para o padrão do Instagram, nada cortado)' : ''}`);
    console.log('Legenda do Instagram:\n' + r.legenda.replace(/^/gm, '   '));
  } catch (e) {
    console.error('ERRO: ' + e.message);
    process.exitCode = 1;
  }
}
