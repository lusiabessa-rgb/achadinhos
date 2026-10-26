# Ligar a conta @colorecomhelena na nuvem (passo a passo simples)

A máquina já está pronta para postar 1 carrossel por dia às 19h no @colorecomhelena.
Ela está **desligada** e só liga depois de 2 coisas: os 2 "segredos" no GitHub e o seu OK.

A conta da helena é **separada** da @achadinhoabessa: ela usa chaves com outro nome (terminam em `_HELENA`)
e a máquina se recusa a postar se a chave for da outra conta.

## Parte 1: criar os 2 segredos no GitHub (uns 5 minutos)
1. Abra **github.com** e entre na sua conta.
2. Abra o repositório **achadinhos** (lusiabessa-rgb/achadinhos).
3. Clique em **Settings** (Configurações, no alto da página, à direita).
4. No menu da esquerda: **Secrets and variables** > **Actions**.
5. Clique no botão verde **New repository secret**.
6. Primeiro segredo:
   - Em **Name**, escreva exatamente: `INSTAGRAM_TOKEN_HELENA`
   - Em **Secret**, cole o token. Ele está no arquivo
     `maquina-de-ofertas/contas/helena/CHAVES.txt`, na linha `INSTAGRAM_TOKEN=`.
     Copie **só o que vem depois do sinal de =** (sem espaços).
   - Clique em **Add secret**.
7. Clique de novo em **New repository secret**. Segundo segredo:
   - Em **Name**: `INSTAGRAM_USER_ID_HELENA`
   - Em **Secret**: `17841420312757652`
   - Clique em **Add secret**.

Atenção: **não mexa** nos segredos que já existem (`INSTAGRAM_TOKEN`, `INSTAGRAM_USER_ID`...). Eles são da @achadinhoabessa.

Se preferir, o Claude faz a Parte 1 para você: é só dizer "pode criar os segredos da helena".
Ele faz pelo programa do GitHub no computador, sem mostrar o token na tela.

## Parte 2: ligar (quando você aprovar)
Diga ao Claude: **"pode ligar a helena"**. Ele muda `"ativo": false` para `"ativo": true`
em `contas/helena/config.json`, roda os testes e envia.

A partir daí, todo dia às 19h (horário de Brasília) sai o próximo carrossel da fila, na ordem:
1. 01-bncc-cores (5 slides)
2. 02-maos-escola (6 slides), no dia seguinte

## Pôr carrossel novo na fila
`node app/fila-carrossel.js helena "<pasta do carrossel>"`
(a pasta precisa ter `slides/01.png, 02.png...` em 1080x1350 e `legenda.txt`).
A máquina recusa legenda com #publi, Shopee, carrinho, link, oferta ou cupom, e imagem fora de 1080x1350.

## Token
O token da helena foi gerado em 26/10/2026 e dura uns 60 dias. **Renovar antes de 20/12/2026**
(trocar no CHAVES.txt e no segredo `INSTAGRAM_TOKEN_HELENA`).
