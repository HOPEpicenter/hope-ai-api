export type FormationEventBase = {
  eventId: string;
  occurredAt: string;
  actorId?: string | null;
  source: "system" | "api";
  memberId: string;
  pathwayId: string;
};

export type PathwayStarted = FormationEventBase & {
  type: "PathwayStarted";
  payload: {
    startedAt: string;
    pathwayType: string;
    initialStepId: string;
  };
};

export type StepCompleted = FormationEventBase & {
  type: "StepCompleted";
  payload: {
    stepId: string;
    completedAt: string;
    notes?: string;
  };
};

export type StepStalledDetected = FormationEventBase & {
  type: "StepStalledDetected";
  payload: {
    stepId: string;
    stalledSince: string;
    reason?: string;
  };
};

export type PathwayCompleted = FormationEventBase & {
  type: "PathwayCompleted";
  payload: {
    completedAt: string;
    finalStepId: string;
  };
};

export type FormationEvent =
  | PathwayStarted
  | StepCompleted
  | StepStalledDetected
  | PathwayCompleted;

function createFormationEventBase(
  memberId: string,
  pathwayId: string,
  actorId?: string | null
): FormationEventBase {
  return {
    eventId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    actorId: actorId ?? null,
    source: "system",
    memberId,
    pathwayId,
  };
}

export function createPathwayStartedEvent(
  memberId: string,
  pathwayId: string,
  pathwayType: string,
  initialStepId: string,
  actorId?: string | null
): PathwayStarted {
  const event = createFormationEventBase(memberId, pathwayId, actorId);

  return {
    ...event,
    type: "PathwayStarted",
    payload: {
      startedAt: event.occurredAt,
      pathwayType,
      initialStepId,
    },
  };
}

export function createStepCompletedEvent(
  memberId: string,
  pathwayId: string,
  stepId: string,
  notes?: string,
  actorId?: string | null
): StepCompleted {
  const event = createFormationEventBase(memberId, pathwayId, actorId);

  return {
    ...event,
    type: "StepCompleted",
    payload: {
      stepId,
      completedAt: event.occurredAt,
      notes,
    },
  };
}

export function createStepStalledDetectedEvent(
  memberId: string,
  pathwayId: string,
  stepId: string,
  stalledSince: string,
  reason?: string,
  actorId?: string | null
): StepStalledDetected {
  const event = createFormationEventBase(memberId, pathwayId, actorId);

  return {
    ...event,
    type: "StepStalledDetected",
    payload: {
      stepId,
      stalledSince,
      reason,
    },
  };
}

export function createPathwayCompletedEvent(
  memberId: string,
  pathwayId: string,
  finalStepId: string,
  actorId?: string | null
): PathwayCompleted {
  const event = createFormationEventBase(memberId, pathwayId, actorId);

  return {
    ...event,
    type: "PathwayCompleted",
    payload: {
      completedAt: event.occurredAt,
      finalStepId,
    },
  };
}