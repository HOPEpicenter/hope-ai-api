import type { FormationEvent } from "../../src/contracts/formationEvent.v1";
import { PathwayAggregate } from "../../src/domain/formation/pathway.aggregate";

const started: FormationEvent = {
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

describe("PathwayAggregate", () => {
  it("applies every FormationEvent and preserves the full pathway lifecycle", () => {
    const aggregate = new PathwayAggregate();

    aggregate.apply(started);
    aggregate.apply({
      ...started,
      eventId: "event-step",
      occurredAt: "2026-09-02T09:00:00.000Z",
      type: "StepCompleted",
      payload: {
        stepId: "welcome",
        completedAt: "2026-09-02T09:00:00.000Z",
        notes: "Introduced to group leader",
      },
    });
    aggregate.apply({
      ...started,
      eventId: "event-stalled",
      occurredAt: "2026-09-02T12:00:00.000Z",
      type: "StepStalledDetected",
      payload: {
        stepId: "group",
        stalledSince: "2026-09-02T10:00:00.000Z",
        reason: "No response",
      },
    });
    aggregate.apply({
      ...started,
      eventId: "event-complete",
      occurredAt: "2026-09-03T09:00:00.000Z",
      type: "PathwayCompleted",
      payload: {
        completedAt: "2026-09-03T09:00:00.000Z",
        finalStepId: "commissioned",
      },
    });

    expect(aggregate.getState()).toEqual({
      pathwayId: "pathway-1",
      memberId: "member-1",
      pathwayType: "new-believer",
      startedAt: "2026-09-01T09:00:00.000Z",
      completedAt: "2026-09-03T09:00:00.000Z",
      currentStepId: "commissioned",
      status: "completed",
      steps: [
        {
          stepId: "welcome",
          completedAt: "2026-09-02T09:00:00.000Z",
          notes: "Introduced to group leader",
        },
        {
          stepId: "group",
          stalledSince: "2026-09-02T10:00:00.000Z",
          reason: "No response",
        },
      ],
    });
  });

  it("applies a StepCompleted event to an existing step", () => {
    const aggregate = new PathwayAggregate({
      ...new PathwayAggregate().getState(),
      pathwayId: "pathway-1",
      memberId: "member-1",
      status: "in_progress",
      steps: [{ stepId: "welcome", stalledSince: "2026-09-01T00:00:00.000Z" }],
    });

    aggregate.apply({
      ...started,
      eventId: "event-step",
      type: "StepCompleted",
      payload: {
        stepId: "welcome",
        completedAt: "2026-09-02T00:00:00.000Z",
        notes: "Reached",
      },
    });

    expect(aggregate.getState().steps).toEqual([
      {
        stepId: "welcome",
        stalledSince: "2026-09-01T00:00:00.000Z",
        completedAt: "2026-09-02T00:00:00.000Z",
        notes: "Reached",
      },
    ]);
  });
});