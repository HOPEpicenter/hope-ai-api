import type { IntelligenceSignalEmitted } from "../../contracts/intelligenceSignal.v1";
import type { MemberCareRiskState } from "../intelligence/memberCareRisk.projection";

export type PastorBriefingState = {
  highRiskMembers: Array<{
    memberId: string;
    riskScore: number;
    lastSignalAt: string | null;
  }>;
  recentHighSeverityOutcomes: Array<{
    memberId: string;
    careCaseId?: string;
    outcomeSeverity: "low" | "medium" | "high";
    occurredAt: string;
  }>;
  alertsRaisedThisWeek: Array<{
    memberId: string;
    careCaseId?: string;
    signalType: string;
    severity: string;
    occurredAt: string;
  }>;
  lastUpdatedAt: string | null;
};

const initialState: PastorBriefingState = {
  highRiskMembers: [],
  recentHighSeverityOutcomes: [],
  alertsRaisedThisWeek: [],
  lastUpdatedAt: null,
};

export function applyPastorSignal(
  state: PastorBriefingState,
  event: IntelligenceSignalEmitted,
  risk: MemberCareRiskState
): PastorBriefingState {
  let highRiskMembers = state.highRiskMembers;

  if (risk.riskScore >= 8) {
    const highRiskMember = {
      memberId: risk.memberId,
      riskScore: risk.riskScore,
      lastSignalAt: risk.lastSignalAt,
    };
    const memberIndex = highRiskMembers.findIndex(
      member => member.memberId === risk.memberId
    );

    highRiskMembers =
      memberIndex === -1
        ? [...highRiskMembers, highRiskMember]
        : highRiskMembers.map((member, index) =>
            index === memberIndex ? highRiskMember : member
          );
  }

  const recentHighSeverityOutcomes =
    event.payload.signalType === "CARE_CASE_CLOSED_WITH_OUTCOME" &&
    event.payload.severity === "high"
      ? [
          ...state.recentHighSeverityOutcomes,
          {
            memberId: event.memberId,
            careCaseId: event.careCaseId,
            outcomeSeverity: event.payload.severity,
            occurredAt: event.occurredAt,
          },
        ]
      : state.recentHighSeverityOutcomes;

  const raisedAlerts =
    event.payload.severity === "high" || event.payload.severity === "critical"
      ? [
          ...state.alertsRaisedThisWeek,
          {
            memberId: event.memberId,
            careCaseId: event.careCaseId,
            signalType: event.payload.signalType,
            severity: event.payload.severity,
            occurredAt: event.occurredAt,
          },
        ]
      : state.alertsRaisedThisWeek;
  const cutoff = Date.parse(event.occurredAt) - 7 * 24 * 60 * 60 * 1000;
  const alertsRaisedThisWeek = raisedAlerts.filter(
    alert => Date.parse(alert.occurredAt) >= cutoff
  );

  return {
    highRiskMembers,
    recentHighSeverityOutcomes,
    alertsRaisedThisWeek,
    lastUpdatedAt: event.occurredAt,
  };
}

export class PastorBriefingProjection {
  private state: PastorBriefingState;

  constructor(initial?: PastorBriefingState) {
    this.state = initial ?? { ...initialState };
  }

  public apply(
    event: IntelligenceSignalEmitted,
    risk: MemberCareRiskState
  ): void {
    this.state = applyPastorSignal(this.state, event, risk);
  }

  public getState(): PastorBriefingState {
    return this.state;
  }
}