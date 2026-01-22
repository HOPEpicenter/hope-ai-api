param(
  [string]$BaseUrl = "http://127.0.0.1:3000/api"
)

$ErrorActionPreference = "Stop"

if (-not $env:HOPE_API_KEY) {
  throw "HOPE_API_KEY env var is missing. CI must set secrets.HOPE_API_KEY"
}

$headers = @{ "x-api-key" = $env:HOPE_API_KEY }

function Assert([bool]$cond, [string]$msg) {
  if (-not $cond) { throw $msg }
}

Write-Host "=== CI EXPRESS SMOKE ==="
Write-Host "BaseUrl: $BaseUrl"

# POST /visitors
$stamp = Get-Date -Format "yyyyMMddHHmmss"
$body = @{
  firstName = "CI"
  lastName  = "Smoke"
  email     = "ci-smoke+$stamp@example.com"
  phone     = "555-0000"
  source    = "ci"
} | ConvertTo-Json

Write-Host "POST $BaseUrl/visitors"
$created = Invoke-RestMethod -Method Post -Uri "$BaseUrl/visitors" -Headers $headers -ContentType "application/json" -Body $body

# Your API returns { id: "...", ... } in your dev output
Assert ($created.id) "POST /visitors did not return 'id'. Response: $(($created | ConvertTo-Json -Depth 10))"
$vid = $created.id
Write-Host "CREATED ID: $vid"

# GET /visitors/{id}
Write-Host "GET $BaseUrl/visitors/$vid"
$got = Invoke-RestMethod -Method Get -Uri "$BaseUrl/visitors/$vid" -Headers $headers
Assert ($got.id -eq $vid) "GET /visitors/{id} returned wrong id. Response: $(($got | ConvertTo-Json -Depth 10))"

# LIST /visitors?limit=5
Write-Host "LIST $BaseUrl/visitors?limit=5"
$list = Invoke-RestMethod -Method Get -Uri "$BaseUrl/visitors?limit=5" -Headers $headers

# Your API returns { ok:true, count, limit, items:[...] }
Assert ($list.ok -eq $true) "LIST /visitors did not return ok=true. Response: $(($list | ConvertTo-Json -Depth 10))"
Assert ($list.items.Count -ge 1) "LIST /visitors returned no items. Response: $(($list | ConvertTo-Json -Depth 10))"

Write-Host "OK: CI Express smoke passed."
