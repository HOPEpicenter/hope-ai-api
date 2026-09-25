import type { FormationEvent } from "../../contracts/formationEvent.v1";
import {
  createIntelligenceSignalEvent,
  type IntelligenceSignalEmitted,
} from "../../contracts/intelligenceSignal.v1";

export function mapFormationEventToSignal(
  event: FormationEvent
): IntelligenceSignalEmitted | null {
  switch (event.type) {
    case "PathwayStarted":
      return createIntelligenceSignalEvent(
        event.memberId,
        "FORMATION_PATHWAY_STARTED",
        "low",
        {
          pathwayType: event.payload.pathwayType,
          initialStepId: event.payload.initialStepId,
        },
        event.actorId ?? null
      );
    case "StepCompleted":
      return createIntelligenceSignalEvent(
        event.memberId,
        "FORMATION_STEP_COMPLETED",
        "low",
        {
          stepId: event.payload.stepId,
          notes: event.payload.notes ?? null,
        },
        event.actorId ?? null
      );
    case "StepStalledDetected":
      return createIntelligenceSignalEvent(
        event.memberId,
        "FORMATION_STEP_STALLED",
        "medium",
        {
          stepId: event.payload.stepId,
          stalledSince: event.payload.stalledSince,
          reason: event.payload.reason ?? null,
        },
        event.actorId ?? null
      );
    case "PathwayCompleted":
      return createIntelligenceSignalEvent(
        event.memberId,
        "FORMATION_PATHWAY_COMPLETED",
        "medium",
        { finalStepId: event.payload.finalStepId },
        event.actorId ?? null
      );
  }
}