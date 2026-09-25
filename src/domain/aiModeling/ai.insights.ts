import type { AiFeatureVector } from "./ai.features";
import type { AiPredictions } from "./ai.modeling";

export type AiInsight = {
  memberId: string;
  category: "risk" | "strength" | "opportunity";
  severity: "high" | "medium" | "low";
  message: string;
  factors: string[];
};

export function buildAiInsights(
  features: AiFeatureVector,
  predictions: AiPredictions
): AiInsight[] {
  const insights: AiInsight[] = [];
  if (predictions.scores.retentionRisk >= 0.6) {
    insights.push({ memberId: features.memberId, category: "risk", severity: "high", message: "Connection risk is elevated across attendance, engagement, or active alerts.", factors: [...features.riskClusters, ...features.stallRiskIndicators] });
  }
  if (predictions.scores.careNeed >= 0.5) {
    insights.push({ memberId: features.memberId, category: "risk", severity: "medium", message: "Care follow-through needs attention.", factors: features.stallRiskIndicators });
  }
  if (predictions.scores.growthPotential >= 0.6) {
    insights.push({ memberId: features.memberId, category: "strength", severity: "low", message: "Current participation signals support continued growth.", factors: [...features.strengthClusters, ...features.growthIndicators] });
  }
  if (predictions.scores.engagementLikelihood >= 0.6) {
    insights.push({ memberId: features.memberId, category: "opportunity", severity: "low", message: "A timely engagement invitation is likely to be well received.", factors: features.growthIndicators });
  }
  if (insights.length === 0) {
    insights.push({ memberId: features.memberId, category: "opportunity", severity: "low", message: "No elevated cross-domain signal is present; continue observing current patterns.", factors: predictions.explainableFactors });
  }
  return insights;
}