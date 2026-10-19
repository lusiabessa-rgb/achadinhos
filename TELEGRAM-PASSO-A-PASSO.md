# Resumo das 21h30 no seu celular (Telegram)

Todo dia às 21h30 o robô da nuvem confere o que a máquina publicou e manda um resumo curto no seu Telegram.
Funciona com o PC desligado. Você faz isto **uma vez só** (uns 5 minutos).

## O que você faz (no celular)
1. Instale o **Telegram** (se ainda não tiver) e entre com o seu número.
2. Na busca do Telegram, procure **@BotFather** (tem um selo azul de verificado) e toque em **Começar**.
3. Mande: `/newbot`
4. Ele pede um **nome**: mande `Maquina de Ofertas`
5. Ele pede um **usuário** (tem que terminar em "bot"): mande, por exemplo, `maquina_achadinhos_bot`
   (se disser que já existe, tente outro, como `maquina_lusia_bot`).
6. Ele responde com um **token** (uma linha comprida com números, dois-pontos e letras).
   **Não mande esse token para ninguém.** Copie ele.
7. No PC, abra `contas/lusia/CHAVES.txt` e cole numa linha nova:
   `TELEGRAM_BOT_TOKEN = (cole aqui o token)`
   e salve.
8. Ainda no Telegram, toque no link do seu bot (o @BotFather manda, tipo `t.me/maquina_achadinhos_bot`),
   toque em **Começar** e mande **oi**.
9. Avise o Claude: "fiz o bot do Telegram".

## O que o Claude faz depois (sem mostrar o token)
- Roda `node app/conferencia.js lusia --ligar-telegram`. Esse comando:
  1. lê o token do CHAVES.txt (não imprime);
  2. pergunta ao Telegram (getUpdates) quem mandou "oi" e pega o seu **CHAT_ID**;
  3. grava os segredos no GitHub com `gh secret set TELEGRAM_BOT_TOKEN` e `gh secret set TELEGRAM_CHAT_ID`
     (o valor vai direto para o gh, sem aparecer na tela);
  4. manda uma mensagem de teste para você.
- Depois roda o robô uma vez para conferir: `gh workflow run conferencia.yml`.

## Como fica o resumo (exemplo)
```
📋 Conferência de 19/10 (21h30)
✅ Instagram: 3 publicação(ões) hoje (1 carrossel, 1 post de conteúdo, 1 story)
✅ Fila de conteúdo: 10 post(s), dá para 5 dia(s)
✅ Token do Instagram: vence em 57 dia(s)
✅ Robô: nenhuma falha nas últimas 24 h (9 rodada(s))
📱 TikTok: conferir no app
👉 Tudo certo hoje. Pode descansar!
```
✅ = tudo certo. ⚠️ = precisa olhar (fale com o Claude).
