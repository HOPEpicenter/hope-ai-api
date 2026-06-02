import type { CareCandidate } from "./careCandidateContracts";

export type DeriveCareCandidateInput = {
  visitorId?: string | null;
  assignedTo?: string | null;
  lastFollowupOutcome?: string | null;
  lastFollowupOutcomeAt?: string | null;
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
    openedAt: outcomeAt,
    assignedTo,
    source: {
      workflowId: "care",
      followupOutcome: "needs_care",
      followupOutcomeAt: outcomeAt
    }
  };
}
