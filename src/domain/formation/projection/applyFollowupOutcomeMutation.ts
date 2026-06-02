import {
  applyStageTransition
} from "./applyStageTransition";
import {
  applyTouchpointTimestamp
} from "./applyTouchpointTimestamp";

const CONNECTED_FOLLOWUP_OUTCOMES = new Set([
  "CONNECTED",
  "WILL_VISIT",
  "VISITING",
  "ATTENDING",
  "NEXT_STEP_TAKEN",
  "JOINED_GROUP",
  "MEMBER_CLASS",
  "BAPTISM_CLASS"
]);

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

  if (isConnectedFollowupOutcome(params.outcome)) {
    applyStageTransition({
      profile: params.profile,
      stage: "Connected",
      occurredAtIso: params.occurredAtIso,
      eventType: params.eventType,
      eventId: params.eventId
    });
  }

  return true;
}

function isConnectedFollowupOutcome(outcome: string | null | undefined): boolean {
  const normalized = String(outcome ?? "")
    .trim()
    .toUpperCase();

  return CONNECTED_FOLLOWUP_OUTCOMES.has(normalized);
}
