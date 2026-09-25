import type { PredictivePriorityRanking } from "./predictive.priorityRanking";
import type { PredictiveMemberRisk } from "./predictive.riskEngine";

export type PredictiveAction = {
  memberId: string;
  action: "pastoral_outreach" | "care_follow_up" | "reengagement_invitation" | "growth_next_step" | "leadership_discernment" | "monitor";
  horizon: "within_24_hours" | "within_7_days" | "within_30_days";
  rationale: string;
};

export function buildPredictiveActions(risk: PredictiveMemberRisk, priority: PredictivePriorityRanking): PredictiveAction[] {
  const actions: PredictiveAction[] = [];
  if (priority.priority === "critical") {
    actions.push({ memberId: risk.memberId, action: "pastoral_outreach", horizon: "within_24_hours", rationale: priority.rationale });
  } else if (risk.careNeedScore >= 0.65) {
    actions.push({ memberId: risk.memberId, action: "care_follow_up", horizon: "within_7_days", rationale: "Care need score is at least 0.65." });
  } else if (Math.max(risk.stallRiskScore, risk.disengagementRiskScore) >= 0.65) {
    actions.push({ memberId: risk.memberId, action: "reengagement_invitation", horizon: "within_7_days", rationale: "Stall or disengagement risk is at least 0.65." });
  }
  if (risk.growthPotentialScore >= 0.7) actions.push({ memberId: risk.memberId, action: "growth_next_step", horizon: "within_30_days", rationale: "Growth potential score is at least 0.70." });
  if (risk.leadershipPotentialScore >= 0.75) actions.push({ memberId: risk.memberId, action: "leadership_discernment", horizon: "within_30_days", rationale: "Leadership potential score is at least 0.75." });
  return actions.length ? actions : [{ memberId: risk.memberId, action: "monitor", horizon: "within_30_days", rationale: "No predictive threshold currently requires intervention." }];
}