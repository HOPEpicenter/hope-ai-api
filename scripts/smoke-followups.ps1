[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)]
  [string]$BaseUrl
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "http.ps1")

function Assert-True { param($Cond,[string]$Msg) if (-not $Cond) { throw $Msg } }

function Find-FollowupByVisitorId {
  param($Items,[string]$VisitorId)
  foreach ($it in $Items) { try { if ($it.visitorId -eq $VisitorId) { return $it } } catch { } }
  return $null
}

Write-Host ""
Write-Host "== OPS Followups (/ops/followups) ==" -ForegroundColor Cyan

# Baseline (ops surface)
$opsBase = $BaseUrl.TrimEnd("/")
$resp0 = Invoke-HopeRequest -BaseUrl $opsBase -Method GET -Path "/ops/followups" -RequireApiKey
if ($resp0.PSObject.Properties.Match("Skip").Count -gt 0 -and $resp0.Skip) {
  Write-Host "SKIP: OPS followups smoke (set HOPE_API_KEY to run locally)" -ForegroundColor Yellow
  exit 0
}

Assert-True ($resp0.Status -eq 200) "Followups expected 200"
$rid0 = Assert-RequestId -Resp $resp0 -Context "GET /ops/followups baseline"
Assert-True ((Get-BodyProp -Resp $resp0 -Name "ok") -eq $true) "Followups expected ok:true"

# Create visitor (public surface)
$apiBase = $opsBase + "/api"
$nm = "followups-smoke-" + ([guid]::NewGuid().ToString("N").Substring(0,8))
$created = ApiRequest -BaseUrl $apiBase -Method POST -Path "/visitors" -Body @{ name=$nm; email=($nm+"@example.com") } -RequireApiKey
$visitorId = [string]$created.Body.visitorId
Assert-True ($visitorId -and $visitorId.Length -gt 10) "Expected visitorId from POST /api/visitors"
Write-Host ("visitorId={0}" -f $visitorId)

# Assign followup (requires metadata.assigneeId)
$assigneeId = "smoke-assignee"
[void](ApiRequest -BaseUrl $apiBase -Method POST -Path "/formation/events" -Body @{
  visitorId = $visitorId
  type = "FOLLOWUP_ASSIGNED"
  metadata = @{
    assigneeId = $assigneeId
    urgency = "MEDIUM"
    recommendedAction = "CHECK_IN"
    reason = "smoke"
  }
} -RequireApiKey)

# Appears in followups
$found = $null
for ($i=0; $i -lt 10 -and -not $found; $i++) {
  Start-Sleep -Milliseconds 200
  $r = Invoke-HopeRequest -BaseUrl $opsBase -Method GET -Path "/ops/followups" -RequireApiKey
  $items = Get-BodyProp -Resp $r -Name "items"
  if ($null -eq $items) { $items = @() }
  $found = Find-FollowupByVisitorId -Items $items -VisitorId $visitorId
}
Assert-True ($null -ne $found) "Expected visitorId to appear in /ops/followups after FOLLOWUP_ASSIGNED"

# Outcome
[void](ApiRequest -BaseUrl $apiBase -Method POST -Path "/formation/events" -Body @{
  visitorId = $visitorId
  type = "FOLLOWUP_OUTCOME_RECORDED"
  metadata = @{
    outcome = "COMPLETED"
    note = "smoke"
  }
} -RequireApiKey)

# Disappears
$still = $true
for ($i=0; $i -lt 10; $i++) {
  Start-Sleep -Milliseconds 200
  $r = Invoke-HopeRequest -BaseUrl $opsBase -Method GET -Path "/ops/followups" -RequireApiKey
  $items = Get-BodyProp -Resp $r -Name "items"
  if ($null -eq $items) { $items = @() }
  if (-not (Find-FollowupByVisitorId -Items $items -VisitorId $visitorId)) { $still = $false; break }
}
Assert-True (-not $still) "Expected visitorId removed from /ops/followups after FOLLOWUP_OUTCOME_RECORDED"

Write-Host ("Followups lifecycle OK (requestId={0})" -f $rid0)
exit 0
