$ErrorActionPreference = "Stop"

$routeFile = Join-Path $PSScriptRoot "..\src\functions\postCareCandidateUnassign\function.json"

if (-not (Test-Path $routeFile)) {
  throw "Missing postCareCandidateUnassign function.json"
}

$json = Get-Content $routeFile -Raw | ConvertFrom-Json

if ($json.entryPoint -ne "postCareCandidateUnassign") {
  throw "Expected entryPoint=postCareCandidateUnassign"
}

$route = $json.bindings |
  Where-Object { $_.type -eq "httpTrigger" } |
  Select-Object -First 1

if ($null -eq $route) {
  throw "Missing httpTrigger binding"
}

if ($route.route -ne "care/candidates/{visitorId}/unassign") {
  throw "Expected route care/candidates/{visitorId}/unassign"
}

if (@($route.methods) -notcontains "post") {
  throw "Expected POST method"
}

Write-Host "OK: care candidate unassign endpoint contract passed."
