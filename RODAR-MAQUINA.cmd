@echo off
chcp 65001 >nul
cd /d "%~dp0"
node app\maquina.js lusia %*
echo.
pause
