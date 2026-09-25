import {
  createAlertAcknowledgedEvent,
  createAlertRaisedEvent,
  createAlertResolvedEvent,
  type IntelligenceAlertAcknowledged,
  type IntelligenceAlertRaised,
  type IntelligenceAlertResolved,
} from "../../contracts/alertEvent.v1";

export type RaiseAlertCommand = {
  alertId: string;
  memberId: string;
  careCaseId?: string;
  signalType: string;
  severity: "low" | "medium" | "high" | "critical";
  assignedTo: string;
  metadata?: Record<string, unknown>;
  actorId?: string | null;
};

export type AcknowledgeAlertCommand = {
  alertId: string;
  memberId: string;
  careCaseId?: string;
  acknowledgedBy: string;
  actorId?: string | null;
};

export type ResolveAlertCommand = {
  alertId: string;
  memberId: string;
  careCaseId?: string;
  resolvedBy: string;
  resolutionNote?: string;
  actorId?: string | null;
};

export function handleRaiseAlert(
  cmd: RaiseAlertCommand
): IntelligenceAlertRaised {
  return createAlertRaisedEvent(
    cmd.alertId,
    cmd.memberId,
    cmd.careCaseId,
    cmd.signalType,
    cmd.severity,
    cmd.assignedTo,
    cmd.metadata,
    cmd.actorId
  );
}

export function handleAcknowledgeAlert(
  cmd: AcknowledgeAlertCommand
): IntelligenceAlertAcknowledged {
  return createAlertAcknowledgedEvent(
    cmd.alertId,
    cmd.memberId,
    cmd.careCaseId,
    cmd.acknowledgedBy,
    cmd.actorId
  );
}

export function handleResolveAlert(
  cmd: ResolveAlertCommand
): IntelligenceAlertResolved {
  return createAlertResolvedEvent(
    cmd.alertId,
    cmd.memberId,
    cmd.careCaseId,
    cmd.resolvedBy,
    cmd.resolutionNote,
    cmd.actorId
  );
}