import {
  applyStageTransition
} from "./applyStageTransition";
import {
  applyTouchpointTimestamp
} from "./applyTouchpointTimestamp";

export function applyFollowupOutcomeMutation(params: {
  profile: Record<string, any>;
  outcome: string;
  notes?: string;
  occurredAtIso: string;
  eventType: string;
  eventId: string;
}): boolean {
  const advanced = applyTouchpointTimestamp({
    profile: params.profile,
    field: "lastFollowupOutcomeAt",
    occurredAtIso: params.occurredAtIso
  });

  if (!advanced) return false;

  params.profile.lastFollowupOutcome = params.outcome;
  params.profile.lastFollowupOutcomeNotes =
    typeof params.notes === "string" ? params.notes.trim() || undefined : undefined;

  applyStageTransition({
    profile: params.profile,
    stage: "Connected",
    occurredAtIso: params.occurredAtIso,
    eventType: params.eventType,
    eventId: params.eventId
  });

  return true;
}
