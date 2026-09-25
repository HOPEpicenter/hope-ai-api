export type AlertEventBase = {
  eventId: string;
  occurredAt: string;
  actorId?: string | null;
  source: "system" | "api";
  alertId: string;
  memberId: string;
  careCaseId?: string;
};

export type IntelligenceAlertRaised = AlertEventBase & {
  type: "IntelligenceAlertRaised";
  payload: {
    signalType: string;
    severity: "low" | "medium" | "high" | "critical";
    raisedAt: string;
    assignedTo: string;
    metadata?: Record<string, unknown>;
  };
};

export type IntelligenceAlertAcknowledged = AlertEventBase & {
  type: "IntelligenceAlertAcknowledged";
  payload: {
    acknowledgedAt: string;
    acknowledgedBy: string;
  };
};

export type IntelligenceAlertResolved = AlertEventBase & {
  type: "IntelligenceAlertResolved";
  payload: {
    resolvedAt: string;
    resolvedBy: string;
    resolutionNote?: string;
  };
};

export type AlertEvent =
  | IntelligenceAlertRaised
  | IntelligenceAlertAcknowledged
  | IntelligenceAlertResolved;

function createAlertEventBase(
  alertId: string,
  memberId: string,
  careCaseId: string | undefined,
  actorId?: string | null
): AlertEventBase {
  return {
    eventId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    actorId: actorId ?? null,
    source: "system",
    alertId,
    memberId,
    careCaseId,
  };
}

export function createAlertRaisedEvent(
  alertId: string,
  memberId: string,
  careCaseId: string | undefined,
  signalType: string,
  severity: "low" | "medium" | "high" | "critical",
  assignedTo: string,
  metadata?: Record<string, unknown>,
  actorId?: string | null
): IntelligenceAlertRaised {
  const event = createAlertEventBase(alertId, memberId, careCaseId, actorId);

  return {
    ...event,
    type: "IntelligenceAlertRaised",
    payload: {
      signalType,
      severity,
      raisedAt: event.occurredAt,
      assignedTo,
      metadata,
    },
  };
}

export function createAlertAcknowledgedEvent(
  alertId: string,
  memberId: string,
  careCaseId: string | undefined,
  acknowledgedBy: string,
  actorId?: string | null
): IntelligenceAlertAcknowledged {
  const event = createAlertEventBase(alertId, memberId, careCaseId, actorId);

  return {
    ...event,
    type: "IntelligenceAlertAcknowledged",
    payload: {
      acknowledgedAt: event.occurredAt,
      acknowledgedBy,
    },
  };
}

export function createAlertResolvedEvent(
  alertId: string,
  memberId: string,
  careCaseId: string | undefined,
  resolvedBy: string,
  resolutionNote?: string,
  actorId?: string | null
): IntelligenceAlertResolved {
  const event = createAlertEventBase(alertId, memberId, careCaseId, actorId);

  return {
    ...event,
    type: "IntelligenceAlertResolved",
    payload: {
      resolvedAt: event.occurredAt,
      resolvedBy,
      resolutionNote,
    },
  };
}