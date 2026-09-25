import type { FormationEvent } from "../../src/contracts/formationEvent.v1";
import { FormationProjection } from "../../src/domain/formation/formation.projection";

const pathwayStarted: FormationEvent = {
  eventId: "event-start",
  occurredAt: "2026-09-01T09:00:00.000Z",
  source: "api",
  memberId: "member-1",
  pathwayId: "pathway-1",
  type: "PathwayStarted",
  payload: {
    startedAt: "2026-09-01T09:00:00.000Z",
    pathwayType: "new-believer",
    initialStepId: "welcome",
  },
};

describe("FormationProjection", () => {
  it("projects a pathway lifecycle and updates lastUpdatedAt for every event", () => {
    const projection = new FormationProjection();
    projection.apply(pathwayStarted);
    projection.apply({
      ...pathwayStarted,
      eventId: "event-stalled",
      occurredAt: "2026-09-04T09:00:00.000Z",
      type: "StepStalledDetected",
      payload: {
        stepId: "group",
        stalledSince: "2026-09-03T09:00:00.000Z",
        reason: "No response",
      },
    });
    projection.apply({
      ...pathwayStarted,
      eventId: "event-complete",
      occurredAt: "2026-09-05T09:00:00.000Z",
      type: "PathwayCompleted",
      payload: {
        completedAt: "2026-09-05T09:00:00.000Z",
        finalStepId: "commissioned",
      },
    });

    expect(projection.getState()).toEqual({
      lastUpdatedAt: "2026-09-05T09:00:00.000Z",
      pathways: [
        {
          pathwayId: "pathway-1",
          memberId: "member-1",
          pathwayType: "new-believer",
          startedAt: "2026-09-01T09:00:00.000Z",
          completedAt: "2026-09-05T09:00:00.000Z",
          status: "completed",
          currentStepId: "commissioned",
          steps: [
            {
              stepId: "group",
              stalledSince: "2026-09-03T09:00:00.000Z",
              reason: "No response",
            },
          ],
        },
      ],
    });
  });

  it("updates an existing projected step rather than duplicating it", () => {
    const projection = new FormationProjection();
    projection.apply(pathwayStarted);
    projection.apply({
      ...pathwayStarted,
      eventId: "event-step-1",
      occurredAt: "2026-09-02T09:00:00.000Z",
      type: "StepCompleted",
      payload: { stepId: "welcome", completedAt: "2026-09-02T09:00:00.000Z" },
    });
    projection.apply({
      ...pathwayStarted,
      eventId: "event-step-2",
      occurredAt: "2026-09-03T09:00:00.000Z",
      type: "StepCompleted",
      payload: { stepId: "welcome", completedAt: "2026-09-03T09:00:00.000Z", notes: "Connected" },
    });

    expect(projection.getState().pathways[0]?.steps).toEqual([
      { stepId: "welcome", completedAt: "2026-09-03T09:00:00.000Z", notes: "Connected" },
    ]);
  });
});