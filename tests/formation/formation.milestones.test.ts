import assert from "node:assert/strict";
import { buildFormationMilestones } from "../../src/domain/formation/formation.milestones";
import type { FormationTimelineItem } from "../../src/domain/formation/formation.timeline";

test("builds formation milestones", () => {

  const timeline: FormationTimelineItem[] = [
    { occurredAt: "2026-09-01T00:00:00.000Z", type: "PathwayStarted", pathwayId: "pathway-1" },
    { occurredAt: "2026-09-02T00:00:00.000Z", type: "StepCompleted", pathwayId: "pathway-1", stepId: "welcome" },
    { occurredAt: "2026-09-05T00:00:00.000Z", type: "StepCompleted", pathwayId: "pathway-1", stepId: "group" },
    { occurredAt: "2026-09-06T00:00:00.000Z", type: "StepStalledDetected", pathwayId: "pathway-1", stepId: "serve" },
    { occurredAt: "2026-09-07T00:00:00.000Z", type: "PathwayCompleted", pathwayId: "pathway-1" }
  ];

  const milestones = buildFormationMilestones(timeline);

  assert.deepEqual(milestones.pathwayStarted, [timeline[0]]);
  assert.deepEqual(milestones.firstStepCompleted, [timeline[1]]);
  assert.deepEqual(milestones.stalledStepDetected, [timeline[3]]);
  assert.deepEqual(milestones.pathwayCompleted, [timeline[4]]);
  assert.deepEqual(milestones.fastestStepCompletion, { ...timeline[1], durationDays: 1 });
  assert.deepEqual(milestones.longestStepCompletion, { ...timeline[2], durationDays: 3 });
  assert.equal(milestones.totalStepsCompleted, 2);
  assert.equal(milestones.totalStalls, 1);
  assert.equal(milestones.totalPathwaysCompleted, 1);
});
