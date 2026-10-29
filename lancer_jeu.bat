@echo off
title Bamako Drive - serveur
cd /d "%~dp0"
echo.
echo   Demarrage de Bamako Drive...
start "" "http://localhost:8080"
node server.js
pause
