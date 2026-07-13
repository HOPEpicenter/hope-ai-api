$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$inventoryPath = Join-Path $repoRoot "docs/runtime-route-inventory.md"

if (-not (Test-Path $inventoryPath)) {
  throw "Missing runtime route inventory: $inventoryPath"
}

$content = Get-Content $inventoryPath -Raw

$requiredText = @(
  "# Runtime Route Inventory",
  "## Public Health",
  "## Protected API",
  "## Ops Tooling",
  "## Internal Ops",
  "HOPE_API_KEY",
  "/api/health",
  "/api/version",
  "/api/formation/events",
  "/api/formation/profiles",
  "/api/staff-identities",
  "/api/engagements/events",
  "/api/integration/timeline",
  "/ops/followups",
  "/ops/task-preview-summary",
  "/api/_ops/formation/profile-audit"
)

foreach ($item in $requiredText) {
  if (-not $content.Contains($item)) {
    throw "Runtime route inventory missing required text: $item"
  }
}

Write-Host "OK: runtime route inventory assertion passed."
