# Upload file .xlsx mới nhất trong thư mục (mặc định Downloads)
# Cách dùng:
#   .\upload-latest.ps1
#   .\upload-latest.ps1 -Folder "D:\export"

param([string]$Folder = "", [string]$ConfigPath = "$PSScriptRoot\config.json")

if (-not (Test-Path $ConfigPath)) {
  Write-Host "Chua co config.json — copy tu config.example.json" -ForegroundColor Red
  exit 1
}

$cfg = Get-Content $ConfigPath -Raw | ConvertFrom-Json
if (-not $Folder) { $Folder = $cfg.export_folder }
if (-not $Folder) { $Folder = $cfg.watch_folder }
if (-not $Folder) { $Folder = 'C:\AdsReports\export' }

if (-not (Test-Path $Folder)) {
  Write-Host "Khong tim thay thu muc: $Folder" -ForegroundColor Red
  exit 1
}

$file = Get-ChildItem -Path $Folder -Filter *.xlsx -File -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $file) {
  Write-Host "Khong co file .xlsx trong: $Folder" -ForegroundColor Yellow
  exit 1
}

Write-Host "File moi nhat: $($file.FullName)"
& "$PSScriptRoot\send-report.ps1" -ReportPath $file.FullName -ConfigPath $ConfigPath
