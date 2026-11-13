@echo off
rem Botao de 1 clique: conecta o GitHub (se precisar) e leva a chave certa da Helena (CHAVES.txt) para o GitHub.
rem Grava o resultado (sem a chave) em CONSERTAR-HELENA-resultado.txt para o Claude ler.
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
echo.
echo Gravando a chave da Helena...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$gh = 'C:\Program Files\GitHub CLI\gh.exe'; $log = 'CONSERTAR-HELENA-resultado.txt';" ^
  "$l = Get-Content 'contas/helena/CHAVES.txt';" ^
  "$t = (($l | Where-Object { $_ -match '^INSTAGRAM_TOKEN\s*[=:]' }) -replace '^INSTAGRAM_TOKEN\s*[=:]\s*','').Trim();" ^
  "$u = (($l | Where-Object { $_ -match '^INSTAGRAM_USER_ID\s*[=:]' }) -replace '^INSTAGRAM_USER_ID\s*[=:]\s*','').Trim();" ^
  "$e1 = (& $gh secret set INSTAGRAM_TOKEN_HELENA --body $t 2>&1 | Out-String); $c1 = $LASTEXITCODE;" ^
  "$e2 = (& $gh secret set INSTAGRAM_USER_ID_HELENA --body $u 2>&1 | Out-String); $c2 = $LASTEXITCODE;" ^
  "\"$(Get-Date) token=$c1 id=$c2`n$e1`n$e2\" | Out-File $log -Encoding utf8;" ^
  "if ($c1 -eq 0 -and $c2 -eq 0) { Write-Host ''; Write-Host '   PRONTO! Deu certo.' -ForegroundColor Green } else { Write-Host '   Nao deu. O Claude vai ler sozinho.' -ForegroundColor Red }"
echo.
echo   Pode fechar esta janela no X.
pause >nul
