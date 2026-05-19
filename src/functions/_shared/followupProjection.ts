import {
  normalizeOperatorId,
  resolveOperatorDisplayName
} from "../../services/operators/operatorIdentity";

export type FollowupProjectionMetadata = {
  sourceSystem: string | null;
  isDiagnostic: boolean;
};

export type FollowupProjection = {
  assignedTo: string | null;
  assignedToName: string | null;
  projectionMetadata: FollowupProjectionMetadata;

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

function getFollowupProjectionMetadata(profile: any): FollowupProjectionMetadata {
  const sourceSystem =
    typeof profile?.lastSourceSystem === "string" && profile.lastSourceSystem.trim().length > 0
      ? profile.lastSourceSystem.trim()
      : null;

  const normalizedSourceSystem = sourceSystem?.toLowerCase() ?? "";

  return {
    sourceSystem,
    isDiagnostic:
      normalizedSourceSystem.startsWith("scripts/") ||
      normalizedSourceSystem.includes("assert")
  };
}

export function projectFollowupState(profile: any): FollowupProjection {
  const projectionMetadata = getFollowupProjectionMetadata(profile);

  const assignedTo =
    normalizeOperatorId(profile?.assignedTo);

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
      projectionMetadata,
      followupState: "Unassigned",
      attentionState: "Unassigned",
      isOpen: false
    };
  }

  if (resolved) {
    return {
      assignedTo,
      assignedToName,
      projectionMetadata,
      followupState: "Resolved",
      attentionState: "Resolved",
      isOpen: false
    };
  }

  if (contacted) {
    return {
      assignedTo,
      assignedToName,
      projectionMetadata,
      followupState: "Contacted",
      attentionState: "Contact made",
      isOpen: true
    };
  }

  return {
    assignedTo,
    assignedToName,
    projectionMetadata,
    followupState: "Assigned",
    attentionState: "Action needed",
    isOpen: true
  };
}
