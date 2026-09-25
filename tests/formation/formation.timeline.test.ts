import assert from "node:assert/strict";
import type { FormationEvent } from "../../src/contracts/formationEvent.v1";
import { buildFormationTimeline } from "../../src/domain/formation/formation.timeline";
import { createInitialFormationProfile } from "../../src/domain/formation/formationProfile.projection";

test("builds formation timeline", () => {

  const memberId = "member-timeline";
  const pathwayId = "pathway-timeline";
  const started: FormationEvent = {
    eventId: "started",
    occurredAt: "2026-09-01T00:00:00.000Z",
    source: "api",
    memberId,
    pathwayId,
    type: "PathwayStarted",
    payload: {
      pathwayType: "new-believer",
      startedAt: "2026-09-01T00:00:00.000Z",
      initialStepId: "welcome"
    }
  };

  const timeline = buildFormationTimeline(createInitialFormationProfile(memberId), [
    {
      ...started,
      eventId: "completed",
      occurredAt: "2026-09-04T00:00:00.000Z",
      type: "PathwayCompleted",
      payload: { completedAt: "2026-09-04T00:00:00.000Z", finalStepId: "commissioned" }
    },
    {
      ...started,
      eventId: "stalled",
      occurredAt: "2026-09-03T00:00:00.000Z",
      type: "StepStalledDetected",
      payload: { stepId: "group", stalledSince: "2026-09-02T00:00:00.000Z", reason: "No response" }
    },
    started,
    {
      ...started,
      eventId: "step-completed",
      occurredAt: "2026-09-02T00:00:00.000Z",
      type: "StepCompleted",
      payload: { stepId: "welcome", completedAt: "2026-09-02T00:00:00.000Z", notes: "Connected" }
    },
    {
      ...started,
      eventId: "other-member",
      memberId: "other-member"
    }
  ]);

  assert.deepEqual(timeline, [
    {
      occurredAt: "2026-09-01T00:00:00.000Z",
      type: "PathwayStarted",
      pathwayId,
      stepId: "welcome",
      statusChange: "in_progress"
    },
    {
      occurredAt: "2026-09-02T00:00:00.000Z",
      type: "StepCompleted",
      pathwayId,
      stepId: "welcome",
      notes: "Connected",
      statusChange: "in_progress"
    },
    {
      occurredAt: "2026-09-03T00:00:00.000Z",
      type: "StepStalledDetected",
      pathwayId,
      stepId: "group",
      reason: "No response",
      statusChange: "stalled"
    },
    {
      occurredAt: "2026-09-04T00:00:00.000Z",
      type: "PathwayCompleted",
      pathwayId,
      stepId: "commissioned",
      statusChange: "completed"
    }
  ]);
});
