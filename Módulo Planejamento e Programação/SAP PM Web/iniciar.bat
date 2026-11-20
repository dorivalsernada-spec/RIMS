@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel% equ 0 (
    py -3 server.py
) else (
    python server.py
)
if errorlevel 1 (
    echo.
    echo Nao foi possivel iniciar. Verifique se o Python 3 esta instalado.
    pause
)

