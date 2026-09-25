import type { AlertListState } from "./alert.projection";

export class AlertIndex {
  constructor(private readonly state: AlertListState) {}

  public getActiveAlerts(): Array<{
    alertId: string;
    memberId: string;
    careCaseId?: string;
    severity: string;
    signalType: string;
    assignedTo: string;
    raisedAt: string;
    acknowledgedAt?: string;
    acknowledgedBy?: string;
  }> {
    return this.state.activeAlerts.map(alert => ({ ...alert }));
  }

  public getResolvedAlerts(): Array<{
    alertId: string;
    memberId: string;
    careCaseId?: string;
    resolvedAt: string;
    resolvedBy: string;
    resolutionNote: string | null;
  }> {
    return this.state.resolvedAlerts.map(alert => ({ ...alert }));
  }

  public getAlertsForMember(memberId: string): {
    active: ReturnType<AlertIndex["getActiveAlerts"]>;
    resolved: ReturnType<AlertIndex["getResolvedAlerts"]>;
  } {
    return {
      active: this.getActiveAlerts().filter(alert => alert.memberId === memberId),
      resolved: this.getResolvedAlerts().filter(alert => alert.memberId === memberId),
    };
  }

  public getAlertsForCareCase(careCaseId: string): {
    active: ReturnType<AlertIndex["getActiveAlerts"]>;
    resolved: ReturnType<AlertIndex["getResolvedAlerts"]>;
  } {
    return {
      active: this.getActiveAlerts().filter(
        alert => alert.careCaseId === careCaseId
      ),
      resolved: this.getResolvedAlerts().filter(
        alert => alert.careCaseId === careCaseId
      ),
    };
  }

  public getHighSeverityActiveAlerts(): ReturnType<
    AlertIndex["getActiveAlerts"]
  > {
    return this.getActiveAlerts().filter(
      alert => alert.severity === "high" || alert.severity === "critical"
    );
  }

  public getLastUpdatedAt(): string | null {
    return this.state.lastUpdatedAt;
  }
}