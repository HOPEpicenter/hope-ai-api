import type { PastoralBriefingInputs } from "./pastoralBriefing.inputs";

export type WeeklyPastoralBriefing = {
  generatedAt: string;
  pastoralFocus: string;
  ministryHealth: { status: string; overallScore: number; alertCount: number };
  workloadDistribution: { total: number; urgent: number; high: number; medium: number; low: number; assigned: number; unassigned: number; byPastor: Record<string, number> };
  coachingThemes: readonly string[];
  recommendedActions: readonly string[];
};

export function buildWeeklyPastoralBriefing(input: PastoralBriefingInputs): WeeklyPastoralBriefing {
  const plans = input.workloadMemberPlans;
  const byPastor: Record<string, number> = {};
  for (const plan of plans) if (plan.pastorId) byPastor[plan.pastorId] = (byPastor[plan.pastorId] ?? 0) + 1;
  const coaching = [input.careCoaching, input.formationCoaching, input.servingCoaching, input.communityCoaching, input.givingCoaching, input.attendanceCoaching, input.engagementCoaching].flat();
  const coachingThemes = [...new Set(coaching.flatMap((item) => item.concerns))].slice(0, 3);
  return {
    generatedAt: input.generatedAt,
    pastoralFocus: input.memberJourneyNarrative.pastoralResponse,
    ministryHealth: { status: input.ministryHealthSummary.status, overallScore: input.ministryHealthSummary.overallScore, alertCount: input.ministryHealthSummary.alertCount },
    workloadDistribution: { total: plans.length, urgent: plans.filter((plan) => plan.priority === "urgent").length, high: plans.filter((plan) => plan.priority === "high").length, medium: plans.filter((plan) => plan.priority === "medium").length, low: plans.filter((plan) => plan.priority === "low").length, assigned: plans.filter((plan) => plan.status === "assigned").length, unassigned: plans.filter((plan) => plan.status === "unassigned").length, byPastor },
    coachingThemes,
    recommendedActions: plans.filter((plan) => plan.priority === "urgent" || plan.priority === "high").slice(0, 3).map((plan) => `${plan.memberId}: ${plan.action} ${plan.timeWindow}.`)
  };
}