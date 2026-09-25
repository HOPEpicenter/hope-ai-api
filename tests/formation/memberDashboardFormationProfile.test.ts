import assert from "node:assert/strict";
import { toFormationProfileEvent } from "../../src/routes/visitors/createGetVisitorFormationProfileAdapter";
import { FormationProfileIndex } from "../../src/domain/formation/formationProfile.index";

const memberId = "member-dashboard";
const started = toFormationProfileEvent({
  id: "event-started",
  type: "PathwayStarted",
  occurredAt: "2026-09-01T09:00:00.000Z",
  metadata: JSON.stringify({
    pathwayId: "pathway-1",
    pathwayType: "new-believer",
    startedAt: "2026-09-01T09:00:00.000Z",
    initialStepId: "welcome"
  })
}, memberId);
const stalled = toFormationProfileEvent({
  id: "event-stalled",
  type: "StepStalledDetected",
  occurredAt: "2026-09-03T09:00:00.000Z",
  metadata: JSON.stringify({
    pathwayId: "pathway-1",
    stepId: "group",
    stalledSince: "2026-09-02T09:00:00.000Z",
    reason: "No response"
  })
}, memberId);

assert.ok(started);
assert.ok(stalled);

const profiles = new FormationProfileIndex();
profiles.replayEvents([started, stalled]);

assert.deepEqual(profiles.getProfile(memberId), {
  memberId,
  activePathway: {
    pathwayId: "pathway-1",
    pathwayType: "new-believer",
    startedAt: "2026-09-01T09:00:00.000Z",
    completedAt: null,
    currentStepId: "welcome",
    status: "stalled",
    steps: [{
      stepId: "group",
      stalledSince: "2026-09-02T09:00:00.000Z",
      reason: "No response"
    }]
  },
  history: [],
  stalledSteps: [{
    stepId: "group",
    stalledSince: "2026-09-02T09:00:00.000Z",
    reason: "No response"
  }],
  lastUpdatedAt: "2026-09-03T09:00:00.000Z"
});

assert.equal(toFormationProfileEvent({ type: "NEXT_STEP_SELECTED" }, memberId), null);

console.log("memberDashboardFormationProfile.test.ts passed");