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
assert(result.items[0].careSortScore === 210, "careSortScore should be 210");
assert(result.items[0].assignmentState === "assigned", "assignmentState should be assigned");
assert(result.items[0].assignmentBucket === "owned", "assignmentBucket should be owned");

const urgentOnly = readCareCandidateList({
  profiles: [
    {
      visitorId: "aging-care",
      assignedTo: "ops-user-1",
      lastFollowupOutcome: "needs_care",
      lastFollowupOutcomeAt: "2026-06-02T18:00:00.000Z",
      now: new Date("2026-06-05T18:00:00.000Z")
    },
    {
      visitorId: "stale-care",
      assignedTo: "ops-user-2",
      lastFollowupOutcome: "needs_care",
      lastFollowupOutcomeAt: "2026-06-02T18:00:00.000Z",
      now: new Date("2026-06-10T18:00:00.000Z")
    }
  ],
  carePriority: "urgent"
});

assert(urgentOnly.count === 1, "urgent filter should return one candidate");
assert(urgentOnly.items[0].visitorId === "stale-care", "urgent filter should return stale candidate");

const staleOnly = readCareCandidateList({
  profiles: [
    {
      visitorId: "aging-care",
      assignedTo: "ops-user-1",
      lastFollowupOutcome: "needs_care",
      lastFollowupOutcomeAt: "2026-06-02T18:00:00.000Z",
      now: new Date("2026-06-05T18:00:00.000Z")
    },
    {
      visitorId: "stale-care",
      assignedTo: "ops-user-2",
      lastFollowupOutcome: "needs_care",
      lastFollowupOutcomeAt: "2026-06-02T18:00:00.000Z",
      now: new Date("2026-06-10T18:00:00.000Z")
    }
  ],
  careAgeBucket: "stale"
});

assert(staleOnly.count === 1, "stale filter should return one candidate");
assert(staleOnly.items[0].visitorId === "stale-care", "stale filter should return stale candidate");

const escalatedOnly = readCareCandidateList({
  profiles: [
    {
      visitorId: "aging-care",
      assignedTo: "ops-user-1",
      lastFollowupOutcome: "needs_care",
      lastFollowupOutcomeAt: "2026-06-02T18:00:00.000Z",
      now: new Date("2026-06-05T18:00:00.000Z")
    },
    {
      visitorId: "stale-care",
      assignedTo: "ops-user-2",
      lastFollowupOutcome: "needs_care",
      lastFollowupOutcomeAt: "2026-06-02T18:00:00.000Z",
      now: new Date("2026-06-10T18:00:00.000Z")
    }
  ],
  escalationLevel: "escalate"
});

assert(escalatedOnly.count === 1, "escalation filter should return one candidate");
assert(escalatedOnly.items[0].visitorId === "stale-care", "escalation filter should return stale candidate");
assert(result.summary.totalCandidates === 1, "summary totalCandidates should be 1");
assert(result.summary.filteredCount === 1, "summary filteredCount should be 1");
assert(result.summary.urgentCount === 0, "summary urgentCount should be 0");
assert(result.summary.staleCount === 0, "summary staleCount should be 0");
assert(result.summary.escalationCount === 0, "summary escalationCount should be 0");
assert(result.summary.byPriority.normal === 0, "normal priority count should be 0");
assert(result.summary.byPriority.elevated === 1, "elevated priority count should be 1");
assert(result.summary.byPriority.urgent === 0, "urgent priority count should be 0");

assert(result.summary.byAgeBucket.new === 0, "new bucket count should be 0");
assert(result.summary.byAgeBucket.aging === 1, "aging bucket count should be 1");
assert(result.summary.byAgeBucket.stale === 0, "stale bucket count should be 0");

assert(result.summary.byEscalationLevel.none === 0, "none escalation count should be 0");
assert(result.summary.byEscalationLevel.review === 1, "review escalation count should be 1");
assert(result.summary.byEscalationLevel.escalate === 0, "escalate count should be 0");

assert(result.summary.byAssignmentState.assigned === 1, "assigned count should be 1");
assert(result.summary.byAssignmentState.unassigned === 0, "unassigned count should be 0");

assert(result.summary.byAssignmentBucket.owned === 1, "owned count should be 1");
assert(result.summary.byAssignmentBucket.queue === 0, "queue count should be 0");

assert(result.summary.assignedCount === 1, "assignedCount should be 1");
assert(result.summary.unassignedCount === 0, "unassignedCount should be 0");

assert(result.summary.ownedCount === 1, "ownedCount should be 1");
assert(result.summary.queueCount === 0, "queueCount should be 0");
const assignedOnly = readCareCandidateList({
  profiles: [
    {
      visitorId: "assigned-care",
      assignedTo: "ops-user-1",
      lastFollowupOutcome: "needs_care",
      lastFollowupOutcomeAt: "2026-06-02T18:00:00.000Z"
    },
    {
      visitorId: "queue-care",
      assignedTo: null,
      lastFollowupOutcome: "needs_care",
      lastFollowupOutcomeAt: "2026-06-02T18:00:00.000Z"
    }
  ],
  assignmentState: "assigned"
});

assert(assignedOnly.count === 1, "assignmentState filter should return one candidate");
assert(assignedOnly.items[0].visitorId === "assigned-care", "assignmentState filter should return assigned candidate");

const queueOnly = readCareCandidateList({
  profiles: [
    {
      visitorId: "assigned-care",
      assignedTo: "ops-user-1",
      lastFollowupOutcome: "needs_care",
      lastFollowupOutcomeAt: "2026-06-02T18:00:00.000Z"
    },
    {
      visitorId: "queue-care",
      assignedTo: null,
      lastFollowupOutcome: "needs_care",
      lastFollowupOutcomeAt: "2026-06-02T18:00:00.000Z"
    }
  ],
  assignmentBucket: "queue"
});

assert(queueOnly.count === 1, "assignmentBucket filter should return one candidate");
assert(queueOnly.items[0].visitorId === "queue-care", "assignmentBucket filter should return queue candidate");
console.log("OK: care queue read service contract passed.");
"@

node -e $nodeScript $modulePath
