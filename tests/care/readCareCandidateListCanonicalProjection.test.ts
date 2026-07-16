import assert from "node:assert/strict";
import {
  readCareCandidateList
} from "../../src/services/care/readCareCandidateList";
import type {
  CanonicalVisitorDashboardCard
} from "../../src/services/dashboard/canonicalDashboardContracts";

const card: CanonicalVisitorDashboardCard = {
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
};

const result = readCareCandidateList({
  profiles: [
    {
      visitorId: "visitor-daniel",
      assignedTo: "staff-jessie",
      lastFollowupOutcome: "needs_care",
      lastFollowupOutcomeAt:
        "2026-07-14T12:03:00.000Z",
      now: new Date("2026-07-15T12:03:00.000Z")
    }
  ],
  canonicalCardsByVisitorId: new Map([
    ["visitor-daniel", card]
  ])
});

assert.equal(result.count, 1);
assert.equal(result.items[0].carePriority, "urgent");
assert.equal(result.summary.urgentCount, 1);
assert.equal(result.summary.byPriority.urgent, 1);

// Existing operational queue semantics remain intact.
assert.equal(result.items[0].careAgeBucket, "new");
assert.equal(result.items[0].escalationLevel, "none");
assert.equal(result.items[0].assignmentState, "assigned");
assert.equal(result.items[0].assignmentBucket, "owned");

const urgentOnly = readCareCandidateList({
  profiles: [
    {
      visitorId: "visitor-daniel",
      assignedTo: "staff-jessie",
      lastFollowupOutcome: "needs_care",
      lastFollowupOutcomeAt:
        "2026-07-14T12:03:00.000Z",
      now: new Date("2026-07-15T12:03:00.000Z")
    }
  ],
  canonicalCardsByVisitorId: new Map([
    ["visitor-daniel", card]
  ]),
  carePriority: "urgent"
});

assert.equal(urgentOnly.count, 1);

console.log(
  "readCareCandidateListCanonicalProjection.test.ts passed"
);
