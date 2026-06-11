param(
  [Parameter(Mandatory = $true)]
  [string]$BaseUrl
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command openclaw -ErrorAction SilentlyContinue)) {
  throw "OpenClaw no está instalado o no está disponible en PATH."
}

$envFile = Join-Path $PSScriptRoot "..\.env.local"
$cronSecretLine = Get-Content $envFile | Where-Object { $_ -like "CRON_SECRET=*" }
if (-not $cronSecretLine) {
  throw "CRON_SECRET no está configurado en .env.local."
}

$cronSecret = $cronSecretLine.Substring("CRON_SECRET=".Length)
$captureUrl = "$($BaseUrl.TrimEnd('/'))/api/cron/weather-capture"
$scriptPath = (Resolve-Path (Join-Path $PSScriptRoot "openclaw-weather-capture.mjs")).Path
$commandArgv = @("node", $scriptPath) | ConvertTo-Json -Compress

openclaw cron create "0 * * * *" `
  --name "Meteo Huéscar - captura horaria" `
  --command-argv $commandArgv `
  --command-env "WEATHER_CAPTURE_URL=$captureUrl" `
  --command-env "WEATHER_CAPTURE_SECRET=$cronSecret" `
  --timeout-seconds 180 `
  --no-deliver

openclaw cron list
