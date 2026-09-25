import type { PredictiveMemberRisk } from "./predictive.riskEngine";

export type PredictivePriority = "critical" | "high" | "medium" | "low";

export type PredictivePriorityRanking = {
  memberId: string;
  priority: PredictivePriority;
  priorityScore: number;
  rationale: string;
};

export function rankPredictivePriority(risk: PredictiveMemberRisk): PredictivePriorityRanking {
  const riskScore = Math.max(risk.stallRiskScore, risk.careNeedScore, risk.disengagementRiskScore);
  const priorityScore = Math.max(riskScore, risk.growthPotentialScore * 0.7, risk.leadershipPotentialScore * 0.65);
  const priority: PredictivePriority =
    riskScore >= 0.8 ? "critical" :
    riskScore >= 0.65 ? "high" :
    priorityScore >= 0.45 ? "medium" : "low";
  const driver = riskScore >= risk.growthPotentialScore && riskScore >= risk.leadershipPotentialScore
    ? "care or disengagement risk"
    : risk.leadershipPotentialScore >= risk.growthPotentialScore
      ? "leadership potential"
      : "growth potential";
  return {
    memberId: risk.memberId,
    priority,
    priorityScore,
    rationale: `${driver} is the strongest deterministic signal at ${priorityScore.toFixed(2)}.`
  };
}

export function rankPredictiveMembers(members: readonly PredictiveMemberRisk[]): PredictivePriorityRanking[] {
  return members.map(rankPredictivePriority).sort((left, right) =>
    right.priorityScore - left.priorityScore || left.memberId.localeCompare(right.memberId)
  );
}