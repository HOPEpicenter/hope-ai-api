param(
  [string]$ApiBaseUrl = "http://127.0.0.1:3000/api"
)

# --- Phase gate: skip Phase 4 asserts unless explicitly enabled ---
if ($env:HOPE_RUN_PHASE4_ASSERTS -ne "1") {
  Write-Host "SKIP: Phase 4 assertions disabled. Set HOPE_RUN_PHASE4_ASSERTS=1 to enable." -ForegroundColor Yellow
  exit 0
}

$ErrorActionPreference = "Stop"

function Require-Env([string]$name) {
  $v = [Environment]::GetEnvironmentVariable($name)
  if ([string]::IsNullOrWhiteSpace($v)) { throw "Missing required env var: $name" }
  return $v
}

$apiKey = Require-Env "HOPE_API_KEY"
$headers = @{
  "x-api-key" = $apiKey
  "content-type" = "application/json"
}

Write-Host "=== INTEGRATION SUMMARY ASSERT (v1) ==="
Write-Host "ApiBaseUrl: $ApiBaseUrl"

# Create visitor
Write-Host "[assert-integration-summary] Creating visitor..."
$visitor = Invoke-RestMethod -Method Post -Uri "$ApiBaseUrl/visitors" -Headers $headers -Body (@{ name="Assert Summary"; email=("assert-summary-" + [Guid]::NewGuid().ToString() + "@example.com") } | ConvertTo-Json)

$visitorId = $visitor.visitorId
if ([string]::IsNullOrWhiteSpace($visitorId)) { $visitorId = $visitor.id }
if ([string]::IsNullOrWhiteSpace($visitorId)) { throw "Visitor id missing from response." }

Write-Host "[assert-integration-summary] visitorId=$visitorId"

# Hit the new endpoint (should always return ok + visitorId + summary)
$u = "$ApiBaseUrl/integration/summary?visitorId=$([Uri]::EscapeDataString($visitorId))"
Write-Host "GET $u"

$r = Invoke-RestMethod -Method Get -Uri $u -Headers $headers

if ($r.ok -ne $true) { throw "Expected ok=true" }
if ($r.visitorId -ne $visitorId) { throw "visitorId mismatch" }
if ($null -eq $r.summary) { throw "summary missing" }

# Minimal shape checks (derived view may be nulls when no events exist)
if ($null -eq $r.summary.sources) { throw "summary.sources missing" }

Write-Host "OK: Integration summary assertions passed." -ForegroundColor Green