import assert from "node:assert/strict";
import { generateFormationJourneyReport } from "../../src/domain/formation/formation.report";
import { buildFormationMilestones } from "../../src/domain/formation/formation.milestones";
import { createInitialFormationProfile } from "../../src/domain/formation/formationProfile.projection";
import type { FormationTimelineItem } from "../../src/domain/formation/formation.timeline";

test("generates formation journey report", () => {

  const memberId = "member-report";
  const timeline: FormationTimelineItem[] = [
    { occurredAt: "2026-09-01T00:00:00.000Z", type: "PathwayStarted", pathwayId: "pathway-1" },
    { occurredAt: "2026-09-02T00:00:00.000Z", type: "StepStalledDetected", pathwayId: "pathway-1", stepId: "group", reason: "No response" },
    { occurredAt: "2026-09-04T00:00:00.000Z", type: "StepCompleted", pathwayId: "pathway-1", stepId: "group" },
    { occurredAt: "2026-09-05T00:00:00.000Z", type: "PathwayCompleted", pathwayId: "pathway-1" }
  ];
  const milestones = buildFormationMilestones(timeline);

  const report = generateFormationJourneyReport({
    memberId,
    profile: createInitialFormationProfile(memberId),
    timeline,
    milestones,
    coaching: {
      memberId,
      encouragement: ["A formation pathway was recently completed; affirm the member's progress."],
      concerns: [],
      recommendedNextStep: "Discuss a new pathway.",
      formationSummary: "1 step(s) completed, 1 stall(s) detected, and 1 pathway(s) completed.",
      coachingPriority: "low"
    },
    analytics: {
      totalPathwaysStarted: 1,
      totalPathwaysCompleted: 1,
      averagePathwayDuration: 4,
      averageStepDuration: 3,
      mostCommonStalledStep: "group",
      mostCommonCompletedStep: "group",
      pathwayCompletionRate: 1,
      stallRate: 1,
      activePathwayCount: 0,
      stalledPathwayCount: 0,
      completedPathwayCount: 1
    }
  });

  assert.deepEqual(report.pathways, { started: 1, completed: 1 });
  assert.equal(report.stalls.total, 1);
  assert.deepEqual(report.stalls.recoveries, [{
    pathwayId: "pathway-1",
    stepId: "group",
    stalledAt: "2026-09-02T00:00:00.000Z",
    recoveredAt: "2026-09-04T00:00:00.000Z"
  }]);
  assert.equal(report.coaching.recommendedNextStep, "Discuss a new pathway.");
  assert.equal(report.analyticsHighlights.pathwayCompletionRate, 1);
});
