$ErrorActionPreference = "Stop"

function Assert-Exists([string]$p) {
  if (-not (Test-Path $p)) { throw "Missing: $p" }
}

function Assert-JsonHas([string]$path, [string]$pattern, [string]$message) {
  $raw = Get-Content $path -Raw
  if ($raw -notmatch $pattern) { throw $message }
}

# Required root artifacts (Azure Functions discovery)
Assert-Exists ".\host.json"
Assert-Exists ".\version\function.json"
Assert-Exists ".\health\function.json"

# Required compiled outputs
Assert-Exists ".\dist\functions\version\index.js"
Assert-Exists ".\dist\functions\health\index.js"

# Validate scriptFile paths
Assert-JsonHas ".\version\function.json" '"scriptFile"\s*:\s*"\.\./dist/functions/version/index\.js"' `
  "version/function.json has unexpected scriptFile. Expected ../dist/functions/version/index.js"

Assert-JsonHas ".\health\function.json" '"scriptFile"\s*:\s*"\.\./dist/functions/health/index\.js"' `
  "health/function.json has unexpected scriptFile. Expected ../dist/functions/health/index.js"

# Ensure we do NOT regress to `$return`
$vf = Get-Content ".\version\function.json" -Raw
if ($vf -match '"name"\s*:\s*"\$return"') {
  throw "version/function.json uses `$return. Expected output binding name 'res'."
}

$hf = Get-Content ".\health\function.json" -Raw
if ($hf -match '"name"\s*:\s*"\$return"') {
  throw "health/function.json uses `$return. Expected output binding name 'res'."
}

# OPTIONAL: if entryPoint exists, ensure it's correct (classic)
if ($vf -match '"entryPoint"\s*:') {
  Assert-JsonHas ".\version\function.json" '"entryPoint"\s*:\s*"version"' `
    "version/function.json has unexpected entryPoint. Expected 'version'."
}

if ($hf -match '"entryPoint"\s*:') {
  Assert-JsonHas ".\health\function.json" '"entryPoint"\s*:\s*"health"' `
    "health/function.json has unexpected entryPoint. Expected 'health'."
}

# Lock to classic programming model: forbid app.http(...) in src/functions
$hits = & git grep -n 'app\.http\(' -- .\src\functions
if ($LASTEXITCODE -eq 0 -and $hits) {
  throw "Found app.http(...) usage in src/functions. Repo is locked to classic model for stability. Remove new-model functions."
}

Write-Host "OK: Functions layout looks valid (classic model locked)."
