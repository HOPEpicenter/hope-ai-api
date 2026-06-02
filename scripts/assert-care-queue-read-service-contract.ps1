$ErrorActionPreference = "Stop"

$modulePath = Join-Path $PSScriptRoot "..\dist\services\care\readCareCandidateList.js"

if (-not (Test-Path $modulePath)) {
  throw "Missing compiled readCareCandidateList module. Run npm run build first."
}

$nodeScript = @"
const mod = require(process.argv[1]);
const readCareCandidateList = mod.readCareCandidateList;

function assert(condition, message) {
  if (!condition) {
    throw new Error("ASSERT FAILED: " + message);
  }
}

console.log("Running care queue read service contract...");

const result = readCareCandidateList({
  profiles: [
    {
      visitorId: "care-queue-1",
      assignedTo: "ops-user-1",
      lastFollowupOutcome: "needs_care",
      lastFollowupOutcomeAt: "2026-06-02T18:00:00.000Z",
      now: new Date("2026-06-05T18:00:00.000Z")
    },
    {
      visitorId: "care-queue-2",
      assignedTo: "ops-user-2",
      lastFollowupOutcome: "connected",
      lastFollowupOutcomeAt: "2026-06-02T19:00:00.000Z"
    }
  ]
});

assert(result.ok === true, "result ok should be true");
assert(result.count === 1, "only one care candidate should be returned");
assert(result.items.length === 1, "items length should match count");
assert(result.items[0].visitorId === "care-queue-1", "needs_care visitor should be returned");
assert(result.items[0].source.workflowId === "care", "workflowId should be care");
assert(result.items[0].carePriority === "elevated", "carePriority should be elevated");
assert(result.items[0].careAgeBucket === "aging", "careAgeBucket should be aging");
assert(result.items[0].escalationLevel === "review", "escalationLevel should be review");
assert(result.items[0].recommendedCareAction === "prioritize_review", "recommendedCareAction should prioritize review");

console.log("OK: care queue read service contract passed.");
"@

node -e $nodeScript $modulePath

