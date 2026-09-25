import type { IntelligenceSignalEmitted } from "../../contracts/intelligenceSignal.v1";
import type { MemberCareRiskState } from "../intelligence/memberCareRisk.projection";

export type CareLeaderBriefingState = {
  highPriorityCases: Array<{
    careCaseId: string;
    memberId: string;
    openedAt: string;
    category?: string;
  }>;
  stalledCases: Array<{
    careCaseId: string;
    memberId: string;
    stalledSince: string;
  }>;
  recentAlerts: Array<{
    signalType: string;
    severity: string;
    occurredAt: string;
    memberId: string;
    careCaseId?: string;
  }>;
  lastUpdatedAt: string | null;
};

const initialState: CareLeaderBriefingState = {
  highPriorityCases: [],
  stalledCases: [],
  recentAlerts: [],
  lastUpdatedAt: null,
};

export function applyCareLeaderSignal(
  state: CareLeaderBriefingState,
  event: IntelligenceSignalEmitted
): CareLeaderBriefingState {
  let highPriorityCases = state.highPriorityCases;
  let stalledCases = state.stalledCases;

  if (
    event.payload.signalType === "CARE_CASE_OPENED" &&
    event.payload.severity === "high" &&
    event.careCaseId &&
    !highPriorityCases.some(careCase => careCase.careCaseId === event.careCaseId)
  ) {
    const category = event.payload.metadata?.category;
    highPriorityCases = [
      ...highPriorityCases,
      {
        careCaseId: event.careCaseId,
        memberId: event.memberId,
        openedAt: event.occurredAt,
        ...(typeof category === "string" ? { category } : {}),
      },
    ];
  }

  if (
    event.payload.signalType === "CARE_CASE_STALLED" &&
    event.careCaseId &&
    !stalledCases.some(careCase => careCase.careCaseId === event.careCaseId)
  ) {
    const stalledSince = event.payload.metadata?.stalledSince;

    if (typeof stalledSince === "string") {
      stalledCases = [
        ...stalledCases,
        {
          careCaseId: event.careCaseId,
          memberId: event.memberId,
          stalledSince,
        },
      ];
    }
  }

  if (
    event.payload.signalType === "CARE_CASE_CLOSED" ||
    event.payload.signalType === "CARE_CASE_CLOSED_WITH_OUTCOME"
  ) {
    highPriorityCases = highPriorityCases.filter(
      careCase => careCase.careCaseId !== event.careCaseId
    );
    stalledCases = stalledCases.filter(
      careCase => careCase.careCaseId !== event.careCaseId
    );
  }

  return {
    highPriorityCases,
    stalledCases,
    recentAlerts: [
      {
        signalType: event.payload.signalType,
        severity: event.payload.severity,
        occurredAt: event.occurredAt,
        memberId: event.memberId,
        careCaseId: event.careCaseId,
      },
      ...state.recentAlerts,
    ].slice(0, 50),
    lastUpdatedAt: event.occurredAt,
  };
}

export class CareLeaderBriefingProjection {
  private state: CareLeaderBriefingState;

  constructor(initial?: CareLeaderBriefingState) {
    this.state = initial ?? { ...initialState };
  }

  public apply(event: IntelligenceSignalEmitted): void {
    this.state = applyCareLeaderSignal(this.state, event);
  }

  public getState(): CareLeaderBriefingState {
    return this.state;
  }
}