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

  const daysOpen = calculateDaysOpen(
    outcomeAt,
    input.now ?? new Date()
  );

  const careAgeBucket = deriveCareAgeBucket(daysOpen);
  const carePriority = deriveCarePriority(careAgeBucket);
  const escalationLevel = deriveEscalationLevel(careAgeBucket);
  const recommendedCareAction = deriveRecommendedCareAction(careAgeBucket);
  const careSortScore = deriveCareSortScore(careAgeBucket, assignedTo);
  const assignmentState = deriveAssignmentState(assignedTo);
  const assignmentBucket = deriveAssignmentBucket(assignedTo);

  return {
    visitorId,
    status: "candidate",
    reason: "needs_care",
    careLevel: "standard",
    careCategory: "followup_needs_care",
    carePriority,
    careAgeBucket,
    escalationLevel,
    recommendedCareAction,
    careSortScore,
    openedAt: outcomeAt,
    careOpenedBy: assignedTo,
    assignedTo,
    assignmentState,
    assignmentBucket,
    daysOpen,
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
function deriveCareAgeBucket(
  daysOpen: number | null
): "new" | "aging" | "stale" {
  if (daysOpen === null || daysOpen <= 2) {
    return "new";
  }

  if (daysOpen <= 6) {
    return "aging";
  }

  return "stale";
}

function deriveCarePriority(
  ageBucket: "new" | "aging" | "stale"
): "normal" | "elevated" | "urgent" {
  switch (ageBucket) {
    case "aging":
      return "elevated";

    case "stale":
      return "urgent";

    default:
      return "normal";
  }
}

function deriveEscalationLevel(
  ageBucket: "new" | "aging" | "stale"
): "none" | "review" | "escalate" {
  switch (ageBucket) {
    case "aging":
      return "review";

    case "stale":
      return "escalate";

    default:
      return "none";
  }
}
function deriveRecommendedCareAction(
  ageBucket: "new" | "aging" | "stale"
): "review_followup" | "prioritize_review" | "escalation_review" {
  switch (ageBucket) {
    case "aging":
      return "prioritize_review";

    case "stale":
      return "escalation_review";

    default:
      return "review_followup";
  }
}
function deriveCareSortScore(
  ageBucket: "new" | "aging" | "stale",
  assignedTo: string | null
): number {
  const ageScore =
    ageBucket === "stale" ? 300 :
    ageBucket === "aging" ? 200 :
    100;

  const assignmentScore = assignedTo ? 10 : 20;

  return ageScore + assignmentScore;
}
function deriveAssignmentState(
  assignedTo: string | null
): "assigned" | "unassigned" {
  return assignedTo ? "assigned" : "unassigned";
}

function deriveAssignmentBucket(
  assignedTo: string | null
): "owned" | "queue" {
  return assignedTo ? "owned" : "queue";
}
