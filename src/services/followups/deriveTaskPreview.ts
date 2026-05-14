export type TaskPreviewInput = {
  followup: any;
  audit: any;
};

export const TASK_PREVIEW_SCHEMA_VERSION = 1;

export type TaskPreviewEscalationLevel =
  | "NONE"
  | "ELEVATED"
  | "HIGH";

export type TaskPreviewSuppressionReason =
  | "FOLLOWUP_RESOLVED"
  | "PROJECTION_DRIFTED"
  | "PROJECTION_PROFILE_BEHIND"
  | "OWNER_MISSING";

export type TaskPreviewFreshnessSeverity =
  | "HEALTHY"
  | "PROFILE_BEHIND"
  | "DRIFTED"
  | "STALE";

export type TaskPreviewFilter = {
  ownerId?: string | null;
  eligibleOnly?: boolean;
  previewEscalationLevel?: TaskPreviewEscalationLevel;
  previewFreshnessSeverity?: TaskPreviewFreshnessSeverity;
};

export type TaskPreviewSummary = {
  total: number;
  eligible: number;
  suppressed: number;
  escalationHigh: number;
  escalationElevated: number;
  escalationNone: number;
  freshnessHealthy: number;
  freshnessDrifted: number;
  freshnessProfileBehind: number;
  freshnessStale: number;
};

export type SerializedTaskPreview = {
  schemaVersion: number;
  candidateIdentityKey: string;
  visitorId: string;
  ownerId: string | null;
  candidateTaskType: "FOLLOWUP";
  candidateTaskEligible: boolean;
  previewEscalationLevel: TaskPreviewEscalationLevel;
  previewFreshnessSeverity: TaskPreviewFreshnessSeverity;
  suppressionReasons: TaskPreviewSuppressionReason[];
};

export type TaskPreviewGroup = {
  groupKey: string;
  ownerId: string | null;
  previewEscalationLevel: TaskPreviewEscalationLevel;
  candidateTaskEligible: boolean;
  total: number;
};

export type TaskPreview = {
  visitorId: string;
  ownerId: string | null;
  priorityBand?: string;
  priorityReason?: string;
  followupUrgency?: string;
  followupResolved: boolean;
  projectionHealthy: boolean;
  projectionDrifted: boolean;
  projectionProfileBehind: boolean;
  candidateTaskType: "FOLLOWUP";
  candidateTaskEligible: boolean;
  candidateIdentityKey: string;
  previewEscalationLevel: TaskPreviewEscalationLevel;
  previewFreshnessSeverity: TaskPreviewFreshnessSeverity;
  suppressionReasons: TaskPreviewSuppressionReason[];
};

