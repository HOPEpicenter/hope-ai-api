import assert from "node:assert/strict";
import { getCoachingForMember } from "../../src/domain/formation/formation.coaching";
import type { FormationRecommendation } from "../../src/domain/formation/formation.intelligence";
import type { FormationMilestones } from "../../src/domain/formation/formation.milestones";
import type { FormationProfile } from "../../src/domain/formation/formationProfile.projection";
import type { FormationTimelineItem } from "../../src/domain/formation/formation.timeline";
import type { FormationInsights } from "../../src/services/intelligence/pastoralInsightsEngine";

test("builds formation coaching guidance", () => {

  const profile: FormationProfile = {
    memberId: "member-coaching",
    activePathway: {
      pathwayId: "pathway-1",
      pathwayType: "new-believer",
      startedAt: "2026-09-01T00:00:00.000Z",
      completedAt: null,
      currentStepId: "group",
      status: "stalled",
      steps: []
    },
    history: [],
    stalledSteps: [{ stepId: "group", stalledSince: "2026-09-03T00:00:00.000Z" }],
    lastUpdatedAt: "2026-09-03T00:00:00.000Z"
  };

  const milestones: FormationMilestones = {
    pathwayStarted: [],
    firstStepCompleted: [],
    stalledStepDetected: [],
    pathwayCompleted: [],
    fastestStepCompletion: null,
    longestStepCompletion: null,
    totalStepsCompleted: 2,
    totalStalls: 2,
    totalPathwaysCompleted: 1
  };

  const insights: FormationInsights = {
    memberId: profile.memberId,
    stalledSteps: profile.stalledSteps,
    slowProgress: { detected: false, daysInActivePathway: 2 },
    repeatedStalls: { detected: true, count: 2 },
    longGapsBetweenSteps: {
      detected: true,
      gaps: [{ fromStepId: "welcome", toStepId: "group", days: 20 }]
    },
    pathwayCompletionVelocity: {
      completedPathwayCount: 1,
      averageDays: 10,
      latestDays: 10
    }
  };

  const recommendation: FormationRecommendation = {
    action: "address_stalled_step",
    pathwayType: "new-believer",
    stepId: "group",
    reason: "Address the stalled group step before advancing the pathway."
  };

  const timeline: FormationTimelineItem[] = [{
    occurredAt: "2026-09-03T00:00:00.000Z",
    type: "PathwayCompleted",
    pathwayId: "prior-pathway"
  }];

  const coaching = getCoachingForMember(profile, timeline, milestones, insights, recommendation);

  assert.equal(coaching.coachingPriority, "high");
  assert.ok(coaching.concerns.some((concern) => concern.includes("stalled formation step")));
  assert.ok(coaching.concerns.some((concern) => concern.includes("long gap")));
  assert.ok(coaching.concerns.some((concern) => concern.includes("repeated stalls")));
  assert.ok(coaching.encouragement.some((message) => message.includes("recently completed")));
  assert.ok(coaching.encouragement.some((message) => message.includes("strong pace")));
  assert.equal(coaching.recommendedNextStep, recommendation.reason);
  assert.equal(coaching.formationSummary, "2 step(s) completed, 2 stall(s) detected, and 1 pathway(s) completed.");

  const mediumPriority = getCoachingForMember(
    { ...profile, stalledSteps: [] },
    [],
    milestones,
    { ...insights, repeatedStalls: { detected: false, count: 0 }, longGapsBetweenSteps: insights.longGapsBetweenSteps },
    recommendation
  );
  assert.equal(mediumPriority.coachingPriority, "medium");
});
