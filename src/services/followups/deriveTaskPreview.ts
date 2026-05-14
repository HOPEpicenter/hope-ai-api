export type TaskPreviewInput = {
  followup: any;
  audit: any;
};

export type TaskPreviewEscalationLevel =
  | "NONE"
  | "ELEVATED"
  | "HIGH";

export type TaskPreviewSuppressionReason =
  | "FOLLOWUP_RESOLVED"
  | "PROJECTION_DRIFTED"
  | "PROJECTION_PROFILE_BEHIND"
  | "OWNER_MISSING";

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
  suppressionReasons: TaskPreviewSuppressionReason[];
};

function normalizeString(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
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

  return reasons;
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

  const candidateIdentityKey = [
    visitorId,
    ownerId,
    "FOLLOWUP",
    priorityReason,
    previewEscalationLevel,
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
    suppressionReasons
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
      escalationSortWeight(b.previewEscalationLevel) -
      escalationSortWeight(a.previewEscalationLevel);

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
