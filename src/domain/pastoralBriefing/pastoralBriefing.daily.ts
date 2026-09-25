import type { PastoralBriefingInputs } from "./pastoralBriefing.inputs";

export type DailyPastoralBriefing = {
  generatedAt: string;
  urgency: { level: "urgent" | "high" | "normal"; summary: string; memberIds: readonly string[] };
  trendSnapshot: { direction: "improving" | "stable" | "declining"; summary: string };
  actions: readonly { memberId: string; action: string; rationale: string }[];
  scriptureEncouragement: null;
};

export function buildDailyPastoralBriefing(input: PastoralBriefingInputs): DailyPastoralBriefing {
  const urgent = input.workloadMemberPlans.filter((plan) => plan.priority === "urgent" || plan.timeWindow === "today");
  const highRisk = input.predictiveMemberIntelligence.filter((member) => member.priority.priority === "critical" || member.priority.priority === "high");
  const candidateIds = [...new Set([...urgent.map((plan) => plan.memberId), ...highRisk.map((member) => member.risk.memberId)])];
  const level = urgent.length || highRisk.some((member) => member.priority.priority === "critical") ? "urgent" : candidateIds.length ? "high" : "normal";
  const declining = input.memberJourneyNarrative.direction === "needs_attention" || input.ministryHealthSummary.status === "attention";
  const improving = input.memberJourneyNarrative.direction === "growing" && input.ministryHealthSummary.status === "healthy";
  const actions = input.workloadMemberPlans.filter((plan) => candidateIds.includes(plan.memberId)).slice(0, 2).map((plan) => ({ memberId: plan.memberId, action: plan.action, rationale: `${plan.primaryDriver} requires ${plan.timeWindow}.` }));
  return {
    generatedAt: input.generatedAt,
    urgency: { level, summary: candidateIds.length ? `${candidateIds.length} member(s) need prioritized pastoral attention.` : "No urgent pastoral priorities are currently identified.", memberIds: candidateIds },
    trendSnapshot: { direction: declining ? "declining" : improving ? "improving" : "stable", summary: `${input.memberJourneyNarrative.summary} Ministry health is ${input.ministryHealthSummary.status}.` },
    actions,
    scriptureEncouragement: null
  };
}