function normalizeString(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function normalizeSuppressionReasons(
  reasons: TaskPreviewSuppressionReason[]
): TaskPreviewSuppressionReason[] {
  return [...new Set(reasons)].sort();
}

function derivePreviewEscalationLevel(
  followup: any
): TaskPreviewEscalationLevel {
  const urgency = normalizeString(
    followup?.followupUrgency
  ).toUpperCase();

  const priorityBand = normalizeString(
    followup?.priorityBand
  ).toLowerCase();

  if (
    urgency === "CRITICAL" ||
    priorityBand === "urgent"
  ) {
    return "HIGH";
  }

  if (
    urgency === "AT_RISK" ||
    priorityBand === "high"
  ) {
    return "ELEVATED";
  }

  return "NONE";
}

function derivePreviewFreshnessSeverity(args: {
  projectionDrifted: boolean;
  projectionProfileBehind: boolean;
}): TaskPreviewFreshnessSeverity {
  if (
    args.projectionDrifted &&
    args.projectionProfileBehind
  ) {
    return "STALE";
  }

  if (args.projectionDrifted) {
    return "DRIFTED";
  }

  if (args.projectionProfileBehind) {
    return "PROFILE_BEHIND";
  }

  return "HEALTHY";
}

function deriveSuppressionReasons(args: {
  followupResolved: boolean;
  projectionDrifted: boolean;
  projectionProfileBehind: boolean;
  ownerId: string;
}): TaskPreviewSuppressionReason[] {
  const reasons: TaskPreviewSuppressionReason[] = [];

  if (args.followupResolved) {
    reasons.push("FOLLOWUP_RESOLVED");
  }

  if (args.projectionDrifted) {
    reasons.push("PROJECTION_DRIFTED");
  }

  if (args.projectionProfileBehind) {
    reasons.push("PROJECTION_PROFILE_BEHIND");
  }

  if (args.ownerId.length === 0) {
    reasons.push("OWNER_MISSING");
  }

  return normalizeSuppressionReasons(
    reasons
  );
}

export function deriveTaskPreview(
  input: TaskPreviewInput
): TaskPreview {
  const followup = input.followup ?? {};
  const audit = input.audit ?? {};

  const projectionDrifted =
    audit.drifted === true;

  const projectionProfileBehind =
    audit.profileBehind === true;

  const projectionHealthy =
    !projectionDrifted &&
    !projectionProfileBehind;

  const ownerId = normalizeString(
    followup?.assignedTo?.ownerId
  );

  const followupResolved =
    followup.followupResolved === true;

  const suppressionReasons =
    deriveSuppressionReasons({
      followupResolved,
      projectionDrifted,
      projectionProfileBehind,
      ownerId
    });

  const candidateTaskEligible =
    suppressionReasons.length === 0;

  const visitorId = normalizeString(
    followup.visitorId
  );

  const priorityReason = normalizeString(
    followup.priorityReason
  );

  const previewEscalationLevel =
    derivePreviewEscalationLevel(followup);

  const previewFreshnessSeverity =
    derivePreviewFreshnessSeverity({
      projectionDrifted,
      projectionProfileBehind
    });

  const candidateIdentityKey = [
    visitorId,
    ownerId,
    "FOLLOWUP",
    priorityReason,
    previewEscalationLevel,
    previewFreshnessSeverity,
    followupResolved ? "resolved" : "open"
  ].join("|");

  return {
    visitorId,
    ownerId: ownerId || null,
    priorityBand: followup.priorityBand,
    priorityReason: priorityReason || undefined,
    followupUrgency: followup.followupUrgency,
    followupResolved,
    projectionHealthy,
    projectionDrifted,
    projectionProfileBehind,
    candidateTaskType: "FOLLOWUP",
    candidateTaskEligible,
    candidateIdentityKey,
    previewEscalationLevel,
    previewFreshnessSeverity,
    suppressionReasons
  };
}

export function serializeTaskPreview(
  preview: TaskPreview
): SerializedTaskPreview {
  return {
    schemaVersion:
      TASK_PREVIEW_SCHEMA_VERSION,
    candidateIdentityKey:
      preview.candidateIdentityKey,
    visitorId:
      preview.visitorId,
    ownerId:
      preview.ownerId,
    candidateTaskType:
      preview.candidateTaskType,
    candidateTaskEligible:
      preview.candidateTaskEligible,
    previewEscalationLevel:
      preview.previewEscalationLevel,
    previewFreshnessSeverity:
      preview.previewFreshnessSeverity,
    suppressionReasons: [
      ...preview.suppressionReasons
    ]
  };
}

export function filterTaskPreviews(
  previews: TaskPreview[],
  filter: TaskPreviewFilter
): TaskPreview[] {
  return previews.filter((preview) => {
    if (
      filter.ownerId !== undefined &&
      preview.ownerId !== filter.ownerId
    ) {
      return false;
    }

    if (
      filter.eligibleOnly === true &&
      !preview.candidateTaskEligible
    ) {
      return false;
    }

    if (
      filter.previewEscalationLevel &&
      preview.previewEscalationLevel !==
        filter.previewEscalationLevel
    ) {
      return false;
    }

    if (
      filter.previewFreshnessSeverity &&
      preview.previewFreshnessSeverity !==
        filter.previewFreshnessSeverity
    ) {
      return false;
    }

    return true;
  });
}

export function summarizeTaskPreviews(
  previews: TaskPreview[]
): TaskPreviewSummary {
  return {
    total: previews.length,
    eligible: previews.filter(
      x => x.candidateTaskEligible
    ).length,
    suppressed: previews.filter(
      x => !x.candidateTaskEligible
    ).length,
    escalationHigh: previews.filter(
      x => x.previewEscalationLevel === "HIGH"
    ).length,
    escalationElevated: previews.filter(
      x => x.previewEscalationLevel === "ELEVATED"
    ).length,
    escalationNone: previews.filter(
      x => x.previewEscalationLevel === "NONE"
    ).length,
    freshnessHealthy: previews.filter(
      x => x.previewFreshnessSeverity === "HEALTHY"
    ).length,
    freshnessDrifted: previews.filter(
      x => x.previewFreshnessSeverity === "DRIFTED"
    ).length,
    freshnessProfileBehind: previews.filter(
      x => x.previewFreshnessSeverity === "PROFILE_BEHIND"
    ).length,
    freshnessStale: previews.filter(
      x => x.previewFreshnessSeverity === "STALE"
    ).length
  };
}

export function dedupeTaskPreviews(
  previews: TaskPreview[]
): TaskPreview[] {
  return Array.from(
    new Map(
      previews.map((preview) => [
        preview.candidateIdentityKey,
        preview
      ])
    ).values()
  );
}

function escalationSortWeight(
  level: TaskPreviewEscalationLevel
): number {
  switch (level) {
    case "HIGH":
      return 3;

    case "ELEVATED":
      return 2;

    default:
      return 1;
  }
}

export function sortTaskPreviews(
  previews: TaskPreview[]
): TaskPreview[] {
  return [...previews].sort((a, b) => {
    const escalationDelta =
      escalationSortWeight(
        b.previewEscalationLevel
      ) -
      escalationSortWeight(
        a.previewEscalationLevel
      );

    if (escalationDelta !== 0) {
      return escalationDelta;
    }

    const eligibilityDelta =
      Number(b.candidateTaskEligible) -
      Number(a.candidateTaskEligible);

    if (eligibilityDelta !== 0) {
      return eligibilityDelta;
    }

    return a.candidateIdentityKey.localeCompare(
      b.candidateIdentityKey
    );
  });
}

export function groupTaskPreviews(
  previews: TaskPreview[]
): TaskPreviewGroup[] {
  const grouped = new Map<
    string,
    TaskPreviewGroup
  >();

  for (const preview of previews) {
    const groupKey = [
      preview.ownerId ?? "unowned",
      preview.previewEscalationLevel,
      preview.candidateTaskEligible
        ? "eligible"
        : "suppressed"
    ].join("|");

    const existing =
      grouped.get(groupKey);

    if (existing) {
      existing.total += 1;
      continue;
    }

    grouped.set(groupKey, {
      groupKey,
      ownerId: preview.ownerId,
      previewEscalationLevel:
        preview.previewEscalationLevel,
      candidateTaskEligible:
        preview.candidateTaskEligible,
      total: 1
    });
  }

  return Array.from(
    grouped.values()
  ).sort((a, b) =>
    a.groupKey.localeCompare(b.groupKey)
  );
}
