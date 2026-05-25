import {
  applyStageTransition
} from "./applyStageTransition";
import {
  applyTouchpointTimestamp
} from "./applyTouchpointTimestamp";

export type FollowupAssignedProfile =
  Record<string, any>;

export function applyFollowupAssignedMutation(params: {
  profile: FollowupAssignedProfile;
  assigneeId: string;
  occurredAtIso: string;
  eventType: string;
  eventId: string;
}): boolean {
  const {
    profile,
    assigneeId,
    occurredAtIso,
    eventType,
    eventId
  } = params;

  const advanced =
    applyTouchpointTimestamp({
      profile,
      field: "lastFollowupAssignedAt",
      occurredAtIso
    });

  if (!advanced) {
    return false;
  }

  profile.assignedTo = assigneeId;

  applyStageTransition({
    profile,
    stage: "Guest",
    occurredAtIso,
    eventType,
    eventId
  });

  return true;
}
