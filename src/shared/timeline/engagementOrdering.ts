import { compareEventOrder } from "../../functions/_shared/reconciliation";

export type TimelineEventLike = {
  occurredAt?: string | null;
  eventId?: string | null;
  rowKey?: string | null;
};

function resolveStableKey(evt: TimelineEventLike): string {
  return String(
    evt.rowKey ??
    evt.eventId ??
    ""
  ).trim();
}

export function compareTimelineEventsNewestFirst(
  a: TimelineEventLike,
  b: TimelineEventLike
): number {
  return compareEventOrder(
    String(b?.occurredAt ?? ""),
    resolveStableKey(b),
    String(a?.occurredAt ?? ""),
    resolveStableKey(a)
  );
}
export function compareTimelineEventsOldestFirst(
  a: TimelineEventLike,
  b: TimelineEventLike
): number {
  return compareEventOrder(
    String(a?.occurredAt ?? ""),
    resolveStableKey(a),
    String(b?.occurredAt ?? ""),
    resolveStableKey(b)
  );
}