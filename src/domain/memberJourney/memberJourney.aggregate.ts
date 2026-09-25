import type { AiPredictions } from "../aiModeling/ai.modeling";
import type { PredictiveMemberIntelligence } from "../predictiveIntelligence/predictive.report";

export type JourneyDomain = "formation" | "care" | "serving" | "community" | "giving" | "attendance" | "engagement" | "ministryHealth";
export type JourneySeverity = "info" | "low" | "medium" | "high" | "critical";
export type JourneyEvent = { occurredAt: string; domain: JourneyDomain; eventType: string; severity: JourneySeverity; details: Record<string, unknown> };
export type JourneyTimelineCollection = { memberId?: string; items: readonly Record<string, unknown>[] };

export type MemberJourneyAggregateInput = {
  memberId: string;
  formation?: readonly JourneyTimelineCollection[]; formationTimeline?: readonly JourneyTimelineCollection[];
  care?: readonly JourneyTimelineCollection[]; careTimeline?: readonly JourneyTimelineCollection[];
  serving?: readonly JourneyTimelineCollection[]; servingTimeline?: readonly JourneyTimelineCollection[];
  community?: readonly JourneyTimelineCollection[]; communityTimeline?: readonly JourneyTimelineCollection[];
  giving?: readonly JourneyTimelineCollection[]; givingTimeline?: readonly JourneyTimelineCollection[];
  attendance?: readonly JourneyTimelineCollection[]; attendanceTimeline?: readonly JourneyTimelineCollection[];
  engagement?: readonly JourneyTimelineCollection[]; engagementTimeline?: readonly JourneyTimelineCollection[];
  ministryHealthTimeline?: readonly Record<string, unknown>[];
  aiPredictions?: readonly AiPredictions[];
  predictiveMemberIntelligence?: readonly PredictiveMemberIntelligence[];
};

export type MemberJourneyAggregate = {
  memberId: string;
  timeline: JourneyEvent[];
  unifiedTimeline: JourneyEvent[];
  keyMoments: JourneyEvent[];
  turningPoints: JourneyEvent[];
  recoveryMoments: JourneyEvent[];
  riskMoments: JourneyEvent[];
  growthMoments: JourneyEvent[];
  aiPredictions: AiPredictions | null;
  predictiveMemberIntelligence: PredictiveMemberIntelligence | null;
  ministryHealthContext: JourneyEvent[];
};

function severity(item: Record<string, unknown>): JourneySeverity {
  const value = String(item.severity ?? item.priority ?? "").toLowerCase();
  if (value === "critical" || value === "urgent") return "critical";
  if (value === "high") return "high";
  if (value === "medium" || value === "watch") return "medium";
  if (value === "low") return "low";
  const type = String(item.type ?? item.eventType ?? "").toLowerCase();
  return type.includes("stalled") || type.includes("alert") ? "high" : "info";
}

function normalize(domain: JourneyDomain, item: Record<string, unknown>): JourneyEvent {
  const { occurredAt, type, eventType, severity: _severity, priority: _priority, ...details } = item;
  return {
    occurredAt: typeof occurredAt === "string" && occurredAt ? occurredAt : "1970-01-01T00:00:00.000Z",
    domain,
    eventType: String(eventType ?? type ?? "observed"),
    severity: severity(item),
    details
  };
}

function selectCollections(input: MemberJourneyAggregateInput, domain: Exclude<JourneyDomain, "ministryHealth">): readonly JourneyTimelineCollection[] {
  const key = domain as keyof MemberJourneyAggregateInput;
  const timelineKey = `${domain}Timeline` as keyof MemberJourneyAggregateInput;
  return (input[timelineKey] ?? input[key] ?? []) as readonly JourneyTimelineCollection[];
}

function eventsFor(input: MemberJourneyAggregateInput, domain: Exclude<JourneyDomain, "ministryHealth">): JourneyEvent[] {
  return selectCollections(input, domain)
    .filter((collection) => collection.memberId === undefined || collection.memberId === input.memberId)
    .flatMap((collection) => collection.items.map((item) => normalize(domain, item)));
}

function compareEvents(left: JourneyEvent, right: JourneyEvent): number {
  return left.occurredAt.localeCompare(right.occurredAt)
    || left.domain.localeCompare(right.domain)
    || left.eventType.localeCompare(right.eventType)
    || JSON.stringify(left.details).localeCompare(JSON.stringify(right.details));
}

function includes(event: JourneyEvent, text: string): boolean { return event.eventType.toLowerCase().includes(text); }

export function buildMemberJourneyAggregate(input: MemberJourneyAggregateInput): MemberJourneyAggregate {
  const domains: Exclude<JourneyDomain, "ministryHealth">[] = ["formation", "care", "serving", "community", "giving", "attendance", "engagement"];
  const ministryHealthContext = (input.ministryHealthTimeline ?? []).map((item) => normalize("ministryHealth", item));
  const timeline = [...domains.flatMap((domain) => eventsFor(input, domain)), ...ministryHealthContext].sort(compareEvents);
  const prediction = (input.aiPredictions ?? []).find((item) => item.memberId === input.memberId) ?? null;
  const intelligence = (input.predictiveMemberIntelligence ?? []).find((item) => item.risk.memberId === input.memberId) ?? null;
  const riskMoments = timeline.filter((event) => event.severity === "critical" || event.severity === "high" || includes(event, "stalled") || includes(event, "alert"));
  const recoveryMoments = timeline.filter((event) => includes(event, "closed") || includes(event, "completed") || includes(event, "resolved"));
  const growthMoments = timeline.filter((event) => includes(event, "started") || includes(event, "completed") || includes(event, "recorded") || includes(event, "assigned"));
  const turningPoints = timeline.filter((event) => riskMoments.includes(event) || recoveryMoments.includes(event) || includes(event, "started"));
  return { memberId: input.memberId, timeline, unifiedTimeline: timeline, keyMoments: timeline.filter((event) => event.severity !== "info" || turningPoints.includes(event)), turningPoints, recoveryMoments, riskMoments, growthMoments, aiPredictions: prediction, predictiveMemberIntelligence: intelligence, ministryHealthContext };
}