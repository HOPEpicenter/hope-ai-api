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

$implementationFile = Join-Path $PSScriptRoot "..\src\functions\postCareCandidateAssignBulk\index.ts"

if (-not (Test-Path $implementationFile)) {
  throw "Missing postCareCandidateAssignBulk implementation"
}

$implementation = Get-Content -LiteralPath $implementationFile -Raw

if ($implementation -notmatch 'readCanonicalStaffIdentity') {
  throw "Bulk care assignment must resolve assignedTo through the canonical staff directory"
}

if ($implementation -notmatch 'assigneeIdentity\.status\s*!==\s*"active"') {
  throw "Bulk care assignment must reject inactive canonical staff identities"
}

if ($implementation -notmatch 'assignedTo must reference an active canonical staff identity') {
  throw "Bulk care assignment must preserve the canonical active-assignee validation error"
}

Write-Host "OK: care candidate bulk assign endpoint contract passed."
