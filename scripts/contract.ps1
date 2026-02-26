param(
  [string]$BaseUrl = $env:HOPE_BASE_URL
)

function Normalize-BaseUrl([string]$u) {
  if ([string]::IsNullOrWhiteSpace($u)) { return $u }
  $u = $u.TrimEnd('/')
  if ($u.ToLower().EndsWith('/api')) { $u = $u.Substring(0, $u.Length - 4) }
  return $u
}

if (-not $BaseUrl) { throw "BaseUrl required (set HOPE_BASE_URL or pass -BaseUrl)" }

# Normalize to ROOT (no trailing /api)
$Root = Normalize-BaseUrl $BaseUrl
$ApiBase = "$Root/api"

Write-Host "== contract.ps1 =="
Write-Host "Root   : $Root"
Write-Host "ApiBase: $ApiBase"

# Force child scripts to use ROOT via env
$env:HOPE_BASE_URL = $Root

pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\smoke.ps1
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# This script expects ROOT and appends /api itself
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\smoke-visitor-engagements-e2e.ps1 -BaseUrl $Root
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# regression.ps1 defaults to /api already; keep as-is
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\regression.ps1
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "PASS contract suite ✅"
