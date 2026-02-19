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
