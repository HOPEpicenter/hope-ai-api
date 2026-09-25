import type { AiPredictions } from "../aiModeling/ai.modeling";
import type { MinistryHealthAnalytics } from "../ministryHealth/ministryHealth.analytics";

export type PredictiveMemberRisk = {
  memberId: string;
  stallRiskScore: number;
  careNeedScore: number;
  disengagementRiskScore: number;
  growthPotentialScore: number;
  leadershipPotentialScore: number;
  context: string[];
};

export type PredictiveRiskContext = {
  ministryHealthAnalytics?: MinistryHealthAnalytics;
};

function bounded(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function healthRisk(analytics?: MinistryHealthAnalytics): number {
  const overall = analytics?.overallScore ?? 100;
  return bounded(1 - (overall > 1 ? overall / 100 : overall));
}

export function buildPredictiveMemberRisk(
  prediction: AiPredictions,
  context: PredictiveRiskContext = {}
): PredictiveMemberRisk {
  const clusterRisk = prediction.riskClusters.length > 0 ? 0.1 : 0;
  const clusterStrength = prediction.strengthClusters.length > 0 ? 0.1 : 0;
  const ministryRisk = healthRisk(context.ministryHealthAnalytics);
  const scores = prediction.scores;
  const stallRiskScore = bounded(
    scores.retentionRisk * 0.65 + scores.careNeed * 0.2 + ministryRisk * 0.1 + clusterRisk * 0.05
  );
  const careNeedScore = bounded(
    scores.careNeed * 0.75 + scores.retentionRisk * 0.15 + ministryRisk * 0.1
  );
  const disengagementRiskScore = bounded(
    (1 - scores.engagementLikelihood) * 0.65 + scores.retentionRisk * 0.25 + clusterRisk * 0.1
  );
  const growthPotentialScore = bounded(
    scores.growthPotential * 0.8 + scores.engagementLikelihood * 0.15 + clusterStrength * 0.05
  );
  const leadershipPotentialScore = bounded(
    scores.growthPotential * 0.5 + scores.engagementLikelihood * 0.35 + clusterStrength * 0.15
  );

  return {
    memberId: prediction.memberId,
    stallRiskScore,
    careNeedScore,
    disengagementRiskScore,
    growthPotentialScore,
    leadershipPotentialScore,
    context: [
      `Retention risk ${scores.retentionRisk.toFixed(2)} and care need ${scores.careNeed.toFixed(2)} determine stall and care risk.`,
      `Engagement likelihood ${scores.engagementLikelihood.toFixed(2)} determines disengagement risk.`,
      `Growth potential ${scores.growthPotential.toFixed(2)} and engagement likelihood determine leadership potential.`,
      ...prediction.riskClusters,
      ...prediction.strengthClusters
    ]
  };
}

export type PredictiveMemberArrays = {
  highRiskMembers: PredictiveMemberRisk[];
  careMembers: PredictiveMemberRisk[];
  growthMembers: PredictiveMemberRisk[];
  leadershipMembers: PredictiveMemberRisk[];
};

export function buildPredictiveMemberArrays(
  members: readonly PredictiveMemberRisk[]
): PredictiveMemberArrays {
  return {
    highRiskMembers: members.filter((member) => Math.max(member.stallRiskScore, member.disengagementRiskScore) >= 0.7),
    careMembers: members.filter((member) => member.careNeedScore >= 0.7),
    growthMembers: members.filter((member) => member.growthPotentialScore >= 0.7),
    leadershipMembers: members.filter((member) => member.leadershipPotentialScore >= 0.7)
  };
}