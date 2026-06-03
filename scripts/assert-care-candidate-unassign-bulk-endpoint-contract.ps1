$ErrorActionPreference = "Stop"

$routeFile = Join-Path $PSScriptRoot "..\src\functions\postCareCandidateUnassignBulk\function.json"

if (-not (Test-Path $routeFile)) {
  throw "Missing postCareCandidateUnassignBulk function.json"
}

$json = Get-Content $routeFile -Raw | ConvertFrom-Json

if ($json.entryPoint -ne "postCareCandidateUnassignBulk") {
  throw "Expected entryPoint=postCareCandidateUnassignBulk"
}

$route = $json.bindings |
  Where-Object { $_.type -eq "httpTrigger" } |
  Select-Object -First 1

if ($route.route -ne "care/candidates/unassign-bulk") {
  throw "Expected route care/candidates/unassign-bulk"
}

if (@($route.methods) -notcontains "post") {
  throw "Expected POST method"
}

Write-Host "OK: care candidate bulk unassign endpoint contract passed."
