$ErrorActionPreference = "Stop"

$routeFile = Join-Path $PSScriptRoot "..\src\functions\postCareCandidateAssignBulk\function.json"

if (-not (Test-Path $routeFile)) {
  throw "Missing postCareCandidateAssignBulk function.json"
}

$json = Get-Content $routeFile -Raw | ConvertFrom-Json

if ($json.entryPoint -ne "postCareCandidateAssignBulk") {
  throw "Expected entryPoint=postCareCandidateAssignBulk"
}

$route = $json.bindings |
  Where-Object { $_.type -eq "httpTrigger" } |
  Select-Object -First 1

if ($null -eq $route) {
  throw "Missing httpTrigger binding"
}

if ($route.route -ne "care/candidates/assign-bulk") {
  throw "Expected route care/candidates/assign-bulk"
}

if (@($route.methods) -notcontains "post") {
  throw "Expected POST method"
}

Write-Host "OK: care candidate bulk assign endpoint contract passed."
