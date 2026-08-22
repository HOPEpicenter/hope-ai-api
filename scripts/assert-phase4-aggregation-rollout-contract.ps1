Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$acceptancePath = Join-Path $repoRoot 'scripts/assert-phase4-aggregation-staging.ps1'
$runbookPath = Join-Path $repoRoot 'docs/architecture/PHASE4_STAGING_ROLLOUT_RUNBOOK.md'

foreach ($path in @($acceptancePath, $runbookPath)) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Missing Phase 4 rollout artifact: $path"
  }
}

$acceptance = Get-Content -LiteralPath $acceptancePath -Raw
$runbook = Get-Content -LiteralPath $runbookPath -Raw

foreach ($requiredText in @(
  'PHASE4_AGGREGATION_DISABLED',
  '/aggregate',
  '/timeline',
  '/readiness',
  '/snapshot',
  'ExpectDisabled',
  'x-api-key'
)) {
  if ($acceptance -notmatch [regex]::Escape($requiredText)) {
    throw "Phase 4 staging acceptance is missing: $requiredText"
  }
}

foreach ($requiredText in @(
  'Staging only',
  'Rollback',
  'FEATURE_PHASE4_AGGREGATION=true',
  'FEATURE_PHASE4_AGGREGATION=false',
  'Production'
)) {
  if ($runbook -notmatch [regex]::Escape($requiredText)) {
    throw "Phase 4 rollout runbook is missing: $requiredText"
  }
}

Write-Host 'Phase 4 rollout contract passed.'
