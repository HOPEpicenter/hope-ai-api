import assert from "node:assert/strict";
import {
  buildOpportunityWorklistItem,
  getOpportunitySegmentDefinition,
  OPPORTUNITY_SEGMENTS
} from "../../src/services/intelligence/opportunitySegments";

assert.strictEqual(OPPORTUNITY_SEGMENTS.length, 4);

const connectedWithoutNextStep = getOpportunitySegmentDefinition("connected-without-next-step");
assert.ok(connectedWithoutNextStep);
assert.strictEqual(connectedWithoutNextStep.label, "Connected people without next step");
assert.strictEqual(connectedWithoutNextStep.recommendedActionLabel, "Select next step");
assert.strictEqual(
  connectedWithoutNextStep.recommendedActionReason,
  "Connected profile has engagement activity but no next-step milestone."
);
assert.strictEqual(connectedWithoutNextStep.resolutionField, "lastNextStepAt");
assert.strictEqual(
  connectedWithoutNextStep.resolutionReason,
  "Opportunity closes when a next-step milestone is recorded."
);

const missing = getOpportunitySegmentDefinition("not-a-real-segment");
assert.strictEqual(missing, null);

const item = buildOpportunityWorklistItem({
  definition: connectedWithoutNextStep,
  profile: {
    visitorId: "visitor-1",
    displayName: "Profile Name",
    stage: "Connected",
    assignedTo: "ops-user-1",
    lastEventType: "FOLLOWUP_ASSIGNED",
    lastEventAt: "2026-01-01T00:00:00.000Z",
    lastFollowupOutcome: "connected",
    lastFollowupOutcomeAt: "2026-01-02T00:00:00.000Z",
    lastNextStepAt: null,
    lastNextStepCompletedAt: null
  },
  visitor: {
    name: "Visitor Name"
  }
});

assert.deepStrictEqual(item, {
  visitorId: "visitor-1",
  displayName: "Profile Name",
  stage: "Connected",
  assignedTo: "ops-user-1",
  lastEventType: "FOLLOWUP_ASSIGNED",
  lastEventAt: "2026-01-01T00:00:00.000Z",
  lastFollowupOutcome: "connected",
  lastFollowupOutcomeAt: "2026-01-02T00:00:00.000Z",
  lastNextStepAt: null,
  lastNextStepCompletedAt: null,
  recommendedAction: {
    label: "Select next step",
    reason: "Connected profile has engagement activity but no next-step milestone."
  },
  resolution: {
    status: "open",
    resolvedWhen: "lastNextStepAt",
    reason: "Opportunity closes when a next-step milestone is recorded."
  },
  href: "/visitors/visitor-1"
});

console.log("opportunityWorklist.test.ts passed");


