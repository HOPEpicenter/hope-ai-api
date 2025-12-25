$ErrorActionPreference = "Stop"

$base = "http://localhost:7071/api"
$headers = @{ "x-api-key" = $env:HOPE_API_KEY }
if (-not $headers["x-api-key"]) { throw "HOPE_API_KEY env var is not set." }

function PostJson($url, $obj) {
  Invoke-RestMethod -Method Post -Uri $url -Headers $headers -ContentType "application/json" -Body ($obj | ConvertTo-Json -Depth 10)
}
function GetJson($url) {
  Invoke-RestMethod -Method Get -Uri $url -Headers $headers
}

# 1) Get one eligible visitor from queue (cooldown disabled so it appears)
$q = GetJson "$base/formation/followup-queue?cooldownHours=0"
if (-not $q.items -or $q.items.Count -lt 1) {
  Write-Host "No queue items available to assign. (Dry run only)" -ForegroundColor Yellow
  exit 0
}

$vid = $q.items[0].visitorId
Write-Host "Target visitorId=$vid" -ForegroundColor Cyan

# 2) Run auto-assign targeting that visitor
$r = PostJson "$base/formation/followup/auto-assign" @{
  visitorId = $vid
  assigneeId = "ph7-auto"
  maxResults = 1
  dryRun = $false
  cooldownHours = 0
  windowHours = 168
  windowDays = 14
  notes = "Phase 7A smoke auto-assign"
  channel = "auto"
}

if (-not $r.ok -or $r.dryRun -ne $false) { throw "Auto-assign did not succeed." }
if ($r.assignedCount -lt 1) { throw "Expected assignedCount >= 1." }

# 3) Verify formation events show FOLLOWUP_ASSIGNED for this visitor
$events = GetJson "$base/formation/events?visitorId=$vid&limit=30"
$eventsJson = $events | ConvertTo-Json -Depth 80

if ($eventsJson -notmatch '"type"\s*:\s*"FOLLOWUP_ASSIGNED"') {
  throw "Expected FOLLOWUP_ASSIGNED event in timeline."
}

Write-Host "PHASE 7A VERIFIED: auto-assign wrote FOLLOWUP_ASSIGNED." -ForegroundColor Green
