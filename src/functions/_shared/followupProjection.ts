import { resolveOperatorDisplayName } from "./formation";

export type FollowupProjection = {
  assignedTo: string | null;
  assignedToName: string | null;

  followupState:
    | "Assigned"
    | "Contacted"
    | "Resolved"
    | "Unassigned";

  attentionState:
    | "Action needed"
    | "Contact made"
    | "Resolved"
    | "Unassigned";

  isOpen: boolean;
};

export function projectFollowupState(profile: any): FollowupProjection {
  const assignedToRaw =
    typeof profile?.assignedTo === "string"
      ? profile.assignedTo.trim()
      : "";

  const assignedTo =
    assignedToRaw.length > 0
      ? assignedToRaw
      : null;

  const assignedToName =
    assignedTo
      ? resolveOperatorDisplayName(assignedTo)
      : null;

  const contacted =
    !!profile?.lastFollowupContactedAt;

  const resolved =
    !!profile?.lastFollowupOutcomeAt;

  if (!assignedTo) {
    return {
      assignedTo: null,
      assignedToName: null,
      followupState: "Unassigned",
      attentionState: "Unassigned",
      isOpen: false
    };
  }

  if (resolved) {
    return {
      assignedTo,
      assignedToName,
      followupState: "Resolved",
      attentionState: "Resolved",
      isOpen: false
    };
  }

  if (contacted) {
    return {
      assignedTo,
      assignedToName,
      followupState: "Contacted",
      attentionState: "Contact made",
      isOpen: true
    };
  }

  return {
    assignedTo,
    assignedToName,
    followupState: "Assigned",
    attentionState: "Action needed",
    isOpen: true
  };
}
