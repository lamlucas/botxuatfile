@echo off
REM Gọi sau khi tool export xong. Ví dụ: send-report.bat "D:\export\report.xlsx"
setlocal
if "%~1"=="" (
  echo Usage: send-report.bat "path\to\report.xlsx"
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0send-report.ps1" -ReportPath "%~1"
exit /b %ERRORLEVEL%
