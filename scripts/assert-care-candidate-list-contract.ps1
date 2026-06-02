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
      now: new Date("2026-06-05T15:00:00.000Z")
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
assert(result.items[0].visitorId === "visitor-care-new", "newer care candidate should sort first");
assert(result.items[1].visitorId === "visitor-care-old", "older care candidate should sort second");
assert(result.items[0].assignedTo === "ops-user-1", "assigned owner should be preserved");
assert(result.items[0].source.workflowId === "care", "workflowId should be care");
assert(result.items[0].carePriority === "elevated", "carePriority should be elevated");
assert(result.items[0].careAgeBucket === "aging", "careAgeBucket should be aging");
assert(result.items[0].escalationLevel === "review", "escalationLevel should be review");
assert(result.items[0].recommendedCareAction === "review_followup", "recommendedCareAction should match");

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

console.log("OK: care candidate list contract passed.");
"@

node -e $nodeScript $modulePath

