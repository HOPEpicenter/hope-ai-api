import type {
  CareCandidate,
  CarePriority
} from "./careCandidateContracts";
import type {
  CanonicalVisitorDashboardCard
} from "../dashboard/canonicalDashboardContracts";

export type CanonicalCareCandidate =
  CareCandidate & {
    canonicalPriorityBand:
      | "urgent"
      | "high"
      | "normal"
      | "low";

    canonicalPriorityScore: number;
    canonicalPriorityReason: string;
    canonicalRiskLevel: string | null;
    canonicalRiskScore: number | null;
    canonicalRecommendedAction: string | null;
    assignedToName: string | null;
    stage: string | null;
  };

function mapCanonicalPriority(
  priorityBand:
    | "urgent"
    | "high"
    | "normal"
    | "low"
): CarePriority {
  if (priorityBand === "urgent") {
    return "urgent";
  }

  if (priorityBand === "high") {
    return "elevated";
  }

  return "normal";
}

export function applyCanonicalCareProjection(
  candidate: CareCandidate,
  card: CanonicalVisitorDashboardCard
): CanonicalCareCandidate {
  return {
    ...candidate,

    carePriority:
      mapCanonicalPriority(card.priorityBand),

    careSortScore:
      Math.max(
        candidate.careSortScore,
        card.priorityScore
      ),

    assignedTo:
      card.assignedTo ??
      candidate.assignedTo,

    assignmentState:
      card.assignedTo
        ? "assigned"
        : candidate.assignmentState,

    assignmentBucket:
      card.assignedTo
        ? "owned"
        : candidate.assignmentBucket,

    canonicalPriorityBand:
      card.priorityBand,

    canonicalPriorityScore:
      card.priorityScore,

    canonicalPriorityReason:
      card.priorityReason,

    canonicalRiskLevel:
      card.riskLevel,

    canonicalRiskScore:
      card.riskScore,

    canonicalRecommendedAction:
      card.recommendedAction,

    assignedToName:
      card.assignedToName,

    stage:
      card.stage
  };
}
