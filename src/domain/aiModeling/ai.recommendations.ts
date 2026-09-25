import type { AiInsight } from "./ai.insights";
import type { AiPredictions } from "./ai.modeling";

export type AiRecommendation = {
  memberId: string;
  priority: "high" | "medium" | "low";
  action: "schedule_care_followup" | "reconnect_member" | "invite_to_next_step" | "continue_observation";
  rationale: string;
  factors: string[];
};

export function buildAiRecommendations(
  predictions: AiPredictions,
  insights: readonly AiInsight[]
): AiRecommendation[] {
  const factors = insights.flatMap((insight) => insight.factors).filter(Boolean);
  if (predictions.scores.careNeed >= 0.6) {
    return [{ memberId: predictions.memberId, priority: "high", action: "schedule_care_followup", rationale: "Care need is elevated by deterministic cross-domain signals.", factors }];
  }
  if (predictions.scores.retentionRisk >= 0.6) {
    return [{ memberId: predictions.memberId, priority: "high", action: "reconnect_member", rationale: "Retention risk is elevated by attendance, engagement, and alert signals.", factors }];
  }
  if (predictions.scores.growthPotential >= 0.6 || predictions.scores.engagementLikelihood >= 0.6) {
    return [{ memberId: predictions.memberId, priority: "medium", action: "invite_to_next_step", rationale: "Growth and engagement signals support a next-step invitation.", factors }];
  }
  return [{ memberId: predictions.memberId, priority: "low", action: "continue_observation", rationale: "No elevated deterministic action signal is present.", factors }];
}