@echo off
rem Botao de 2 cliques: liga a Open API da Shopee na maquina.
rem Pede para copiar o AppID e o Secret (le da area de transferencia, sem mostrar),
rem grava no CHAVES.txt e nos Secrets do GitHub (SHOPEE_APP_ID, SHOPEE_SECRET) e testa a Shopee.
rem O resultado (sem as chaves) fica em CONSERTAR-SHOPEE-resultado.txt para o Claude ler.
cd /d "%~dp0"
set GH="C:\Program Files\GitHub CLI\gh.exe"
%GH% auth status >nul 2>&1
if errorlevel 1 (
  cls
  echo.
  echo   O NAVEGADOR VAI ABRIR SOZINHO.
  echo   La: clique no quadradinho, aperte Ctrl+V, depois Continue e Authorize.
  echo   Depois volte aqui e espere.
  echo.
  echo.| %GH% auth login --hostname github.com --git-protocol https --web --clipboard
)
cls
"C:\Program Files\nodejs\node.exe" app\consertar-shopee.js
echo.
echo   Pode fechar esta janela no X.
pause >nul
