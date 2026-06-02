export type CareCandidateReason = "needs_care";

export type CareCandidateStatus = "candidate";

export type CareCandidateLevel = "standard";

export type CareCandidateCategory = "followup_needs_care";

export type CarePriority =
  | "normal"
  | "elevated"
  | "urgent";

export type CareAgeBucket =
  | "new"
  | "aging"
  | "stale";

export type EscalationLevel =
  | "none"
  | "review"
  | "escalate";

export type RecommendedCareAction =
  | "review_followup"
  | "prioritize_review"
  | "escalation_review";

export type CareCandidate = {
  visitorId: string;
  status: CareCandidateStatus;
  reason: CareCandidateReason;
  careLevel: CareCandidateLevel;
  careCategory: CareCandidateCategory;
  carePriority: CarePriority;
  careAgeBucket: CareAgeBucket;
  escalationLevel: EscalationLevel;
  recommendedCareAction: RecommendedCareAction;
  careSortScore: number;
  openedAt: string;
  careOpenedBy: string | null;
  assignedTo: string | null;
  daysOpen: number | null;
  source: {
    workflowId: "care";
    followupOutcome: "needs_care";
    followupOutcomeAt: string;
  };
};

