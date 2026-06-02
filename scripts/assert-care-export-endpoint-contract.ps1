$ErrorActionPreference = "Stop"

$routeFile = Join-Path $PSScriptRoot "..\src\functions\getCareExport\function.json"

$json = Get-Content $routeFile -Raw | ConvertFrom-Json

if ($json.entryPoint -ne "getCareExport") {
  throw "Expected entryPoint=getCareExport"
}

$route = $json.bindings |
  Where-Object { $_.type -eq "httpTrigger" } |
  Select-Object -First 1

if ($route.route -ne "care/export") {
  throw "Expected route care/export"
}

if (@($route.methods) -notcontains "get") {
  throw "Expected GET method"
}

Write-Host "OK: care export endpoint contract passed."
