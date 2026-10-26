// PÔR UM CARROSSEL EDUCATIVO NA FILA
// Uso:  node app/fila-carrossel.js helena <pasta do carrossel> [<outra pasta> ...]
// Ex.:  node app/fila-carrossel.js helena "../PROJETO-MINI-APP-COLORIR-EDUCACAO/instagram/carrosseis/03-xxx"
// A pasta precisa ter slides/01.png, 02.png... (1080x1350) e legenda.txt. Sai na ordem em que entrou, 1 por dia.
const { enfileirar } = require('./carrosseis');

(async () => {
  const [conta, ...pastas] = process.argv.slice(2);
  if (!conta || !pastas.length) {
    console.log('Uso: node app/fila-carrossel.js <conta> <pasta do carrossel> [...]');
    process.exitCode = 1;
    return;
  }
  for (const p of pastas) {
    try {
      await enfileirar(conta, p);
    } catch (e) {
      console.error('ERRO: ' + e.message);
      process.exitCode = 1;
      return; // para aqui: a ordem da fila nunca pula
    }
  }
})();
