import { EngagementEventEnvelopeV1 } from "../../contracts/engagementEvent.v1";

export type IntegratedTimelineItemV1 = EngagementEventEnvelopeV1 & {
  stream: "engagement" | "formation";
};

export function makeStableKey(evt: { occurredAt: string; eventId: string }): string {
  return `${evt.occurredAt}|${evt.eventId}`;
}

export function mergeTimelines(
  engagement: EngagementEventEnvelopeV1[],
  formation: EngagementEventEnvelopeV1[]
): IntegratedTimelineItemV1[] {
  const a = engagement.map(e => ({ ...e, stream: "engagement" as const }));
  const b = formation.map(e => ({ ...e, stream: "formation" as const }));

  const merged = [...a, ...b];
  merged.sort((x, y) => makeStableKey(x).localeCompare(makeStableKey(y)));
  return merged;
}
