# Theo dõi thư mục cố định — file .xlsx mới / cập nhật → tự gửi Worker
# Chạy: START-WATCH.bat (giữ cửa sổ mở)

param([string]$ConfigPath = "$PSScriptRoot\config.json", [int]$PollSeconds = 5)

if (-not (Test-Path $ConfigPath)) {
  Write-Host "Tao tools\config.json tu config.example.json" -ForegroundColor Red
  exit 1
}

$cfg = Get-Content $ConfigPath -Raw | ConvertFrom-Json
$folder = $cfg.export_folder
if (-not $folder) { $folder = $cfg.watch_folder }
if (-not $folder) { $folder = "C:\AdsReports\export" }

if (-not (Test-Path $folder)) {
  New-Item -ItemType Directory -Path $folder -Force | Out-Null
  Write-Host "Da tao thu muc: $folder"
}

$sendScript = Join-Path $PSScriptRoot "send-report.ps1"
$lastSent = @{ Path = ""; Time = [datetime]::MinValue }

Write-Host "Thu muc export: $folder" -ForegroundColor Green
Write-Host "Dat tool luu file .xlsx vao day. Kiem tra moi $PollSeconds giay." -ForegroundColor Gray
Write-Host "Ctrl+C de dung." -ForegroundColor Gray
Write-Host ""

while ($true) {
  $file = Get-ChildItem -Path $folder -Filter *.xlsx -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if ($file) {
    $key = "$($file.FullName)|$($file.LastWriteTime.Ticks)"
    if ($key -ne $lastSent.Path) {
      $age = (Get-Date) - $file.LastWriteTime
      if ($age.TotalSeconds -ge 2) {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Phat hien: $($file.Name)" -ForegroundColor Cyan
        & $sendScript -ReportPath $file.FullName -ConfigPath $ConfigPath
        $lastSent.Path = $key
      }
    }
  }

  Start-Sleep -Seconds $PollSeconds
}
