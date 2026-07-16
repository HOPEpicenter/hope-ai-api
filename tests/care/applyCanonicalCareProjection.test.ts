import assert from "node:assert/strict";
import {
  applyCanonicalCareProjection
} from "../../src/services/care/applyCanonicalCareProjection";

const result = applyCanonicalCareProjection(
  {
    visitorId: "visitor-daniel",
    status: "candidate",
    reason: "needs_care",
    careLevel: "standard",
    careCategory: "followup_needs_care",
    carePriority: "normal",
    careAgeBucket: "new",
    escalationLevel: "none",
    recommendedCareAction: "review_followup",
    careSortScore: 110,
    openedAt: "2026-07-14T12:03:00.000Z",
    careOpenedBy: "staff-jessie",
    assignedTo: "staff-jessie",
    assignmentState: "assigned",
    assignmentBucket: "owned",
    daysOpen: 1,
    source: {
      workflowId: "care",
      followupOutcome: "needs_care",
      followupOutcomeAt:
        "2026-07-14T12:03:00.000Z"
    }
  },
  {
    visitorId: "visitor-daniel",
    lastActivityAt: "2026-07-14T12:03:00.000Z",
    lastActivitySummary: "Care ownership assigned",
    stage: "Guest",
    stageReason: "event:FOLLOWUP_ASSIGNED",
    stageUpdatedAt: "2026-07-14T12:03:00.000Z",
    stageUpdatedBy: "system",
    lastNextStepAt: null,
    lastNextStepCompletedAt: null,
    lastFollowupAssignedAt:
      "2026-07-14T12:03:00.000Z",
    lastFollowupOutcome: "needs_care",
    lastFollowupOutcomeAt:
      "2026-07-14T12:03:00.000Z",
    lastPrayerRequestedAt: null,
    followupStatus: "action_needed",
    assignedTo: "staff-jessie",
    assignedToName: "Jessie Blair-Myrie",
    attentionState: "needs_attention",
    followupUrgency: "AT_RISK",
    followupOverdue: false,
    riskLevel: "high",
    riskScore: 100,
    needsFollowup: true,
    recommendedAction:
      "Immediate pastoral followup recommended",
    priorityBand: "urgent",
    priorityScore: 100,
    priorityReason: "high_risk_needs_followup"
  }
);

assert.equal(result.carePriority, "urgent");
assert.equal(
  result.canonicalPriorityBand,
  "urgent"
);
assert.equal(
  result.canonicalPriorityScore,
  100
);
assert.equal(
  result.canonicalRecommendedAction,
  "Immediate pastoral followup recommended"
);
assert.equal(
  result.assignedToName,
  "Jessie Blair-Myrie"
);
assert.equal(result.stage, "Guest");

// Existing operational queue semantics remain intact.
assert.equal(result.careAgeBucket, "new");
assert.equal(result.escalationLevel, "none");
assert.equal(result.assignmentState, "assigned");
assert.equal(result.assignmentBucket, "owned");

console.log(
  "applyCanonicalCareProjection.test.ts passed"
);
