export type CareEventBase = {
  eventId: string;
  occurredAt: string;
  actorId?: string | null;
  source: "api" | "system" | "automation";
  careCaseId: string;
  memberId: string;
};

export type CareCaseOpened = CareEventBase & {
  type: "CareCaseOpened";
  payload: {
    priority: "low" | "medium" | "high";
    category: string;
    notes?: string;
  };
};

export type CareCaseAssigned = CareEventBase & {
  type: "CareCaseAssigned";
  payload: {
    ownerId: string;
  };
};

export type CareCaseReassigned = CareEventBase & {
  type: "CareCaseReassigned";
  payload: {
    previousOwnerId: string;
    newOwnerId: string;
  };
};

export type CareCaseDeferred = CareEventBase & {
  type: "CareCaseDeferred";
  payload: {
    reason: string;
  };
};

export type CareCaseClosed = CareEventBase & {
  type: "CareCaseClosed";
  payload: {
    reason?: string;
  };
};

export type CareCaseOwnerSynced = CareEventBase & {
  type: "CareCaseOwnerSynced";
  payload: {
    ownerId: string;
  };
};

export type CareCaseFollowUpStarted = CareEventBase & {
  type: "CareCaseFollowUpStarted";
  payload: {
    startedAt: string;
  };
};

export type CareCaseFollowUpProgressed = CareEventBase & {
  type: "CareCaseFollowUpProgressed";
  payload: {
    progressNote?: string;
  };
};

export type CareCaseFollowUpStalledDetected = CareEventBase & {
  type: "CareCaseFollowUpStalledDetected";
  payload: {
    stalledSince: string;
  };
};

export type CareCaseFollowUpCompleted = CareEventBase & {
  type: "CareCaseFollowUpCompleted";
  payload: {
    completedAt: string;
  };
};

export type CareOutcomeRecorded = CareEventBase & {
  type: "CareOutcomeRecorded";
  payload: {
    outcomeType: string;
    severity: "low" | "medium" | "high";
    notes?: string;
  };
};

export type CareEvent =
  | CareCaseOpened
  | CareCaseAssigned
  | CareCaseReassigned
  | CareCaseDeferred
  | CareCaseClosed
  | CareCaseOwnerSynced
  | CareCaseFollowUpStarted
  | CareCaseFollowUpProgressed
  | CareCaseFollowUpStalledDetected
  | CareCaseFollowUpCompleted
  | CareOutcomeRecorded;