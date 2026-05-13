export type TaskPreviewInput = {
  followup: any;
  audit: any;
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
};

function normalizeString(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

export function deriveTaskPreview(
  input: TaskPreviewInput
): TaskPreview {
  const followup = input.followup ?? {};
  const audit = input.audit ?? {};

  const projectionDrifted = audit.drifted === true;
  const projectionProfileBehind = audit.profileBehind === true;

  const projectionHealthy =
    !projectionDrifted &&
    !projectionProfileBehind;

  const ownerId = normalizeString(
    followup?.assignedTo?.ownerId
  );

  const followupResolved =
    followup.followupResolved === true;

  const candidateTaskEligible =
    !followupResolved &&
    projectionHealthy &&
    ownerId.length > 0;

  const visitorId = normalizeString(
    followup.visitorId
  );

  const priorityReason = normalizeString(
    followup.priorityReason
  );

  const candidateIdentityKey = [
    visitorId,
    ownerId,
    "FOLLOWUP",
    priorityReason,
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
    candidateIdentityKey
  };
}
