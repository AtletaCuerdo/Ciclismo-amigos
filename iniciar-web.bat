@echo off
rem Arranca la web en local y abre Chrome. Deja esta ventana abierta mientras la uses.
cd /d "%~dp0"
if not exist node_modules call npm install
start "" cmd /c "timeout /t 4 >nul & start chrome http://localhost:5173"
call npm run dev
pause
