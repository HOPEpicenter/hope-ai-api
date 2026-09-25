import type { FormationEvent } from "../../src/contracts/formationEvent.v1";
import { FormationProfileIndex } from "../../src/domain/formation/formationProfile.index";

const memberId = "member-1";
const pathwayId = "pathway-1";

const pathwayStarted: FormationEvent = {
  eventId: "event-started",
  occurredAt: "2026-09-01T09:00:00.000Z",
  source: "api",
  memberId,
  pathwayId,
  type: "PathwayStarted",
  payload: {
    startedAt: "2026-09-01T09:00:00.000Z",
    pathwayType: "new-believer",
    initialStepId: "welcome",
  },
};

describe("FormationProfileIndex", () => {
  it("replays a full pathway lifecycle into a member profile", () => {
    const index = new FormationProfileIndex();

    index.replayEvents([
      pathwayStarted,
      {
        ...pathwayStarted,
        eventId: "event-step-completed",
        occurredAt: "2026-09-02T09:00:00.000Z",
        type: "StepCompleted",
        payload: {
          stepId: "welcome",
          completedAt: "2026-09-02T09:00:00.000Z",
          notes: "Met after service",
        },
      },
      {
        ...pathwayStarted,
        eventId: "event-step-stalled",
        occurredAt: "2026-09-04T09:00:00.000Z",
        type: "StepStalledDetected",
        payload: {
          stepId: "group",
          stalledSince: "2026-09-03T09:00:00.000Z",
          reason: "No response",
        },
      },
      {
        ...pathwayStarted,
        eventId: "event-pathway-completed",
        occurredAt: "2026-09-05T09:00:00.000Z",
        type: "PathwayCompleted",
        payload: {
          completedAt: "2026-09-05T09:00:00.000Z",
          finalStepId: "commissioned",
        },
      },
    ]);

    expect(index.getProfile(memberId)).toEqual({
      memberId,
      activePathway: null,
      history: [
        {
          pathwayId,
          pathwayType: "new-believer",
          startedAt: "2026-09-01T09:00:00.000Z",
          completedAt: "2026-09-05T09:00:00.000Z",
          currentStepId: "commissioned",
          status: "completed",
          steps: [
            {
              stepId: "welcome",
              completedAt: "2026-09-02T09:00:00.000Z",
              notes: "Met after service",
            },
            {
              stepId: "group",
              stalledSince: "2026-09-03T09:00:00.000Z",
              reason: "No response",
            },
          ],
        },
      ],
      stalledSteps: [
        {
          stepId: "group",
          stalledSince: "2026-09-03T09:00:00.000Z",
          reason: "No response",
        },
      ],
      lastUpdatedAt: "2026-09-05T09:00:00.000Z",
    });
  });
});