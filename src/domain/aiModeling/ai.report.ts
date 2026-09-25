import { buildAiFeatureVector, type AiAnalyticsBundle, type AiFeatureVector } from "./ai.features";
import { buildAiInsights, type AiInsight } from "./ai.insights";
import { buildAiPredictions, type AiPredictions } from "./ai.modeling";
import { buildAiRecommendations, type AiRecommendation } from "./ai.recommendations";

export type AiMemberReport = {
  memberId: string;
  features: AiFeatureVector;
  predictions: AiPredictions;
  insights: AiInsight[];
  recommendations: AiRecommendation[];
};

export function buildAiMemberReport(memberId: string, analytics: AiAnalyticsBundle): AiMemberReport {
  const features = buildAiFeatureVector(memberId, analytics);
  const predictions = buildAiPredictions(features);
  const insights = buildAiInsights(features, predictions);
  return { memberId, features, predictions, insights, recommendations: buildAiRecommendations(predictions, insights) };
}