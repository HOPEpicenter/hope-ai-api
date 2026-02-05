export type TimelineBaseV1 = {
  occurredAt: string;
  eventId: string;
};

export type IntegratedTimelineItemV1<T extends TimelineBaseV1> = T & {
  stream: "engagement" | "formation";
};

export function makeStableKey(evt: TimelineBaseV1): string {
  return `${evt.occurredAt}|${evt.eventId}`;
}

export function mergeTimelines<
  E extends TimelineBaseV1,
  F extends TimelineBaseV1
>(
  engagement: E[],
  formation: F[]
): Array<IntegratedTimelineItemV1<E> | IntegratedTimelineItemV1<F>> {
  const a = engagement.map(e => ({ ...e, stream: "engagement" as const }));
  const b = formation.map(e => ({ ...e, stream: "formation" as const }));

  const merged = [...a, ...b];
  merged.sort((x, y) => makeStableKey(x).localeCompare(makeStableKey(y)));
  return merged;
}
