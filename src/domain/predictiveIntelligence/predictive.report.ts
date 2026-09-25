import type { AiPredictions } from "../aiModeling/ai.modeling";
import type { AiRecommendation } from "../aiModeling/ai.recommendations";
import type { MinistryHealthAnalytics } from "../ministryHealth/ministryHealth.analytics";
import { buildPredictiveActions, type PredictiveAction } from "./predictive.actions";
import { buildPredictiveInsights, type PredictiveInsight } from "./predictive.insights";
import { rankPredictiveMembers, rankPredictivePriority, type PredictivePriorityRanking } from "./predictive.priorityRanking";
import { buildPredictiveMemberArrays, buildPredictiveMemberRisk, type PredictiveMemberArrays, type PredictiveMemberRisk } from "./predictive.riskEngine";

export type PredictiveMemberIntelligence = {
  risk: PredictiveMemberRisk;
  priority: PredictivePriorityRanking;
  insights: PredictiveInsight[];
  actions: PredictiveAction[];
};

export type PredictiveLeadershipIntelligence = {
  summary: PredictiveMemberArrays & { totalMembers: number; ministryHealthStatus: string };
  actions: PredictiveAction[];
  report: { members: PredictiveMemberIntelligence[]; rankings: PredictivePriorityRanking[]; aiInsights: unknown[]; aiRecommendations: AiRecommendation[] };
};

export function buildPredictiveMemberIntelligence(
  predictions: readonly AiPredictions[],
  ministryHealthAnalytics: MinistryHealthAnalytics
): PredictiveMemberIntelligence[] {
  return predictions.map((prediction) => {
    const risk = buildPredictiveMemberRisk(prediction, { ministryHealthAnalytics });
    const priority = rankPredictivePriority(risk);
    return { risk, priority, insights: buildPredictiveInsights(risk, priority), actions: buildPredictiveActions(risk, priority) };
  });
}

export function buildPredictiveLeadershipIntelligence(input: {
  members: readonly PredictiveMemberIntelligence[];
  ministryHealthAnalytics: MinistryHealthAnalytics;
  aiInsights?: readonly unknown[];
  aiRecommendations?: readonly AiRecommendation[];
}): PredictiveLeadershipIntelligence {
  const risks = input.members.map((member) => member.risk);
  const rankings = rankPredictiveMembers(risks);
  return {
    summary: { ...buildPredictiveMemberArrays(risks), totalMembers: risks.length, ministryHealthStatus: input.ministryHealthAnalytics.status },
    actions: input.members.flatMap((member) => member.actions).sort((left, right) => left.memberId.localeCompare(right.memberId) || left.action.localeCompare(right.action)),
    report: { members: [...input.members], rankings, aiInsights: [...(input.aiInsights ?? [])], aiRecommendations: [...(input.aiRecommendations ?? [])] }
  };
}