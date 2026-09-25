import type { AiFeatureVector } from "./ai.features";

export type AiPredictions = {
  memberId: string;
  scores: {
    retentionRisk: number;
    growthPotential: number;
    careNeed: number;
    engagementLikelihood: number;
  };
  riskClusters: string[];
  strengthClusters: string[];
  explainableFactors: string[];
};

function bounded(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function buildAiPredictions(features: AiFeatureVector): AiPredictions {
  const retentionRisk = bounded(
    (1 - features.scores.overall) * 0.45 +
      (1 - features.scores.attendance) * 0.2 +
      (1 - features.scores.engagement) * 0.2 +
      features.alertDensity * 0.15
  );
  const growthPotential = bounded(
    features.scores.overall * 0.4 +
      features.scores.formation * 0.25 +
      features.scores.community * 0.2 +
      features.trendVelocity * 0.15
  );
  const careNeed = bounded(
    (1 - features.scores.care) * 0.55 +
      features.alertDensity * 0.25 +
      (1 - features.scores.attendance) * 0.2
  );
  const engagementLikelihood = bounded(
    features.scores.engagement * 0.45 +
      features.scores.attendance * 0.25 +
      features.scores.community * 0.2 +
      features.trendVelocity * 0.1
  );
  const explainableFactors = [
    ...features.riskClusters,
    ...features.strengthClusters,
    ...features.stallRiskIndicators,
    ...features.growthIndicators,
    `Trend velocity is ${features.trendVelocity.toFixed(2)} on a 0-1 scale.`,
    `Alert density is ${features.alertDensity.toFixed(2)} on a 0-1 scale.`
  ];

  return {
    memberId: features.memberId,
    scores: { retentionRisk, growthPotential, careNeed, engagementLikelihood },
    riskClusters: features.riskClusters,
    strengthClusters: features.strengthClusters,
    explainableFactors
  };
}