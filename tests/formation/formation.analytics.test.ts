import assert from "node:assert/strict";
import { buildFormationAnalytics } from "../../src/domain/formation/formation.analytics";
import { buildFormationMilestones } from "../../src/domain/formation/formation.milestones";
import type { FormationProfile } from "../../src/domain/formation/formationProfile.projection";
import type { FormationTimelineCollection } from "../../src/domain/formation/formation.timeline";

test("builds formation analytics", () => {

  const timelines: FormationTimelineCollection[] = [
    {
      memberId: "member-a",
      items: [
        { occurredAt: "2026-09-01T00:00:00.000Z", type: "PathwayStarted", pathwayId: "pathway-a" },
        { occurredAt: "2026-09-03T00:00:00.000Z", type: "StepCompleted", pathwayId: "pathway-a", stepId: "welcome" },
        { occurredAt: "2026-09-05T00:00:00.000Z", type: "StepCompleted", pathwayId: "pathway-a", stepId: "group" },
        { occurredAt: "2026-09-06T00:00:00.000Z", type: "StepStalledDetected", pathwayId: "pathway-a", stepId: "group" },
        { occurredAt: "2026-09-11T00:00:00.000Z", type: "PathwayCompleted", pathwayId: "pathway-a" }
      ]
    },
    {
      memberId: "member-b",
      items: [
        { occurredAt: "2026-09-01T00:00:00.000Z", type: "PathwayStarted", pathwayId: "pathway-b" },
        { occurredAt: "2026-09-02T00:00:00.000Z", type: "StepStalledDetected", pathwayId: "pathway-b", stepId: "welcome" }
      ]
    },
    {
      memberId: "member-c",
      items: [
        { occurredAt: "2026-09-01T00:00:00.000Z", type: "PathwayStarted", pathwayId: "pathway-c" },
        { occurredAt: "2026-09-02T00:00:00.000Z", type: "StepCompleted", pathwayId: "pathway-c", stepId: "welcome" },
        { occurredAt: "2026-09-03T00:00:00.000Z", type: "PathwayCompleted", pathwayId: "pathway-c" }
      ]
    }
  ];

  const profiles: FormationProfile[] = [
    {
      memberId: "member-a",
      activePathway: { pathwayId: "active-a", pathwayType: "new-believer", startedAt: "2026-09-12T00:00:00.000Z", completedAt: null, currentStepId: "serve", status: "in_progress", steps: [] },
      history: [{ pathwayId: "pathway-a", pathwayType: "new-believer", startedAt: "2026-09-01T00:00:00.000Z", completedAt: "2026-09-11T00:00:00.000Z", currentStepId: "complete", status: "completed", steps: [] }],
      stalledSteps: [],
      lastUpdatedAt: null
    },
    {
      memberId: "member-b",
      activePathway: { pathwayId: "pathway-b", pathwayType: "membership", startedAt: "2026-09-01T00:00:00.000Z", completedAt: null, currentStepId: "welcome", status: "stalled", steps: [] },
      history: [],
      stalledSteps: [],
      lastUpdatedAt: null
    },
    {
      memberId: "member-c",
      activePathway: null,
      history: [{ pathwayId: "pathway-c", pathwayType: "membership", startedAt: "2026-09-01T00:00:00.000Z", completedAt: "2026-09-03T00:00:00.000Z", currentStepId: "complete", status: "completed", steps: [] }],
      stalledSteps: [],
      lastUpdatedAt: null
    }
  ];

  const milestones = timelines.map((timeline) => ({
    memberId: timeline.memberId,
    milestones: buildFormationMilestones(timeline.items)
  }));

  assert.deepEqual(buildFormationAnalytics({ profiles, timelines, milestones }), {
    totalPathwaysStarted: 3,
    totalPathwaysCompleted: 2,
    averagePathwayDuration: 6,
    averageStepDuration: 1.67,
    mostCommonStalledStep: "group",
    mostCommonCompletedStep: "welcome",
    pathwayCompletionRate: 2 / 3,
    stallRate: 2 / 3,
    activePathwayCount: 1,
    stalledPathwayCount: 1,
    completedPathwayCount: 2
  });
});
