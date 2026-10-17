# Ligar o TikTok @shopabessa na Máquina (passo a passo)

## A verdade primeiro (li no site oficial do TikTok, 17/10/2026)
- **Dá para o robô mandar o vídeo sozinho**, pelo caminho oficial e sem senha.
- **Mas o TikTok não deixa publicar público sozinho sem uma auditoria.** Sem a auditoria, o post sai **privado** e a conta inteira precisa estar privada. Isso mataria a @shopabessa, então **não vamos fazer**.
- A auditoria é feita para apps usados por **muitas pessoas**. Um app só para a própria conta costuma ser **recusado**. Também não há prazo oficial; quem passou fala em 2 a 6 semanas.
- **O caminho que funciona já:** o robô manda o vídeo pronto para a **caixa de entrada do seu TikTok** (modo "rascunho"). Chega um aviso no celular. Você toca no aviso, escolhe um som em alta, cola a legenda e posta. Leva 1 minuto por vídeo e você não precisa abrir o computador.
  - Limite do TikTok: no máximo 5 vídeos esperando na caixa de entrada. Com 3 por dia, cabe.
  - O rascunho não leva a legenda. Ela fica no arquivo `-legenda.txt` e eu deixo fácil de copiar.

## O que só você pode fazer (uns 15 minutos, no computador)
Faça junto comigo, no Edge ou no Chrome, logada no TikTok **@shopabessa**.

1. Abra **developers.tiktok.com** e toque em **Log in**. Entre com a conta @shopabessa (pelo QR code do app é o mais fácil). Se aparecer o termo de desenvolvedor, leia e aceite (isso é com você).
2. Toque na sua foto, no canto de cima, e depois em **Manage apps** > **Connect an app**. Se ele perguntar, escolha **Individual** (pessoa física).
3. Preencha assim:
   - **App name:** Maquina Achadinhos
   - **Icon:** a logo (sem rosto). Eu deixo uma pronta se pedir.
   - **Category:** Lifestyle (ou Shopping)
   - **Description:** Ferramenta que envia meus vídeos originais de achadinhos de casa para a minha conta do TikTok.
   - **Terms of Service URL:** https://lusiabessa-rgb.github.io/achadinhos/termos.html
   - **Privacy Policy URL:** https://lusiabessa-rgb.github.io/achadinhos/privacidade.html
   - **Platforms:** marque **Web**. **Website URL:** https://lusiabessa-rgb.github.io/achadinhos/
   - Se ele pedir para **verificar o site**, me mostre a tela que eu cuido do arquivo.
4. Em **Products**, toque em **Add products** e adicione:
   - **Login Kit**. Em **Redirect URI**, cole: `https://lusiabessa-rgb.github.io/achadinhos/tiktok-retorno.html`
   - **Content Posting API**. Deixe o **Direct Post** desligado por enquanto.
5. Em **Scopes**, confira se aparecem **user.info.basic** e **video.upload**.
6. Em cima, na chave **Sandbox**, adicione a sua conta @shopabessa como **Target user**. Isso deve deixar a gente testar antes da aprovação. Vamos confirmar no primeiro teste.
7. Copie a **Client key**, toque em **Copiar** (ou selecione e Ctrl+C) e me diga "copiei a key". Eu guardo sem mostrar na tela. Depois faça o mesmo com o **Client secret**.
8. Quando eu mandar o **link de autorização**, abra, toque em **Autorizar** e, na página que abrir, toque em **Copiar código** e me diga "copiei o código do TikTok". O código vale poucos minutos.
9. Antes de ligar, eu mando **1 vídeo de teste** para a sua caixa de entrada. Só ligo o robô depois do seu OK.

## Depois (opcional, para sair do Sandbox)
- Em **Submit for review**, o TikTok pede um vídeo curto mostrando o app funcionando. Eu monto o roteiro. O prazo não é oficial e pode demorar semanas.
- A auditoria para postar **público e sozinho** (Direct Post) só vale tentar se um dia o app virar assinatura para outras pessoas. Eu aviso quando fizer sentido.

## O que eu faço sozinho depois disso
- Guardo as chaves no `CHAVES.txt` e nos Secrets do GitHub, sem mostrar na tela.
- O robô da nuvem, às 12h, 18h e 20h, manda o vídeo da vez para a sua caixa de entrada.
- A autorização vale 1 ano e o robô renova sozinho. Se você tirar a autorização no TikTok, ele para e avisa.
