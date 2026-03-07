$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Assert($cond, [string]$msg) {
  if (-not $cond) { throw $msg }
}

$modulePath = Join-Path $PSScriptRoot '..\dist\domain\integration\deriveIntegrationSummary.v1.js'
$modulePath = [System.IO.Path]::GetFullPath($modulePath)

$js = @"
const mod = require(process.argv[1]);
const derive = mod.deriveIntegrationSummaryV1;

const cases = {
  baseline: derive({
    visitorId: "visitor-1",
    lastEngagementAt: null,
    lastFormationAt: null,
    assignedToUserId: null
  }),
  assigned: derive({
    visitorId: "visitor-2",
    lastEngagementAt: null,
    lastFormationAt: "2026-01-01T00:00:00.000Z",
    assignedToUserId: "ops-user-1"
  }),
  explicitWorkflow: derive({
    visitorId: "visitor-3",
    lastEngagementAt: "2026-01-02T00:00:00.000Z",
    lastFormationAt: null,
    assignedToUserId: null,
    workflows: [{ workflowId: "custom-flow", displayName: "Custom Flow" }]
  }),
  explicitRefs: derive({
    visitorId: "visitor-4",
    lastEngagementAt: "2026-01-03T00:00:00.000Z",
    lastFormationAt: null,
    assignedToUserId: null,
    groups: [{ groupId: "group-1", displayName: "Group One" }],
    programs: [{ programId: "program-1", displayName: "Program One" }]
  })
};

process.stdout.write(JSON.stringify(cases));
"@

$json = node -e $js $modulePath
if ($LASTEXITCODE -ne 0) { throw "Node deriveIntegrationSummaryV1 check failed ($LASTEXITCODE)" }

$cases = $json | ConvertFrom-Json

Assert ($cases.baseline.needsFollowup -eq $true) "baseline needsFollowup should be true"
Assert ($cases.baseline.followupReason -eq "no_engagement_yet") "baseline followupReason should be no_engagement_yet"
Assert ($cases.baseline.workflows[0].workflowId -eq "followup") "baseline workflow should derive to followup"

Assert ($cases.assigned.assignedTo.ownerId -eq "ops-user-1") "assigned case should keep assignedTo.ownerId"
Assert ($cases.assigned.followupReason -eq "FOLLOWUP_ASSIGNED") "assigned case followupReason should be FOLLOWUP_ASSIGNED"
Assert ($cases.assigned.workflows[0].workflowId -eq "followup") "assigned case workflow should derive to followup"

Assert ($cases.explicitWorkflow.workflows[0].workflowId -eq "custom-flow") "explicit workflow should override derived fallback"

Assert ($cases.explicitRefs.groups[0].groupId -eq "group-1") "group ref should normalize"
Assert ($cases.explicitRefs.programs[0].programId -eq "program-1") "program ref should normalize"

Write-Host "OK: integration summary derivation assertions passed." -ForegroundColor Green