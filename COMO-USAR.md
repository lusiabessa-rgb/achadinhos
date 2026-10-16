# Máquina de Ofertas: como usar

## Para ligar (uma vez só)
1. No painel de afiliada da Shopee (affiliate.shopee.com.br), procure **"Open API"** e peça acesso.
   A Shopee te dá um **App ID** e um **Secret**.
2. Abra `contas/lusia/CHAVES.txt`, cole os dois no lugar do texto "cole aqui" e salve.
   (Não mande essas chaves para ninguém, nem para mim no chat.)

## Enquanto a Shopee não libera as chaves (modo manual)
- Coloque os produtos em `contas/lusia/shopee-produtos.txt`, um por linha:
  `nome | preço | comissão % | link de afiliada | foto | frase de benefício`
  (foto e frase são opcionais; foto = link ou arquivo na pasta `contas/lusia/fotos`).
- Ou só mande prints + links para o Claude, que ele preenche.
- A máquina faz as artes, as legendas e o site com essa lista, e não repete produto na mesma semana.

## Para usar
- Dê **dois cliques em `RODAR-MAQUINA.cmd`**.
- Abra **`POSTAR-HOJE/lusia/ABRIR-HOJE.html`**: é o painel do dia (foto, preço e botões
  "Copiar legenda" / "Abrir produto"). Funciona no PC e no celular.
- Ela também cria a pasta `POSTAR-HOJE/lusia/<data de hoje>` com:
  - `RESUMO.md`: a lista do dia;
  - `shopee/`: uma pasta por produto, com foto, link de afiliada e 3 legendas;
  - `tiktok/`: os produtos da sua lista do TikTok, com 3 legendas cada;
  - `mensagens-grupo.txt`: os textos com link, prontos para grupos;
  - `diario.txt`: o que a máquina fez (se der erro, é aqui que aparece).

## Para mudar o que ela procura
- `contas/lusia/config.json`: palavras de busca, quantos produtos por dia, comissão mínima e preço.
- `contas/lusia/tiktok-produtos.txt`: produtos do TikTok Shop (ou me mande os prints que eu preencho).

## Para testar sem chave
- `node app/maquina.js lusia --teste`: roda com produtos de mentira.
- `node app/teste-automatico.js`: confere se está tudo funcionando (19 testes).
