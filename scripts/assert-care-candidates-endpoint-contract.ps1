$ErrorActionPreference = "Stop"

$routeFile = Join-Path $PSScriptRoot "..\src\functions\getCareCandidates\function.json"

if (-not (Test-Path $routeFile)) {
  throw "Missing getCareCandidates function.json"
}

$json = Get-Content $routeFile -Raw | ConvertFrom-Json

if ($json.entryPoint -ne "getCareCandidates") {
  throw "Expected entryPoint=getCareCandidates"
}

$route = $json.bindings |
  Where-Object { $_.type -eq "httpTrigger" } |
  Select-Object -First 1

if ($null -eq $route) {
  throw "Missing httpTrigger binding"
}

if ($route.route -ne "care/candidates") {
  throw "Expected route care/candidates"
}

Write-Host "OK: care candidates endpoint contract passed."
