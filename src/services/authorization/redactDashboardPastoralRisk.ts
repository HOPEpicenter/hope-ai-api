export type DashboardPastoralRiskView = {
  riskLevel?: unknown;
  riskScore?: unknown;
  attentionState?: unknown;
  followupUrgency?: unknown;
  recommendedAction?: unknown;
  priorityBand?: unknown;
  priorityScore?: unknown;
  priorityReason?: unknown;
  [key: string]: unknown;
};

export type RedactedDashboardPastoralRisk<
  T extends DashboardPastoralRiskView
> = Omit<
  T,
  | "riskLevel"
  | "riskScore"
  | "attentionState"
  | "followupUrgency"
  | "recommendedAction"
  | "priorityBand"
  | "priorityScore"
  | "priorityReason"
> & {
  riskLevel: null;
  riskScore: null;
  attentionState: null;
  followupUrgency: null;
  recommendedAction: null;
  priorityBand: null;
  priorityScore: null;
  priorityReason: null;
};

export function redactDashboardPastoralRisk<
  T extends DashboardPastoralRiskView
>(
  value: T,
  canViewHighRiskAlerts: boolean
): T | RedactedDashboardPastoralRisk<T> {
  if (canViewHighRiskAlerts) {
    return value;
  }

  return {
    ...value,
    riskLevel: null,
    riskScore: null,
    attentionState: null,
    followupUrgency: null,
    recommendedAction: null,
    priorityBand: null,
    priorityScore: null,
    priorityReason: null
  };
}
