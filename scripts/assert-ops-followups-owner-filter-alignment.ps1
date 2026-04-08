param(
  [string]$Base = "http://127.0.0.1:3000"
)

$ErrorActionPreference = "Stop"
$headers = @{ "x-api-key" = $env:HOPE_API_KEY }

$result = Invoke-RestMethod "$Base/ops/followups?assignedTo=ops-user-1&includeResolved=true&limit=100" -Headers $headers

if ($result.ok -ne $true) {
  throw "Expected ok=true"
}

if ($result.assignedTo -ne "ops-user-1") {
  throw "Expected assignedTo filter to echo ops-user-1"
}

if ($null -eq $result.owners) {
  throw "Expected owners rollup"
}

if ($result.owners.Count -gt 1) {
  throw "Expected at most one owner in owners rollup when assignedTo filter is applied"
}

if ($result.owners.Count -eq 1 -and $result.owners[0].ownerId -ne "ops-user-1") {
  throw "Expected owners rollup to contain only ops-user-1"
}

if (($result.items | Where-Object { $_.assignedTo.ownerId -ne "ops-user-1" }).Count -gt 0) {
  throw "Found item outside assignedTo filter"
}

Write-Host "OK: owner filter alignment already works." -ForegroundColor Green

