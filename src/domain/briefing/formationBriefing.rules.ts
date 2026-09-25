import type { FormationEvent } from "../../contracts/formationEvent.v1";
import {
  createLeaderBriefingUpdatedEvent,
  createPastorBriefingUpdatedEvent,
  type LeaderBriefingUpdated,
  type PastorBriefingUpdated,
} from "../../contracts/briefingEvent.v1";

export function mapFormationEventToLeaderBriefing(
  event: FormationEvent
): LeaderBriefingUpdated | null {
  switch (event.type) {
    case "PathwayStarted":
      return createLeaderBriefingUpdatedEvent("Pathway started", {
        memberId: event.memberId,
        pathwayId: event.pathwayId,
        pathwayType: event.payload.pathwayType,
        initialStepId: event.payload.initialStepId,
      });
    case "StepCompleted":
      return createLeaderBriefingUpdatedEvent("Step completed", {
        memberId: event.memberId,
        pathwayId: event.pathwayId,
        stepId: event.payload.stepId,
      });
    case "PathwayCompleted":
      return createLeaderBriefingUpdatedEvent("Pathway completed", {
        memberId: event.memberId,
        pathwayId: event.pathwayId,
        finalStepId: event.payload.finalStepId,
      });
    default:
      return null;
  }
}

export function mapFormationEventToPastorBriefing(
  event: FormationEvent
): PastorBriefingUpdated | null {
  switch (event.type) {
    case "StepStalledDetected":
      return createPastorBriefingUpdatedEvent("Step stalled", {
        memberId: event.memberId,
        pathwayId: event.pathwayId,
        stepId: event.payload.stepId,
        stalledSince: event.payload.stalledSince,
        reason: event.payload.reason ?? null,
      });
    case "PathwayCompleted":
      return createPastorBriefingUpdatedEvent("Pathway completed", {
        memberId: event.memberId,
        pathwayId: event.pathwayId,
        finalStepId: event.payload.finalStepId,
      });
    default:
      return null;
  }
}