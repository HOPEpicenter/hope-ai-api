$ErrorActionPreference = "Stop"

$modulePath = Join-Path $PSScriptRoot "..\dist\services\care\deriveCareCandidate.js"

if (-not (Test-Path $modulePath)) {
  throw "Missing compiled deriveCareCandidate module. Run npm run build first."
}

$nodeScript = @"
const mod = require(process.argv[1]);
const deriveCareCandidate = mod.deriveCareCandidate;

function assert(condition, message) {
  if (!condition) {
    throw new Error("ASSERT FAILED: " + message);
  }
}

console.log("Running care candidate derivation contract...");

const needsCare = deriveCareCandidate({
  visitorId: "visitor-care-1",
  assignedTo: "ops-user-1",
  lastFollowupOutcome: "needs_care",
  lastFollowupOutcomeAt: "2026-06-02T16:00:00.000Z", now: new Date("2026-06-05T16:00:00.000Z")
});

assert(needsCare !== null, "needs_care should derive a care candidate");
assert(needsCare.visitorId === "visitor-care-1", "candidate visitorId should match");
assert(needsCare.status === "candidate", "candidate status should be candidate");
assert(needsCare.reason === "needs_care", "candidate reason should be needs_care");
assert(needsCare.assignedTo === "ops-user-1", "candidate assignedTo should match");
assert(needsCare.openedAt === "2026-06-02T16:00:00.000Z", "candidate openedAt should use outcome timestamp");
assert(needsCare.careLevel === "standard", "candidate careLevel should be standard");
assert(needsCare.careCategory === "followup_needs_care", "candidate careCategory should match");
assert(needsCare.careOpenedBy === "ops-user-1", "candidate careOpenedBy should match assigned owner");
assert(needsCare.daysOpen === 3, "candidate daysOpen should be deterministic");
assert(needsCare.source.workflowId === "care", "candidate workflowId should be care");
assert(needsCare.source.followupOutcome === "needs_care", "candidate source outcome should be needs_care");

const connected = deriveCareCandidate({
  visitorId: "visitor-care-2",
  assignedTo: "ops-user-1",
  lastFollowupOutcome: "connected",
  lastFollowupOutcomeAt: "2026-06-02T16:00:00.000Z", now: new Date("2026-06-05T16:00:00.000Z")
});

assert(connected === null, "connected should not derive a care candidate");

const closed = deriveCareCandidate({
  visitorId: "visitor-care-3",
  assignedTo: "ops-user-1",
  lastFollowupOutcome: "closed",
  lastFollowupOutcomeAt: "2026-06-02T16:00:00.000Z", now: new Date("2026-06-05T16:00:00.000Z")
});

assert(closed === null, "closed should not derive a care candidate");

const missingTimestamp = deriveCareCandidate({
  visitorId: "visitor-care-4",
  assignedTo: "ops-user-1",
  lastFollowupOutcome: "needs_care",
  lastFollowupOutcomeAt: null
});

assert(missingTimestamp === null, "needs_care without timestamp should not derive a care candidate");

console.log("OK: care candidate derivation contract passed.");
"@

node -e $nodeScript $modulePath
