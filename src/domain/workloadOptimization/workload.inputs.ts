import type { MinistryHealthAnalytics } from "../ministryHealth/ministryHealth.analytics";
import type { PredictiveMemberIntelligence } from "../predictiveIntelligence/predictive.report";

export type WorkloadCoaching = {
  memberId: string;
  coachingPriority: "low" | "medium" | "high";
  concerns?: readonly string[];
};

export type MemberJourneySummaryInput = {
  memberId?: string;
  tone?: "encouraging" | "balanced" | "concerned";
};

export type PastoralWorkloadInput = {
  memberId: string;
  priorityScore: number;
  careNeedScore: number;
  stallRiskScore: number;
  growthPotentialScore: number;
  leadershipPotentialScore: number;
  pastoralComplexityScore: number;
};

export type WorkloadFusionInput = {
  predictiveMemberIntelligence: readonly PredictiveMemberIntelligence[];
  memberJourneySummary?: MemberJourneySummaryInput | readonly MemberJourneySummaryInput[];
  careCoaching?: readonly WorkloadCoaching[];
  formationCoaching?: readonly WorkloadCoaching[];
  servingCoaching?: readonly WorkloadCoaching[];
  communityCoaching?: readonly WorkloadCoaching[];
  givingCoaching?: readonly WorkloadCoaching[];
  attendanceCoaching?: readonly WorkloadCoaching[];
  engagementCoaching?: readonly WorkloadCoaching[];
  ministryHealthAnalytics: MinistryHealthAnalytics;
};

function bounded(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function priorityWeight(priority: WorkloadCoaching["coachingPriority"]): number {
  return priority === "high" ? 1 : priority === "medium" ? 0.6 : 0.25;
}

function journeyFor(
  summary: WorkloadFusionInput["memberJourneySummary"],
  memberId: string
): MemberJourneySummaryInput | undefined {
  if (Array.isArray(summary)) {
    return (summary as readonly MemberJourneySummaryInput[]).find(
      (item) => item.memberId === memberId
    );
  }
  const item = summary as MemberJourneySummaryInput | undefined;
  return item?.memberId === undefined || item.memberId === memberId ? item : undefined;
}

function healthRisk(analytics: MinistryHealthAnalytics): number {
  const score = analytics.overallScore > 1
    ? analytics.overallScore / 100
    : analytics.overallScore;
  return bounded(1 - score);
}

export function buildPastoralWorkloadInputs(
  input: WorkloadFusionInput
): PastoralWorkloadInput[] {
  const coachingByDomain = [
    input.careCoaching ?? [],
    input.formationCoaching ?? [],
    input.servingCoaching ?? [],
    input.communityCoaching ?? [],
    input.givingCoaching ?? [],
    input.attendanceCoaching ?? [],
    input.engagementCoaching ?? []
  ];
  const organizationRisk = healthRisk(input.ministryHealthAnalytics);

  return input.predictiveMemberIntelligence.map((intelligence) => {
    const memberId = intelligence.risk.memberId;
    const memberCoaching = coachingByDomain
      .map((domain) => domain.find((coaching) => coaching.memberId === memberId))
      .filter((coaching): coaching is WorkloadCoaching => Boolean(coaching));
    const activeDomains = memberCoaching.filter(
      (coaching) => coaching.coachingPriority !== "low" || (coaching.concerns?.length ?? 0) > 0
    ).length;
    const pastoralComplexityScore = bounded(activeDomains / coachingByDomain.length);
    const coachingRisk = memberCoaching.length
      ? memberCoaching.reduce((sum, coaching) => sum + priorityWeight(coaching.coachingPriority), 0) / memberCoaching.length
      : 0;
    const journey = journeyFor(input.memberJourneySummary, memberId);
    const journeyRisk = journey?.tone === "concerned" ? 0.15 : journey?.tone === "balanced" ? 0.05 : 0;
    const risk = intelligence.risk;
    const priorityScore = bounded(
      intelligence.priority.priorityScore * 0.55 +
      pastoralComplexityScore * 0.2 +
      coachingRisk * 0.15 +
      organizationRisk * 0.1 +
      journeyRisk
    );

    return {
      memberId,
      priorityScore,
      careNeedScore: bounded(risk.careNeedScore),
      stallRiskScore: bounded(risk.stallRiskScore),
      growthPotentialScore: bounded(risk.growthPotentialScore),
      leadershipPotentialScore: bounded(risk.leadershipPotentialScore),
      pastoralComplexityScore
    };
  }).sort((left, right) => right.priorityScore - left.priorityScore || left.memberId.localeCompare(right.memberId));
}

export function buildPastoralWorkloadInput(
  memberId: string,
  input: WorkloadFusionInput
): PastoralWorkloadInput | null {
  return buildPastoralWorkloadInputs(input).find((item) => item.memberId === memberId) ?? null;
}