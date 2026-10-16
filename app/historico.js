// Lembra quais produtos já foram usados, para não repetir todo dia.
// Salva primeiro num arquivo temporário e depois troca: assim nunca fica corrompido.
const fs = require('fs');

function abrir(caminho) {
  let dados = {};
  try {
    dados = JSON.parse(fs.readFileSync(caminho, 'utf8')) || {};
  } catch {}
  return {
    jaUsado(id, dias) {
      const quando = dados[String(id)];
      return Boolean(quando) && Date.now() - quando < dias * 86400000;
    },
    marcar(id) {
      dados[String(id)] = Date.now();
    },
    salvar() {
      // limpa itens com mais de 90 dias, para o arquivo não crescer para sempre
      const limite = Date.now() - 90 * 86400000;
      for (const id of Object.keys(dados)) if (dados[id] < limite) delete dados[id];
      fs.writeFileSync(caminho + '.tmp', JSON.stringify(dados, null, 2));
      fs.renameSync(caminho + '.tmp', caminho);
    },
  };
}

module.exports = { abrir };
