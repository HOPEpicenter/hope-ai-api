export type CareCandidateReason = "needs_care";

export type CareCandidateStatus = "candidate";

export type CareCandidateLevel = "standard";

export type CareCandidateCategory = "followup_needs_care";

export type CareCandidate = {
  visitorId: string;
  status: CareCandidateStatus;
  reason: CareCandidateReason;
  careLevel: CareCandidateLevel;
  careCategory: CareCandidateCategory;
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
