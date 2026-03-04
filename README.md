# --- 1. Paths ---
$readmePath = Resolve-Path ".\README.md"
$tempFile   = "$env:TEMP\fastpath.md"

# --- 2. UTF-8 No BOM Encoding ---
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

# --- 3. Write the fast-path section to temporary file ---
Set-Content -Path $tempFile -Value @"
## Smoke: Formation profile fast-path assert

```powershell
.\scripts\assert-formation-profile-fastpath.ps1 `
  -ApiBase http://127.0.0.1:3000/api `
  -ApiKey `$env:HOPE_API_KEY

## OPS vs API surface (dev discipline)

- `/ops/*` is dev/admin tooling only (internal operators + scripts; not the public surface).
- `/api/*` is the public-ish surface (the contract we treat as “product/API”).
- After every major update, verify/update dev seed + helper scripts (`dev-seed.ps1`, `dev-functions.ps1`, `dev-up.ps1`) and record it in update notes / master plan (stay prod-like).

## Local smoke tests

Prereqs:
- Set HOPE_API_KEY (required for protected endpoints).
- For storage-backed smoke checks (recommended):
  - Set STORAGE_CONNECTION_STRING=UseDevelopmentStorage=true
  - Start Azurite (Tables) so port 10002 is listening.

Run (PowerShell):
  $env:OPS_BASE_URL = "http://127.0.0.1:3000"
  $env:STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true"
  pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\smoke-tests.ps1 -BaseUrl $env:OPS_BASE_URL -ApiKey $env:HOPE_API_KEY

Notes:
- If STORAGE_CONNECTION_STRING is not set, the stale EMAIL index repair regression in smoke will be skipped.


## Azure Functions programming model (locked for stability)

This repo is currently locked to the **classic** Azure Functions Node.js model:
- unction.json per function
- scriptFile points to dist/.../index.js
- ntryPoint matches an exported function (e.g., xport async function version(...))

We can consider upgrading to the newer pp.http(...) programming model **after the project is stable** and only if it makes sense.

