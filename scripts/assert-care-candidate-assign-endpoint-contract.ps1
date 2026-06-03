$ErrorActionPreference = "Stop"

$routeFile = Join-Path $PSScriptRoot "..\src\functions\postCareCandidateAssign\function.json"

if (-not (Test-Path $routeFile)) {
  throw "Missing postCareCandidateAssign function.json"
}

$json = Get-Content $routeFile -Raw | ConvertFrom-Json

if ($json.entryPoint -ne "postCareCandidateAssign") {
  throw "Expected entryPoint=postCareCandidateAssign"
}

$route = $json.bindings |
  Where-Object { $_.type -eq "httpTrigger" } |
  Select-Object -First 1

if ($null -eq $route) {
  throw "Missing httpTrigger binding"
}

if ($route.route -ne "care/candidates/{visitorId}/assign") {
  throw "Expected route care/candidates/{visitorId}/assign"
}

if (@($route.methods) -notcontains "post") {
  throw "Expected POST method"
}

Write-Host "OK: care candidate assign endpoint contract passed."
