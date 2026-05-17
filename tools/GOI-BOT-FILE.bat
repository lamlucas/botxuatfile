@echo off
chcp 65001 >nul
cd /d "%~dp0"
if "%~1"=="" (
  echo Cach dung: keo tha file .xlsx len file .bat nay
  echo    hoac: GOI-BOT-FILE.bat "D:\duong\dan\report.xlsx"
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0send-report.ps1" -ReportPath "%~1"
if errorlevel 1 pause
exit /b %errorlevel%
