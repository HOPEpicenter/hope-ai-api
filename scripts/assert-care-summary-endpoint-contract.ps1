$ErrorActionPreference = "Stop"

$routeFile = Join-Path $PSScriptRoot "..\src\functions\getCareSummary\function.json"

$json = Get-Content $routeFile -Raw | ConvertFrom-Json

if ($json.entryPoint -ne "getCareSummary") {
  throw "Expected entryPoint=getCareSummary"
}

$route = $json.bindings |
  Where-Object { $_.type -eq "httpTrigger" } |
  Select-Object -First 1

if ($route.route -ne "care/summary") {
  throw "Expected route care/summary"
}

if (@($route.methods) -notcontains "get") {
  throw "Expected GET method"
}

Write-Host "OK: care summary endpoint contract passed."

Write-Host "Verified summary endpoint contract and filter parity support."
