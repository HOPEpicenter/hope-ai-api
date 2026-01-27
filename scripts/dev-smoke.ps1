$ErrorActionPreference = "Stop"

# Set storage env for this session (Azurite)
$env:AzureWebJobsStorage = "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1;TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;"
$env:STORAGE_CONNECTION_STRING = $env:AzureWebJobsStorage

function Invoke-HopePostJson {
  param(
    [Parameter(Mandatory=$true)][string]$Url,
    [Parameter(Mandatory=$true)][object]$Body
  )

  $json = $Body | ConvertTo-Json -Compress
  $tmp = Join-Path $env:TEMP ("hope_" + [guid]::NewGuid().ToString("n") + ".json")
  $json | Set-Content -Encoding utf8 -NoNewline $tmp

  try {
    curl.exe -s -i -H "Content-Type: application/json" --data-binary "@$tmp" $Url
  }
  finally {
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
  }
}

$base = "http://localhost:3000/api"

$payload = @{
  firstName = "John"
  lastName  = "Doe"
  email     = ("john+" + (Get-Date -Format "yyyyMMddHHmmss") + "@example.com")
  phone     = "555-1234"
  source    = "test"
}

Write-Host "`nPOST $base/visitors" -ForegroundColor Cyan
$resp = Invoke-HopePostJson -Url "$base/visitors" -Body $payload
$resp

$jsonLine = ($resp -split "`n" | Where-Object { $_ -match '^\{' } | Select-Object -Last 1)
if (-not $jsonLine) { throw "POST did not return JSON body." }

$obj = $jsonLine | ConvertFrom-Json
if (-not $obj.id) { throw "POST did not return an id. Body: $jsonLine" }

$id = $obj.id
Write-Host "`nCREATED ID: $id" -ForegroundColor Green

Write-Host "`nGET $base/visitors/$id" -ForegroundColor Cyan
curl.exe -s -i "$base/visitors/$id"
Write-Host "
LIST http://localhost:3000/api/visitors?limit=5" -ForegroundColor Cyan
curl.exe -s -i "http://localhost:3000/api/visitors?limit=5"