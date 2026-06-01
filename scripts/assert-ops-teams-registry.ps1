param(
  [string]$Base = "http://127.0.0.1:7071/api/ops"
)

$ErrorActionPreference = "Stop"

$result = Invoke-RestMethod "$Base/teams"

if ($result.ok -ne $true) {
  throw "Expected ok=true"
}

if ($null -eq $result.teams) {
  throw "Expected teams collection"
}

$teamIds = @($result.teams | ForEach-Object { $_.teamId })

if ("ops" -notin $teamIds) {
  throw "Expected ops team"
}

if ("care" -notin $teamIds) {
  throw "Expected care team"
}

Write-Host "OK: teams registry v1 endpoint works." -ForegroundColor Green