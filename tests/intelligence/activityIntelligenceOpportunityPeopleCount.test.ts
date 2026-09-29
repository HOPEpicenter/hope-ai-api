import assert from "node:assert/strict";
import test from "node:test";

import { buildActivityIntelligence } from "../../src/services/intelligence/activityIntelligenceService";

test("deduplicates a person who qualifies for multiple opportunity segments", () => {
  const result = buildActivityIntelligence({
    careSummary: {
      totalCandidates: 0,
      urgentCount: 0,
      staleCount: 0,
      escalationCount: 0,
      assignedCount: 0,
      unassignedCount: 0,
      ownedCount: 0,
      queueCount: 0
    },
    followupStats: {
      total: 0,
      overdue: 0,
      atRisk: 0
    },
    formationProfiles: [
      {
        stage: "Connected",
        assignedTo: null,
        lastNextStepAt: null,
        lastNextStepCompletedAt: null,
        lastFollowupOutcome: null,
        lastFollowupOutcomeAt: null
      }
    ]
  });

  assert.equal(result.formation.cohorts.connectedWithoutNextStep, 1);
  assert.equal(result.formation.cohorts.connectedWithoutCareOwner, 1);

  assert.equal(
    result.formation.opportunities.items.find(
      (item) => item.key === "CONNECTED_WITHOUT_NEXT_STEP"
    )?.count,
    1
  );

  assert.equal(
    result.formation.opportunities.items.find(
      (item) => item.key === "CONNECTED_WITHOUT_CARE_OWNER"
    )?.count,
    1
  );

  assert.equal(result.formation.opportunities.uniquePeopleCount, 1);
});

console.log("activityIntelligenceOpportunityPeopleCount.test.ts passed");