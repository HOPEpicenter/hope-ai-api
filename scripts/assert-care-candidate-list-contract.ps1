$ErrorActionPreference = "Stop"

$modulePath = Join-Path $PSScriptRoot "..\dist\services\care\buildCareCandidateList.js"

if (-not (Test-Path $modulePath)) {
  throw "Missing compiled buildCareCandidateList module. Run npm run build first."
}

$nodeScript = @"
const mod = require(process.argv[1]);
const buildCareCandidateList = mod.buildCareCandidateList;

function assert(condition, message) {
  if (!condition) {
    throw new Error("ASSERT FAILED: " + message);
  }
}

console.log("Running care candidate list contract...");

const result = buildCareCandidateList({
  profiles: [
    {
      visitorId: "visitor-connected",
      assignedTo: "ops-user-1",
      lastFollowupOutcome: "connected",
      lastFollowupOutcomeAt: "2026-06-02T16:00:00.000Z"
    },
    {
      visitorId: "visitor-care-old",
      assignedTo: "ops-user-2",
      lastFollowupOutcome: "needs_care",
      lastFollowupOutcomeAt: "2026-06-02T15:00:00.000Z",
      now: new Date("2026-06-10T15:00:00.000Z")
    },
    {
      visitorId: "visitor-care-new",
      assignedTo: "ops-user-1",
      lastFollowupOutcome: "needs_care",
      lastFollowupOutcomeAt: "2026-06-02T17:00:00.000Z",
      now: new Date("2026-06-05T17:00:00.000Z")
    },
    {
      visitorId: "visitor-left-message",
      assignedTo: "ops-user-1",
      lastFollowupOutcome: "left_message",
      lastFollowupOutcomeAt: "2026-06-02T18:00:00.000Z"
    }
  ]
});

assert(result.ok === true, "result ok should be true");
assert(result.count === 2, "only needs_care profiles should produce candidates");
assert(result.items.length === 2, "items length should match count");
assert(result.items[0].visitorId === "visitor-care-old", "higher score candidate should sort first");
assert(result.items[1].visitorId === "visitor-care-new", "lower score candidate should sort second");
assert(result.items[0].assignedTo === "ops-user-2", "assigned owner should be preserved");
assert(result.items[0].assignmentState === "assigned", "assignmentState should be assigned");
assert(result.items[0].assignmentBucket === "owned", "assignmentBucket should be owned");
assert(result.items[0].source.workflowId === "care", "workflowId should be care");
assert(result.items[0].carePriority === "urgent", "carePriority should be urgent");
assert(result.items[0].careAgeBucket === "stale", "careAgeBucket should be stale");
assert(result.items[0].escalationLevel === "escalate", "escalationLevel should escalate");
assert(result.items[0].recommendedCareAction === "escalation_review", "recommendedCareAction should escalate review");
assert(result.items[0].careSortScore === 310, "careSortScore should be 310");

const tieResult = buildCareCandidateList({
  profiles: [
    {
      visitorId: "visitor-b",
      assignedTo: null,
      lastFollowupOutcome: "needs_care",
      lastFollowupOutcomeAt: "2026-06-02T17:00:00.000Z",
      now: new Date("2026-06-05T17:00:00.000Z")
    },
    {
      visitorId: "visitor-a",
      assignedTo: null,
      lastFollowupOutcome: "needs_care",
      lastFollowupOutcomeAt: "2026-06-02T17:00:00.000Z",
      now: new Date("2026-06-05T17:00:00.000Z")
    }
  ]
});

assert(tieResult.items[0].visitorId === "visitor-a", "visitorId should tie-break ascending");
assert(tieResult.items[1].visitorId === "visitor-b", "visitorId should tie-break ascending");
assert(tieResult.items[0].assignmentState === "unassigned", "unassigned candidate should be unassigned");
assert(tieResult.items[0].assignmentBucket === "queue", "unassigned candidate should be queue");

console.log("OK: care candidate list contract passed.");
"@

node -e $nodeScript $modulePath
