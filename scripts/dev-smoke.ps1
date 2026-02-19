param(
  [string]$ApiBase = "http://127.0.0.1:3000/api"
)

$ErrorActionPreference = "Stop"

if (-not $env:HOPE_API_KEY) { throw "HOPE_API_KEY is not set" }

Write-Host "[dev-smoke] GET $ApiBase/health"
$resp = curl.exe -s "$ApiBase/health"
Write-Host $resp

Write-Host "[dev-smoke] GET $ApiBase/formation/profiles (auth)"
$resp = curl.exe -s -H "x-api-key: $env:HOPE_API_KEY" "$ApiBase/formation/profiles"
Write-Host $resp