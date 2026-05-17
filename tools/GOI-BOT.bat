@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === Goi bot kiem tra report ===
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0upload-latest.ps1" %*
if errorlevel 1 pause
exit /b %errorlevel%
