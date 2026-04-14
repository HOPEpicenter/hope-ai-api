export type CanonicalFollowupStatus =
  | "Assigned"
  | "Contacted"
  | "Resolved"
  | "No active followup";

export type CanonicalAttentionState =
  | "Needs attention"
  | "Contact made"
  | "Clear";

export function getCanonicalFollowupStatus(input: {
  assignedAt?: string | null;
  contactedAt?: string | null;
  outcomeAt?: string | null;
}): CanonicalFollowupStatus {
  if (input.outcomeAt) {
    return "Resolved";
  }

  if (input.contactedAt) {
    return "Contacted";
  }

  if (input.assignedAt) {
    return "Assigned";
  }

  return "No active followup";
}

export function getCanonicalAttentionState(
  followupStatus: CanonicalFollowupStatus
): CanonicalAttentionState {
  if (followupStatus === "Assigned") {
    return "Needs attention";
  }

  if (followupStatus === "Contacted") {
    return "Contact made";
  }

  return "Clear";
}
