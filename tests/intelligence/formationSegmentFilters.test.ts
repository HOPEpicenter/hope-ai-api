import assert from "node:assert/strict";
import { buildActivityIntelligence } from "../../src/services/intelligence/activityIntelligenceService";

const baseCare = {
  totalCandidates: 0,
  urgentCount: 0,
  staleCount: 0,
  escalationCount: 0,
  assignedCount: 0,
  unassignedCount: 0,
  ownedCount: 0,
  queueCount: 0
};

const baseFollowups = {
  total: 0,
  resolved: 0,
  escalated: 0,
  overdue: 0,
  atRisk: 0,
  onTrack: 0
};

const result = buildActivityIntelligence({
  careSummary: baseCare,
  followupStats: baseFollowups,
  formationProfiles: [
    { stage: "Connected" },
    { stage: "Connected", lastNextStepAt: "2026-01-01T00:00:00.000Z" },
    {
      stage: "Connected",
      assignedTo: "ops-user-1",
      lastFollowupOutcomeAt: null
    },
    {
      stage: "Connected",
      assignedTo: null
    }
  ],
  generatedAt: "2026-01-01T00:00:00.000Z"
});

assert.strictEqual(result.formation.cohorts.connectedWithoutNextStep, 3);
assert.strictEqual(result.formation.cohorts.nextStepSelectedNotCompleted, 1);
assert.strictEqual(result.formation.cohorts.activeCareWithoutOutcome, 1);
assert.strictEqual(result.formation.cohorts.connectedWithoutCareOwner, 3);

assert.strictEqual(result.formation.opportunities.highestPriority?.key, "CONNECTED_WITHOUT_NEXT_STEP");
assert.strictEqual(result.formation.opportunities.highestPriority?.drilldown.href, "/formation-profiles?segment=connected-without-next-step");

console.log("formationSegmentFilters.test.ts passed");

