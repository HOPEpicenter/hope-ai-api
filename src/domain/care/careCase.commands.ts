import type {
  CareCaseAssigned,
  CareCaseClosed,
  CareCaseDeferred,
  CareCaseFollowUpCompleted,
  CareCaseFollowUpProgressed,
  CareCaseFollowUpStalledDetected,
  CareCaseFollowUpStarted,
  CareCaseOpened,
  CareCaseReassigned,
  CareOutcomeRecorded,
} from "../../contracts/careEvent.v1";

type CareCaseCommandBase = {
  careCaseId: string;
  memberId: string;
  actorId?: string | null;
};

export type OpenCareCaseCommand = CareCaseCommandBase & {
  priority: "low" | "medium" | "high";
  category: string;
  notes?: string;
};

export type AssignCareCaseOwnerCommand = CareCaseCommandBase & {
  ownerId: string;
};

export type ReassignCareCaseOwnerCommand = CareCaseCommandBase & {
  previousOwnerId: string;
  newOwnerId: string;
};

export type DeferCareCaseCommand = CareCaseCommandBase & {
  reason: string;
};

export type CloseCareCaseCommand = CareCaseCommandBase & {
  reason?: string;
};

export type RecordCareOutcomeCommand = CareCaseCommandBase & {
  outcomeType: string;
  severity: "low" | "medium" | "high";
  notes?: string;
};

export type StartFollowUpCommand = CareCaseCommandBase & {
  startedAt: string;
};

export type ProgressFollowUpCommand = CareCaseCommandBase & {
  progressNote?: string;
};

export type DetectFollowUpStalledCommand = CareCaseCommandBase & {
  stalledSince: string;
};

export type CompleteFollowUpCommand = CareCaseCommandBase & {
  completedAt: string;
};

function createEventEnvelope(command: CareCaseCommandBase) {
  return {
    eventId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    actorId: command.actorId ?? null,
    source: "api" as const,
    careCaseId: command.careCaseId,
    memberId: command.memberId,
  };
}

export function handleOpenCareCase(cmd: OpenCareCaseCommand): CareCaseOpened {
  return {
    ...createEventEnvelope(cmd),
    type: "CareCaseOpened",
    payload: {
      priority: cmd.priority,
      category: cmd.category,
      notes: cmd.notes,
    },
  };
}

export function handleAssignCareCaseOwner(
  cmd: AssignCareCaseOwnerCommand
): CareCaseAssigned {
  return {
    ...createEventEnvelope(cmd),
    type: "CareCaseAssigned",
    payload: { ownerId: cmd.ownerId },
  };
}

export function handleReassignCareCaseOwner(
  cmd: ReassignCareCaseOwnerCommand
): CareCaseReassigned {
  return {
    ...createEventEnvelope(cmd),
    type: "CareCaseReassigned",
    payload: {
      previousOwnerId: cmd.previousOwnerId,
      newOwnerId: cmd.newOwnerId,
    },
  };
}

export function handleDeferCareCase(cmd: DeferCareCaseCommand): CareCaseDeferred {
  return {
    ...createEventEnvelope(cmd),
    type: "CareCaseDeferred",
    payload: { reason: cmd.reason },
  };
}

export function handleCloseCareCase(cmd: CloseCareCaseCommand): CareCaseClosed {
  return {
    ...createEventEnvelope(cmd),
    type: "CareCaseClosed",
    payload: { reason: cmd.reason },
  };
}

export function handleRecordCareOutcome(
  cmd: RecordCareOutcomeCommand
): CareOutcomeRecorded {
  return {
    ...createEventEnvelope(cmd),
    type: "CareOutcomeRecorded",
    payload: {
      outcomeType: cmd.outcomeType,
      severity: cmd.severity,
      notes: cmd.notes,
    },
  };
}

export function handleStartFollowUp(
  cmd: StartFollowUpCommand
): CareCaseFollowUpStarted {
  return {
    ...createEventEnvelope(cmd),
    type: "CareCaseFollowUpStarted",
    payload: { startedAt: cmd.startedAt },
  };
}

export function handleProgressFollowUp(
  cmd: ProgressFollowUpCommand
): CareCaseFollowUpProgressed {
  return {
    ...createEventEnvelope(cmd),
    type: "CareCaseFollowUpProgressed",
    payload: { progressNote: cmd.progressNote },
  };
}

export function handleDetectFollowUpStalled(
  cmd: DetectFollowUpStalledCommand
): CareCaseFollowUpStalledDetected {
  return {
    ...createEventEnvelope(cmd),
    type: "CareCaseFollowUpStalledDetected",
    payload: { stalledSince: cmd.stalledSince },
  };
}

export function handleCompleteFollowUp(
  cmd: CompleteFollowUpCommand
): CareCaseFollowUpCompleted {
  return {
    ...createEventEnvelope(cmd),
    type: "CareCaseFollowUpCompleted",
    payload: { completedAt: cmd.completedAt },
  };
}