@echo off
rem Arranca la web en local y abre Chrome cuando ya responde. Deja esta ventana abierta mientras la uses.
cd /d "%~dp0"
if "%~1"=="abrir" goto abrir
if not exist node_modules call npm install
start "" /min cmd /c ""%~f0" abrir"
call npm run dev
pause
exit /b

:abrir
rem Espera hasta 60 s a que la web conteste y entonces abre Chrome
for /l %%i in (1,1,60) do (
  curl -s -o nul http://localhost:5173/ && (start chrome http://localhost:5173 & exit /b)
  ping -n 2 127.0.0.1 >nul
)
exit /b
