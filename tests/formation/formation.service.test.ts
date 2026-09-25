import { FormationService } from "../../src/domain/formation/formation.service";

describe("FormationService", () => {
  const service = new FormationService();

  it("starts a pathway", () => {
    const result = service.startPathway({
      memberId: "member-1",
      pathwayId: "pathway-1",
      pathwayType: "new-believer",
      initialStepId: "welcome",
      actorId: "staff-1",
    });

    expect(result.event).toMatchObject({
      type: "PathwayStarted",
      actorId: "staff-1",
      payload: { pathwayType: "new-believer", initialStepId: "welcome" },
    });
    expect(result.state).toMatchObject({
      pathwayId: "pathway-1",
      memberId: "member-1",
      pathwayType: "new-believer",
      status: "in_progress",
      currentStepId: "welcome",
      steps: [],
    });
  });

  it("creates a completed step event and its real aggregate state", () => {
    const service = new FormationService();

    const result = service.completeStep({
      memberId: "member-1",
      pathwayId: "pathway-1",
      stepId: "welcome",
      notes: "Connected",
    });

    expect(result.event).toMatchObject({
      type: "StepCompleted",
      memberId: "member-1",
      pathwayId: "pathway-1",
      payload: { stepId: "welcome", notes: "Connected" },
    });
    expect(result.state).toMatchObject({
      pathwayId: "",
      memberId: "",
      status: "in_progress",
      currentStepId: "welcome",
      steps: [
        expect.objectContaining({
          stepId: "welcome",
          notes: "Connected",
        }),
      ],
    });
  });

  it("detects a stalled step", () => {
    const result = service.detectStepStalled({
      memberId: "member-1",
      pathwayId: "pathway-1",
      stepId: "group",
      stalledSince: "2026-09-01T00:00:00.000Z",
      reason: "No response",
    });

    expect(result.event).toMatchObject({
      type: "StepStalledDetected",
      payload: {
        stepId: "group",
        stalledSince: "2026-09-01T00:00:00.000Z",
        reason: "No response",
      },
    });
    expect(result.state).toMatchObject({
      status: "stalled",
      steps: [{ stepId: "group", stalledSince: "2026-09-01T00:00:00.000Z", reason: "No response" }],
    });
  });

  it("completes a pathway", () => {
    const result = service.completePathway({
      memberId: "member-1",
      pathwayId: "pathway-1",
      finalStepId: "commissioned",
      actorId: "staff-1",
    });

    expect(result.event).toMatchObject({
      type: "PathwayCompleted",
      actorId: "staff-1",
      payload: { finalStepId: "commissioned", completedAt: result.event.occurredAt },
    });
    expect(result.state).toMatchObject({
      status: "completed",
      currentStepId: "commissioned",
      completedAt: result.event.occurredAt,
    });
  });
});