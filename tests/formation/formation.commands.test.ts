import {
  handleCompletePathway,
  handleCompleteStep,
  handleDetectStepStalled,
  handleStartPathway,
} from "../../src/domain/formation/formation.commands";
import type {
  PathwayCompleted,
  PathwayStarted,
  StepCompleted,
  StepStalledDetected,
} from "../../src/contracts/formationEvent.v1";

describe("Formation commands", () => {
  it("creates a PathwayStarted event from StartPathwayCommand", () => {
    const command = {
      memberId: "member-1",
      pathwayId: "pathway-1",
      pathwayType: "new-believer",
      initialStepId: "welcome",
      actorId: "staff-1",
    } satisfies import("../../src/domain/formation/formation.commands").StartPathwayCommand;
    const event: PathwayStarted = handleStartPathway(command);

    expect(event).toMatchObject({
      type: "PathwayStarted",
      source: "system",
      memberId: command.memberId,
      pathwayId: command.pathwayId,
      actorId: command.actorId,
      payload: {
        startedAt: event.occurredAt,
        pathwayType: command.pathwayType,
        initialStepId: command.initialStepId,
      },
    });
    expect(event.eventId).toEqual(expect.any(String));
    expect(event.occurredAt).toEqual(expect.any(String));
  });

  it("creates a StepCompleted event from CompleteStepCommand", () => {
    const command = {
      memberId: "member-1",
      pathwayId: "pathway-1",
      stepId: "welcome",
      notes: "Connected",
      actorId: null,
    } satisfies import("../../src/domain/formation/formation.commands").CompleteStepCommand;
    const event: StepCompleted = handleCompleteStep(command);

    expect(event).toMatchObject({
      type: "StepCompleted",
      memberId: command.memberId,
      pathwayId: command.pathwayId,
      actorId: null,
      payload: {
        stepId: command.stepId,
        completedAt: event.occurredAt,
        notes: command.notes,
      },
    });
  });

  it("creates a StepStalledDetected event from DetectStepStalledCommand", () => {
    const command = {
      memberId: "member-1",
      pathwayId: "pathway-1",
      stepId: "group",
      stalledSince: "2026-09-01T00:00:00.000Z",
      reason: "No response",
      actorId: "staff-1",
    } satisfies import("../../src/domain/formation/formation.commands").DetectStepStalledCommand;
    const event: StepStalledDetected = handleDetectStepStalled(command);

    expect(event).toMatchObject({
      type: "StepStalledDetected",
      memberId: command.memberId,
      pathwayId: command.pathwayId,
      actorId: command.actorId,
      payload: {
        stepId: command.stepId,
        stalledSince: command.stalledSince,
        reason: command.reason,
      },
    });
  });

  it("creates a PathwayCompleted event from CompletePathwayCommand", () => {
    const command = {
      memberId: "member-1",
      pathwayId: "pathway-1",
      finalStepId: "commissioned",
      actorId: "staff-1",
    } satisfies import("../../src/domain/formation/formation.commands").CompletePathwayCommand;
    const event: PathwayCompleted = handleCompletePathway(command);

    expect(event).toMatchObject({
      type: "PathwayCompleted",
      memberId: command.memberId,
      pathwayId: command.pathwayId,
      actorId: command.actorId,
      payload: {
        completedAt: event.occurredAt,
        finalStepId: command.finalStepId,
      },
    });
  });
});