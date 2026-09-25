import type { PredictiveMemberRisk } from "./predictive.riskEngine";
import type { PredictivePriorityRanking } from "./predictive.priorityRanking";

export type PredictiveInsight = {
  memberId: string;
  type: "risk" | "care" | "growth" | "leadership";
  message: string;
  context: string[];
};

export function buildPredictiveInsights(
  risk: PredictiveMemberRisk,
  priority: PredictivePriorityRanking
): PredictiveInsight[] {
  const insights: PredictiveInsight[] = [];
  if (Math.max(risk.stallRiskScore, risk.disengagementRiskScore) >= 0.7) {
    insights.push({ memberId: risk.memberId, type: "risk", message: `${priority.priority} priority: stall or disengagement risk needs attention.`, context: risk.context });
  }
  if (risk.careNeedScore >= 0.7) insights.push({ memberId: risk.memberId, type: "care", message: "Care need is elevated by the current AI prediction.", context: risk.context });
  if (risk.growthPotentialScore >= 0.7) insights.push({ memberId: risk.memberId, type: "growth", message: "Growth potential supports a clear next-step invitation.", context: risk.context });
  if (risk.leadershipPotentialScore >= 0.7) insights.push({ memberId: risk.memberId, type: "leadership", message: "Leadership potential supports a discernment conversation.", context: risk.context });
  return insights;
}