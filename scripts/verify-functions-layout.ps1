$ErrorActionPreference = "Stop"

function Assert-Exists($p) { if (-not (Test-Path $p)) { throw "Missing: $p" } }

Assert-Exists ".\host.json"
Assert-Exists ".\version\function.json"
Assert-Exists ".\dist\functions\version\index.js"

$fn = Get-Content ".\version\function.json" -Raw

if ($fn -notmatch '"scriptFile"\s*:\s*"\.\./dist/functions/version/index\.js"') {
  throw "version/function.json has unexpected scriptFile. Expected ../dist/functions/version/index.js"
}

if ($fn -match '"name"\s*:\s*"\$return"') {
  throw "version/function.json uses `$return. Expected output binding name 'res'."
}

Write-Host "OK: Functions layout and bindings look valid."