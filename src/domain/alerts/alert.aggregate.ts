import type { AlertEvent } from "../../contracts/alertEvent.v1";

export type AlertState = {
  alertId: string;
  memberId: string;
  careCaseId?: string;
  status: "open" | "acknowledged" | "resolved";
  severity: "low" | "medium" | "high" | "critical" | null;
  signalType: string | null;
  assignedTo: string | null;
  raisedAt: string | null;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
};

const initialAlertState: AlertState = {
  alertId: "",
  memberId: "",
  careCaseId: undefined,
  status: "open",
  severity: null,
  signalType: null,
  assignedTo: null,
  raisedAt: null,
  acknowledgedAt: null,
  acknowledgedBy: null,
  resolvedAt: null,
  resolvedBy: null,
  resolutionNote: null,
};

export function applyAlertEvent(
  state: AlertState,
  event: AlertEvent
): AlertState {
  switch (event.type) {
    case "IntelligenceAlertRaised":
      return {
        ...state,
        alertId: event.alertId,
        memberId: event.memberId,
        careCaseId: event.careCaseId,
        status: "open",
        severity: event.payload.severity,
        signalType: event.payload.signalType,
        assignedTo: event.payload.assignedTo,
        raisedAt: event.payload.raisedAt,
      };
    case "IntelligenceAlertAcknowledged":
      return {
        ...state,
        status: "acknowledged",
        acknowledgedAt: event.payload.acknowledgedAt,
        acknowledgedBy: event.payload.acknowledgedBy,
      };
    case "IntelligenceAlertResolved":
      return {
        ...state,
        status: "resolved",
        resolvedAt: event.payload.resolvedAt,
        resolvedBy: event.payload.resolvedBy,
        resolutionNote: event.payload.resolutionNote ?? null,
      };
  }
}

export class AlertAggregate {
  private state: AlertState;

  constructor(initial?: AlertState) {
    this.state = initial ?? { ...initialAlertState };
  }

  public apply(event: AlertEvent): void {
    this.state = applyAlertEvent(this.state, event);
  }

  public getState(): AlertState {
    return this.state;
  }
}