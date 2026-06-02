import type { CareCandidate } from "./careCandidateContracts";

export type DeriveCareCandidateInput = {
  visitorId?: string | null;
  assignedTo?: string | null;
  lastFollowupOutcome?: string | null;
  lastFollowupOutcomeAt?: string | null;
  now?: Date;
};

export function deriveCareCandidate(
  input: DeriveCareCandidateInput
): CareCandidate | null {
  const visitorId = String(input.visitorId ?? "").trim();
  const outcome = String(input.lastFollowupOutcome ?? "").trim().toLowerCase();
  const outcomeAt = String(input.lastFollowupOutcomeAt ?? "").trim();

  if (!visitorId) return null;
  if (outcome !== "needs_care") return null;
  if (!outcomeAt) return null;

  const assignedTo = String(input.assignedTo ?? "").trim() || null;

  return {
    visitorId,
    status: "candidate",
    reason: "needs_care",
    careLevel: "standard",
    careCategory: "followup_needs_care",
    carePriority: "normal",
    careAgeBucket: "new",
    escalationLevel: "none",
    recommendedCareAction: "review_followup",
    openedAt: outcomeAt,
    careOpenedBy: assignedTo,
    assignedTo,
    daysOpen: calculateDaysOpen(outcomeAt, input.now ?? new Date()),
    source: {
      workflowId: "care",
      followupOutcome: "needs_care",
      followupOutcomeAt: outcomeAt
    }
  };
}

function calculateDaysOpen(openedAt: string, now: Date): number | null {
  const openedTime = Date.parse(openedAt);
  const nowTime = now.getTime();

  if (!Number.isFinite(openedTime) || !Number.isFinite(nowTime)) {
    return null;
  }

  const diffMs = Math.max(0, nowTime - openedTime);
  return Math.floor(diffMs / 86400000);
}

