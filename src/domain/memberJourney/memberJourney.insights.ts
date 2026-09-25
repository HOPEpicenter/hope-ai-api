import type { MemberJourneyAggregate } from "./memberJourney.aggregate";

export type MemberJourneyInsights = { strengths: string[]; risks: string[]; opportunities: string[]; careSignals: string[]; growthSignals: string[]; engagementSignals: string[]; ministryHealthSignals: string[] };
export function buildMemberJourneyInsights(aggregate: MemberJourneyAggregate): MemberJourneyInsights {
  const prediction = aggregate.aiPredictions;
  return {
    strengths: [...(prediction?.strengthClusters ?? []), ...aggregate.recoveryMoments.map((event) => `${event.domain} recovery: ${event.eventType}`)].sort(),
    risks: [...(prediction?.riskClusters ?? []), ...aggregate.riskMoments.map((event) => `${event.domain} risk: ${event.eventType}`)].sort(),
    opportunities: aggregate.growthMoments.map((event) => `${event.domain} opportunity: ${event.eventType}`).sort(),
    careSignals: aggregate.timeline.filter((event) => event.domain === "care").map((event) => event.eventType).sort(),
    growthSignals: aggregate.growthMoments.map((event) => event.eventType).sort(),
    engagementSignals: aggregate.timeline.filter((event) => event.domain === "engagement" || event.domain === "attendance" || event.domain === "community").map((event) => `${event.domain}: ${event.eventType}`).sort(),
    ministryHealthSignals: aggregate.ministryHealthContext.map((event) => `${event.eventType}: ${String(event.details.message ?? event.details.score ?? "observed")}`).sort()
  };
}