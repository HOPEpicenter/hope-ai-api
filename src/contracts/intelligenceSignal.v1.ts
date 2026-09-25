export type IntelligenceSignalBase = {
  signalId: string;
  occurredAt: string;
  actorId?: string | null;
  sourceDomain: "care";
  memberId: string;
  careCaseId?: string;
};

export type IntelligenceSignalEmitted = IntelligenceSignalBase & {
  type: "IntelligenceSignalEmitted";
  payload: {
    signalType: string;
    severity: "info" | "low" | "medium" | "high" | "critical";
    metadata?: Record<string, unknown>;
  };
};

export type IntelligenceSignalEvent = IntelligenceSignalEmitted;

export function createIntelligenceSignalEvent(
  memberId: string,
  signalType: string,
  severity: "low" | "medium" | "high" | "critical",
  metadata?: Record<string, unknown>,
  actorId?: string | null
): IntelligenceSignalEmitted {
  return {
    signalId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    actorId: actorId ?? null,
    sourceDomain: "care",
    memberId,
    type: "IntelligenceSignalEmitted",
    payload: {
      signalType,
      severity,
      metadata,
    },
  };
}