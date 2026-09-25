import type { MemberJourneyAggregate } from "./memberJourney.aggregate";

export type MemberJourneyNarrativeTone = "pastoral" | "encouraging" | "attentive";
export type MemberJourneyNarrative = { tone: MemberJourneyNarrativeTone; summary: string; currentSeason: string; direction: "growing" | "steady" | "needs_attention"; pastoralResponse: string };

export function buildMemberJourneyNarrative(aggregate: MemberJourneyAggregate): MemberJourneyNarrative {
  const risk = aggregate.aiPredictions?.scores.retentionRisk ?? 0;
  const growth = aggregate.aiPredictions?.scores.growthPotential ?? 0;
  const direction = risk >= 0.65 || aggregate.riskMoments.length > aggregate.recoveryMoments.length ? "needs_attention" : growth >= 0.6 || aggregate.growthMoments.length > 0 ? "growing" : "steady";
  const tone: MemberJourneyNarrativeTone = direction === "needs_attention" ? "attentive" : direction === "growing" ? "encouraging" : "pastoral";
  const latest = aggregate.timeline[aggregate.timeline.length - 1];
  const currentSeason = latest ? `${latest.domain} activity is currently most recent.` : "There is not yet enough recorded activity to describe a current season.";
  const summary = aggregate.timeline.length ? `This journey includes ${aggregate.timeline.length} recorded moment${aggregate.timeline.length === 1 ? "" : "s"}, with ${aggregate.growthMoments.length} growth signal${aggregate.growthMoments.length === 1 ? "" : "s"} and ${aggregate.riskMoments.length} moment${aggregate.riskMoments.length === 1 ? "" : "s"} needing care.` : "No journey events have been recorded yet; begin with a personal, unhurried connection.";
  const pastoralResponse = direction === "needs_attention" ? "Reach out personally, listen carefully, and agree on one manageable next step." : direction === "growing" ? "Celebrate the progress and invite a fitting next step in community and formation." : "Continue a steady relationship and make space for the member to name their next step.";
  return { tone, summary, currentSeason, direction, pastoralResponse };
}