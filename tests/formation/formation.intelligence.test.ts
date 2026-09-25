import assert from "node:assert/strict";
import { FormationIntelligence } from "../../src/domain/formation/formation.intelligence";
import type { FormationProfile } from "../../src/domain/formation/formationProfile.projection";

test("builds formation intelligence recommendations", () => {

  const activePathway = {
    pathwayId: "pathway-active",
    pathwayType: "membership",
    startedAt: "2026-09-01T00:00:00.000Z",
    completedAt: null,
    currentStepId: "group",
    status: "stalled" as const,
    steps: [{
      stepId: "group",
      stalledSince: "2026-09-10T00:00:00.000Z",
      reason: "No response"
    }]
  };

  const profile: FormationProfile = {
    memberId: "member-intelligence",
    activePathway,
    stalledSteps: activePathway.steps,
    history: [
      {
        pathwayId: "completed-membership",
        pathwayType: "membership",
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-02-01T00:00:00.000Z",
        currentStepId: "commissioned",
        status: "completed",
        steps: []
      },
      {
        pathwayId: "completed-membership-2",
        pathwayType: "membership",
        startedAt: "2026-03-01T00:00:00.000Z",
        completedAt: "2026-04-01T00:00:00.000Z",
        currentStepId: "commissioned",
        status: "completed",
        steps: []
      }
    ],
    lastUpdatedAt: "2026-09-10T00:00:00.000Z"
  };

  const intelligence = new FormationIntelligence();
  const stalled = intelligence.analyze(profile);

  assert.deepEqual(stalled.completionPatterns, [{ pathwayType: "membership", completedCount: 2 }]);
  assert.deepEqual(stalled.recommendedNextStep, {
    action: "address_stalled_step",
    pathwayType: "membership",
    stepId: "group",
    reason: "Address the stalled group step: No response."
  });

  const continuing = intelligence.analyze({
    ...profile,
    activePathway: { ...activePathway, status: "in_progress", steps: [] },
    stalledSteps: []
  });
  assert.deepEqual(continuing.recommendedNextStep, {
    action: "continue_pathway",
    pathwayType: "membership",
    stepId: "group",
    reason: "Continue the membership pathway at group; this pathway type has 2 prior completion(s)."
  });

  const nextPathway = intelligence.analyze({
    ...profile,
    activePathway: null,
    stalledSteps: []
  });
  assert.deepEqual(nextPathway.recommendedNextStep, {
    action: "start_next_pathway",
    pathwayType: "membership",
    stepId: null,
    reason: "Discuss the next formation pathway after 2 completed membership pathway(s)."
  });
});
