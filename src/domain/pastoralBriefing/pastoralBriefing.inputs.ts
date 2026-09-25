import type { MemberJourneyNarrative } from "../memberJourney/memberJourney.narrative";
import type { MinistryHealthAnalytics } from "../ministryHealth/ministryHealth.analytics";
import type { PredictiveMemberIntelligence } from "../predictiveIntelligence/predictive.report";
import type { PastoralWorkloadSchedule } from "../workloadOptimization/workload.schedule";

export type PastoralBriefingCoaching = {
  memberId: string;
  coachingPriority: "low" | "medium" | "high";
  encouragement: readonly string[];
  concerns: readonly string[];
  recommendedNextStep: string | null;
};

export type PastoralBriefingTimelineEvent = {
  memberId: string;
  occurredAt: string;
  domain: "formation" | "care" | "serving" | "community" | "giving" | "attendance" | "engagement";
  type: string;
  summary: string;
};

export type PastoralBriefingInputs = {
  generatedAt: string;
  predictiveMemberIntelligence: readonly PredictiveMemberIntelligence[];
  workloadMemberPlans: readonly PastoralWorkloadSchedule[];
  memberJourneyNarrative: MemberJourneyNarrative;
  memberJourneySummary: string;
  ministryHealthSummary: { status: "healthy" | "watch" | "attention"; overallScore: number; alertCount: number };
  ministryHealthAnalytics: MinistryHealthAnalytics;
  careCoaching: readonly PastoralBriefingCoaching[];
  formationCoaching: readonly PastoralBriefingCoaching[];
  servingCoaching: readonly PastoralBriefingCoaching[];
  communityCoaching: readonly PastoralBriefingCoaching[];
  givingCoaching: readonly PastoralBriefingCoaching[];
  attendanceCoaching: readonly PastoralBriefingCoaching[];
  engagementCoaching: readonly PastoralBriefingCoaching[];
  recentTimelineEvents: readonly PastoralBriefingTimelineEvent[];
};

export type PastoralBriefingInputSource = Omit<PastoralBriefingInputs, "recentTimelineEvents"> & {
  recentTimelineEvents?: readonly PastoralBriefingTimelineEvent[];
};

export function buildPastoralBriefingInputs(source: PastoralBriefingInputSource): PastoralBriefingInputs {
  return {
    ...source,
    predictiveMemberIntelligence: [...source.predictiveMemberIntelligence].sort((left, right) => right.priority.priorityScore - left.priority.priorityScore || left.risk.memberId.localeCompare(right.risk.memberId)),
    workloadMemberPlans: [...source.workloadMemberPlans].sort((left, right) => left.memberId.localeCompare(right.memberId)),
    careCoaching: [...source.careCoaching], formationCoaching: [...source.formationCoaching], servingCoaching: [...source.servingCoaching],
    communityCoaching: [...source.communityCoaching], givingCoaching: [...source.givingCoaching], attendanceCoaching: [...source.attendanceCoaching], engagementCoaching: [...source.engagementCoaching],
    recentTimelineEvents: [...(source.recentTimelineEvents ?? [])].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || left.memberId.localeCompare(right.memberId) || left.type.localeCompare(right.type))
  };
}