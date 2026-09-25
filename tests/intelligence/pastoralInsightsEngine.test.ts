import assert from "node:assert/strict";
import type { FormationEvent } from "../../src/contracts/formationEvent.v1";
import { FormationProfileIndex } from "../../src/domain/formation/formationProfile.index";
import { PastoralInsightsEngine } from "../../src/services/intelligence/pastoralInsightsEngine";

const memberId = "member-formation-insights";
const profileIndex = new FormationProfileIndex();

const started = (pathwayId: string, occurredAt: string): FormationEvent => ({
  eventId: `${pathwayId}-started`,
  occurredAt,
  source: "api",
  memberId,
  pathwayId,
  type: "PathwayStarted",
  payload: {
    pathwayType: "new-believer",
    startedAt: occurredAt,
    initialStepId: "welcome"
  }
});

profileIndex.replayEvents([
  started("completed-pathway", "2026-01-01T00:00:00.000Z"),
  {
    ...started("completed-pathway", "2026-01-11T00:00:00.000Z"),
    eventId: "completed-pathway-completed",
    type: "PathwayCompleted",
    payload: { completedAt: "2026-01-11T00:00:00.000Z", finalStepId: "commissioned" }
  },
  started("active-pathway", "2026-02-01T00:00:00.000Z"),
  {
    ...started("active-pathway", "2026-02-02T00:00:00.000Z"),
    eventId: "welcome-completed",
    type: "StepCompleted",
    payload: { stepId: "welcome", completedAt: "2026-02-02T00:00:00.000Z" }
  },
  {
    ...started("active-pathway", "2026-02-20T00:00:00.000Z"),
    eventId: "group-completed",
    type: "StepCompleted",
    payload: { stepId: "group", completedAt: "2026-02-20T00:00:00.000Z" }
  },
  {
    ...started("active-pathway", "2026-02-21T00:00:00.000Z"),
    eventId: "group-stalled",
    type: "StepStalledDetected",
    payload: { stepId: "group", stalledSince: "2026-02-21T00:00:00.000Z", reason: "No response" }
  },
  {
    ...started("active-pathway", "2026-02-22T00:00:00.000Z"),
    eventId: "serve-stalled",
    type: "StepStalledDetected",
    payload: { stepId: "serve", stalledSince: "2026-02-22T00:00:00.000Z", reason: "Scheduling" }
  }
]);

const engine = new PastoralInsightsEngine(profileIndex);
const insights = engine.getFormationInsights(memberId, {
  asOf: "2026-03-10T00:00:00.000Z"
});

assert.equal(insights.stalledSteps.length, 2);
assert.deepEqual(insights.slowProgress, { detected: true, daysInActivePathway: 37 });
assert.deepEqual(insights.repeatedStalls, { detected: true, count: 2 });
assert.deepEqual(insights.longGapsBetweenSteps, {
  detected: true,
  gaps: [{ fromStepId: "welcome", toStepId: "group", days: 18 }]
});
assert.deepEqual(insights.pathwayCompletionVelocity, {
  completedPathwayCount: 1,
  averageDays: 10,
  latestDays: 10
});
assert.deepEqual(
  engine.getAllFormationInsights({ asOf: "2026-03-10T00:00:00.000Z" }).map((item) => item.memberId),
  [memberId]
);

console.log("pastoralInsightsEngine.test.ts passed");