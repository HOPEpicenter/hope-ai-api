$ErrorActionPreference = "Stop"

$routeFile = Join-Path $PSScriptRoot "..\src\functions\getCareCandidate\function.json"

if (-not (Test-Path $routeFile)) {
  throw "Missing getCareCandidate function.json"
}

$json = Get-Content $routeFile -Raw | ConvertFrom-Json

if ($json.entryPoint -ne "getCareCandidate") {
  throw "Expected entryPoint=getCareCandidate"
}

$route = $json.bindings |
  Where-Object { $_.type -eq "httpTrigger" } |
  Select-Object -First 1

if ($null -eq $route) {
  throw "Missing httpTrigger binding"
}

if ($route.route -ne "care/candidates/{visitorId}") {
  throw "Expected route care/candidates/{visitorId}"
}

if (@($route.methods) -notcontains "get") {
  throw "Expected GET method"
}

Write-Host "OK: care candidate detail endpoint contract passed."
