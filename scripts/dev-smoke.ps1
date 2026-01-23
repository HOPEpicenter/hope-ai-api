param(
  [switch]$NoNetwork
)

$ErrorActionPreference = "Stop"

# --- HOPE DEV STABILITY: Azurite + ports (auto) ---
# Goal: make local smoke reliable (Express-only runtime) and prevent accidental real Azure usage.

$DEVSTORE_KEY = "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw=="
$CANONICAL_AZURITE_TABLES_CS = "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=$DEVSTORE_KEY;TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;"

function Normalize-AzuriteTablesConnectionString([string]$cs) {
  if (-not $cs) { return $cs }
  $v = $cs.Trim()

  if ($v -match '(?i)UseDevelopmentStorage\s*=\s*true') { return $CANONICAL_AZURITE_TABLES_CS }

  if (
    ($v -match '(?i)TableEndpoint=http://(localhost|127\.0\.0\.1):10002;?') -and
    ($v -notmatch '(?i)TableEndpoint=http://(localhost|127\.0\.0\.1):10002/devstoreaccount1;?')
  ) {
    return ($v -replace '(?i)TableEndpoint=http://(localhost|127\.0\.0\.1):10002;?', 'TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;')
  }

  return $v
}

function Assert-PortListening([string]$name, [int]$port) {
  $ok = (Test-NetConnection -ComputerName 127.0.0.1 -Port $port -WarningAction SilentlyContinue).TcpTestSucceeded
  if (-not $ok) {
    throw ("{0} is not listening on 127.0.0.1:{1}. Start it, then re-run this script." -f $name, $port)
  }
}

if (-not $env:HOPE_FORCE_AZURITE) { $env:HOPE_FORCE_AZURITE = "1" }

if (-not $env:STORAGE_CONNECTION_STRING -or -not $env:STORAGE_CONNECTION_STRING.Trim()) {
  $env:STORAGE_CONNECTION_STRING = $CANONICAL_AZURITE_TABLES_CS
} else {
  $env:STORAGE_CONNECTION_STRING = Normalize-AzuriteTablesConnectionString $env:STORAGE_CONNECTION_STRING
}

if (-not $NoNetwork) {
  Assert-PortListening "Azurite Tables" 10002
  Assert-PortListening "Express API" 3000
}

Write-Host ("[DEV] HOPE_FORCE_AZURITE={0}" -f $env:HOPE_FORCE_AZURITE)
Write-Host ("[DEV] STORAGE_CONNECTION_STRING={0}" -f ($env:STORAGE_CONNECTION_STRING -replace "AccountKey=[^;]+","AccountKey=***"))
# --- end dev stability block ---

function Get-Headers() {
  $h = @{}
  $k = $env:HOPE_API_KEY
  if (-not $k) { $k = "" }
  $k = $k.Trim()
  if ($k) { $h["x-api-key"] = $k }
  return $h
}

function Invoke-Json([string]$method, [string]$url, [string]$bodyJson = $null) {
  $headers = Get-Headers
  if ($method -in @("POST","PUT","PATCH")) {
    return Invoke-RestMethod -Method $method -Uri $url -Headers $headers -ContentType "application/json" -Body $bodyJson
  }
  return Invoke-RestMethod -Method $method -Uri $url -Headers $headers
}

if ($NoNetwork) {
  Write-Host "[OK] Parsed dev-smoke.ps1 (NoNetwork mode)."
  exit 0
}

$base = $env:HOPE_BASE_URL
if (-not $base) { $base = "http://localhost:3000" }

$bodyObj = @{
  firstName = "John"
  lastName  = "Doe"
  email     = ("john+{0}@example.com" -f (Get-Date -Format "yyyyMMddHHmmss"))
  phone     = "555-1234"
  notes     = "dev smoke"
  tags      = @()
  source    = "test"
}
$bodyJson = $bodyObj | ConvertTo-Json -Depth 10

Write-Host ""
Write-Host ("POST {0}/api/visitors" -f $base)
$created = Invoke-Json "POST" ("{0}/api/visitors" -f $base) $bodyJson
$created | ConvertTo-Json -Depth 20

$id = $created.id
if (-not $id) { throw "POST did not return an 'id' field." }

Write-Host ""
Write-Host ("CREATED ID: {0}" -f $id)

Write-Host ""
Write-Host ("GET {0}/api/visitors/{1}" -f $base, $id)
$got = Invoke-Json "GET" ("{0}/api/visitors/{1}" -f $base, $id)
$got | ConvertTo-Json -Depth 20

Write-Host ""
Write-Host ("LIST {0}/api/visitors?limit=5" -f $base)
$list = Invoke-Json "GET" ("{0}/api/visitors?limit=5" -f $base)
$list | ConvertTo-Json -Depth 20
