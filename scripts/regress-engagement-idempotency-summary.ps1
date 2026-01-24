$ErrorActionPreference = "Stop"

if (-not $env:HOPE_API_KEY) { throw "HOPE_API_KEY is required" }

$base = "http://localhost:3000/api"
$headers = @{ "x-api-key" = $env:HOPE_API_KEY }

function Assert([bool]$cond, [string]$msg) { if (-not $cond) { throw $msg } }

Write-Host "== Phase 3 Regression: engagement idempotency + summary =="

# 1) Create visitor
$email = "john+regress-{0}@example.com" -f (Get-Date -Format "yyyyMMddHHmmss")
$visitorBody = @{
  firstName="John"; lastName="Doe"; email=$email; phone="555-1234"; status="new"; tags=@(); notes=""
} | ConvertTo-Json -Depth 10

$visitor = Invoke-RestMethod -Method Post -Uri "$base/visitors" -Headers $headers -ContentType "application/json" -Body $visitorBody
$vid = $visitor.id
Assert ($vid -and $vid.Length -gt 10) "Expected visitor id"
Write-Host "VisitorId=$vid"

# 2) Post same engagement twice (fixed id + occurredAt)
$fixedId = "fixed-id-001"
$occurredAt = (Get-Date).ToUniversalTime().ToString("o")

$engBody = @{
  id = $fixedId
  visitorId = $vid
  type = "CONTACT"
  channel = "web"
  notes = "regression"
  occurredAt = $occurredAt
} | ConvertTo-Json -Depth 10

$e1 = Invoke-RestMethod -Method Post -Uri "$base/engagements" -Headers $headers -ContentType "application/json" -Body $engBody
$e2 = Invoke-RestMethod -Method Post -Uri "$base/engagements" -Headers $headers -ContentType "application/json" -Body $engBody

Assert ($e1.id -eq $fixedId) "Expected first event id == fixed id"
Assert ($e2.id -eq $fixedId) "Expected second call to return existing event (same id)"

# 3) List engagements (should be 1)
$list = Invoke-RestMethod -Method Get -Uri "$base/visitors/$vid/engagements?limit=10" -Headers $headers
$items = $list.items
if ($null -eq $items) { $items = $list }
Assert ($items.Count -eq 1) ("Expected list count=1; got {0}" -f $items.Count)

# 4) Read summary (should reflect 1 event)
$sumResp = Invoke-RestMethod -Method Get -Uri "$base/visitors/$vid/engagements/summary" -Headers $headers
Assert ($sumResp.ok -eq $true) "Expected ok:true from summary endpoint"
Assert ($sumResp.visitorId -eq $vid) "Expected visitorId match"

if ($null -eq $sumResp.summary) { throw "Expected summary to exist after creating engagement (got null)" }

$eventCount = $sumResp.summary.eventCount
Assert ($eventCount -eq 1) ("Expected summary.eventCount=1; got {0}" -f $eventCount)

Write-Host "OK: idempotency + summary verified (listCount=1, eventCount=1)"