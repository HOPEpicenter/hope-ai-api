import {
  applyStageTransition
} from "./applyStageTransition";
import {
  applyTouchpointTimestamp
} from "./applyTouchpointTimestamp";

export function applyNextStepMutation(params: {
  profile: Record<string, any>;
  completed: boolean;
  occurredAtIso: string;
  eventType: string;
  eventId: string;
}): {
  selectedAdvanced: boolean;
  completedAdvanced: boolean;
} {
  const selectedAdvanced = applyTouchpointTimestamp({
    profile: params.profile,
    field: "lastNextStepAt",
    occurredAtIso: params.occurredAtIso
  });

  if (selectedAdvanced) {
    applyStageTransition({
      profile: params.profile,
      stage: "Connected",
      occurredAtIso: params.occurredAtIso,
      eventType: params.eventType,
      eventId: params.eventId
    });
  }

  const completedAdvanced = params.completed
    ? applyTouchpointTimestamp({
        profile: params.profile,
        field: "lastNextStepCompletedAt",
        occurredAtIso: params.occurredAtIso
      })
    : false;

  return {
    selectedAdvanced,
    completedAdvanced
  };
}
