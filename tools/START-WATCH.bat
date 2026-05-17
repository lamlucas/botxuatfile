@echo off
chcp 65001 >nul
title Ads Monitor - Theo doi thu muc export
cd /d "%~dp0"
echo Bot dang theo doi thu muc trong config.json (export_folder)
echo De dung: dong cua so nay hoac Ctrl+C
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0watch-folder.ps1"
pause
