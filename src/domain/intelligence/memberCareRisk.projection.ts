import type { IntelligenceSignalEmitted } from "../../contracts/intelligenceSignal.v1";

export type MemberCareRiskState = {
  memberId: string;
  riskScore: number;
  openHighPriorityCases: number;
  stalledCases: number;
  lastOutcomeSeverity: "low" | "medium" | "high" | null;
  lastSignalAt: string | null;
};

const initialState: MemberCareRiskState = {
  memberId: "",
  riskScore: 0,
  openHighPriorityCases: 0,
  stalledCases: 0,
  lastOutcomeSeverity: null,
  lastSignalAt: null,
};

function getRiskScore(state: MemberCareRiskState): number {
  return (
    state.openHighPriorityCases * 3 +
    state.stalledCases * 5 +
    (state.lastOutcomeSeverity === "high" ? 4 : 0)
  );
}

function getOutcomeSeverity(
  severity: IntelligenceSignalEmitted["payload"]["severity"]
): MemberCareRiskState["lastOutcomeSeverity"] {
  return severity === "low" || severity === "medium" || severity === "high"
    ? severity
    : null;
}

export function applyCareSignal(
  state: MemberCareRiskState,
  event: IntelligenceSignalEmitted
): MemberCareRiskState {
  let openHighPriorityCases = state.openHighPriorityCases;
  let stalledCases = state.stalledCases;
  let lastOutcomeSeverity = state.lastOutcomeSeverity;

  switch (event.payload.signalType) {
    case "CARE_CASE_OPENED":
      if (event.payload.severity === "high") {
        openHighPriorityCases += 1;
      }
      break;
    case "CARE_CASE_STALLED":
      stalledCases += 1;
      break;
    case "CARE_CASE_CLOSED_WITH_OUTCOME":
      lastOutcomeSeverity = getOutcomeSeverity(event.payload.severity);
      if (event.payload.severity === "high") {
        openHighPriorityCases = Math.max(0, openHighPriorityCases - 1);
      }
      break;
    case "CARE_CASE_CLOSED":
      openHighPriorityCases = Math.max(0, openHighPriorityCases - 1);
      break;
  }

  const nextState: MemberCareRiskState = {
    memberId: event.memberId,
    riskScore: 0,
    openHighPriorityCases,
    stalledCases,
    lastOutcomeSeverity,
    lastSignalAt: event.occurredAt,
  };

  return { ...nextState, riskScore: getRiskScore(nextState) };
}

export class MemberCareRiskProjection {
  private state: MemberCareRiskState;

  constructor(initial?: MemberCareRiskState) {
    this.state = initial ?? { ...initialState };
  }

  public apply(event: IntelligenceSignalEmitted): void {
    this.state = applyCareSignal(this.state, event);
  }

  public getState(): MemberCareRiskState {
    return this.state;
  }
}