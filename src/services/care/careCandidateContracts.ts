export type CareCandidateReason = "needs_care";

export type CareCandidateStatus = "candidate";

export type CareCandidate = {
  visitorId: string;
  status: CareCandidateStatus;
  reason: CareCandidateReason;
  openedAt: string;
  assignedTo: string | null;
  source: {
    workflowId: "care";
    followupOutcome: "needs_care";
    followupOutcomeAt: string;
  };
};
