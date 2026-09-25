import type { PastoralBriefingInputs } from "./pastoralBriefing.inputs";

export type PastoralBriefingEventCategory = "predictive_urgency" | "workload_assignment" | "journey_attention" | "ministry_health_alert" | "timeline_signal";
export type PastoralBriefingEvent = { category: PastoralBriefingEventCategory; memberId: string | null; summary: string; action: string; occurredAt: string };

export function buildEventPastoralBriefings(input: PastoralBriefingInputs): PastoralBriefingEvent[] {
  const events: PastoralBriefingEvent[] = [];
  for (const member of input.predictiveMemberIntelligence.filter((item) => item.priority.priority === "critical" || item.priority.priority === "high")) events.push({ category: "predictive_urgency", memberId: member.risk.memberId, summary: member.priority.rationale, action: member.actions[0]?.action ?? "Review predictive risk and contact the member.", occurredAt: input.generatedAt });
  for (const plan of input.workloadMemberPlans.filter((item) => item.priority === "urgent" || item.status === "unassigned")) events.push({ category: "workload_assignment", memberId: plan.memberId, summary: `${plan.priority} workload plan is ${plan.status}.`, action: plan.status === "unassigned" ? "Assign a pastoral owner." : plan.action, occurredAt: input.generatedAt });
  if (input.memberJourneyNarrative.direction === "needs_attention") events.push({ category: "journey_attention", memberId: null, summary: input.memberJourneyNarrative.summary, action: input.memberJourneyNarrative.pastoralResponse, occurredAt: input.generatedAt });
  if (input.ministryHealthSummary.status !== "healthy") events.push({ category: "ministry_health_alert", memberId: null, summary: `Ministry health is ${input.ministryHealthSummary.status} with ${input.ministryHealthSummary.alertCount} alert(s).`, action: "Review ministry health signals and assign an owner.", occurredAt: input.generatedAt });
  for (const timeline of input.recentTimelineEvents.slice(0, 5)) events.push({ category: "timeline_signal", memberId: timeline.memberId, summary: timeline.summary, action: "Review this recent member activity.", occurredAt: timeline.occurredAt });
  return events.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || left.category.localeCompare(right.category) || (left.memberId ?? "").localeCompare(right.memberId ?? ""));
}