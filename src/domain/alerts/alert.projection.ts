import type { AlertEvent } from "../../contracts/alertEvent.v1";

export type AlertListState = {
  activeAlerts: Array<{
    alertId: string;
    memberId: string;
    careCaseId?: string;
    severity: "low" | "medium" | "high" | "critical";
    signalType: string;
    assignedTo: string;
    raisedAt: string;
    acknowledgedAt?: string;
    acknowledgedBy?: string;
  }>;
  resolvedAlerts: Array<{
    alertId: string;
    memberId: string;
    careCaseId?: string;
    resolvedAt: string;
    resolvedBy: string;
    resolutionNote: string | null;
  }>;
  lastUpdatedAt: string | null;
};

const initialState: AlertListState = {
  activeAlerts: [],
  resolvedAlerts: [],
  lastUpdatedAt: null,
};

export function applyAlertListEvent(
  state: AlertListState,
  event: AlertEvent
): AlertListState {
  switch (event.type) {
    case "IntelligenceAlertRaised":
      return {
        ...state,
        activeAlerts: [
          ...state.activeAlerts,
          {
            alertId: event.alertId,
            memberId: event.memberId,
            careCaseId: event.careCaseId,
            severity: event.payload.severity,
            signalType: event.payload.signalType,
            assignedTo: event.payload.assignedTo,
            raisedAt: event.payload.raisedAt,
          },
        ],
        lastUpdatedAt: event.occurredAt,
      };
    case "IntelligenceAlertAcknowledged":
      return {
        ...state,
        activeAlerts: state.activeAlerts.map(alert =>
          alert.alertId === event.alertId
            ? {
                ...alert,
                acknowledgedAt: event.payload.acknowledgedAt,
                acknowledgedBy: event.payload.acknowledgedBy,
              }
            : alert
        ),
        lastUpdatedAt: event.occurredAt,
      };
    case "IntelligenceAlertResolved":
      return {
        activeAlerts: state.activeAlerts.filter(
          alert => alert.alertId !== event.alertId
        ),
        resolvedAlerts: [
          ...state.resolvedAlerts,
          {
            alertId: event.alertId,
            memberId: event.memberId,
            careCaseId: event.careCaseId,
            resolvedAt: event.payload.resolvedAt,
            resolvedBy: event.payload.resolvedBy,
            resolutionNote: event.payload.resolutionNote ?? null,
          },
        ],
        lastUpdatedAt: event.occurredAt,
      };
  }
}

export class AlertProjection {
  private state: AlertListState;

  constructor(initial?: AlertListState) {
    this.state = initial ?? { ...initialState };
  }

  public apply(event: AlertEvent): void {
    this.state = applyAlertListEvent(this.state, event);
  }

  public getState(): AlertListState {
    return this.state;
  }
}