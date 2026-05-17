# Gửi file báo cáo lên Cloudflare Worker sau khi tool export xong.
# Cách dùng:
#   .\send-report.ps1 -ReportPath "D:\export\report.xlsx"
#   .\send-report.ps1 -ReportPath "D:\export\report.xlsx" -ConfigPath ".\config.json"

param(
  [Parameter(Mandatory = $true)]
  [string]$ReportPath,

  [string]$ConfigPath = "$PSScriptRoot\config.json"
)

if (-not (Test-Path $ReportPath)) {
  Write-Error "Không tìm thấy file: $ReportPath"
  exit 1
}

if (-not (Test-Path $ConfigPath)) {
  Write-Error "Chưa có config. Copy config.example.json -> config.json và điền worker_url + webhook_secret"
  exit 1
}

$cfg = Get-Content $ConfigPath -Raw | ConvertFrom-Json
$workerUrl = $cfg.worker_url.TrimEnd('/')
$secret = $cfg.webhook_secret

if (-not $workerUrl -or -not $secret) {
  Write-Error "config.json thiếu worker_url hoặc webhook_secret"
  exit 1
}

$uri = "$workerUrl/api/tool/upload"
Write-Host "Upload + notify: $ReportPath"
Write-Host " -> $uri"

$form = @{
  secret = $secret
  file   = Get-Item -LiteralPath $ReportPath
}

try {
  $response = Invoke-RestMethod -Uri $uri -Method Post -Form $form
  Write-Host "OK:" ($response | ConvertTo-Json -Compress)
  exit 0
} catch {
  Write-Error $_.Exception.Message
  if ($_.ErrorDetails.Message) { Write-Error $_.ErrorDetails.Message }
  exit 1
}
