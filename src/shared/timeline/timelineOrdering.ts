export type TimelineOrderable = {
  occurredAt?: string | null;
  eventId?: string | null;
  stream?: string | null;
};

export function compareTimelineNewestFirst(
  a: TimelineOrderable,
  b: TimelineOrderable
): number {
  const ao = String(a?.occurredAt ?? "");
  const bo = String(b?.occurredAt ?? "");

  if (ao !== bo) {
    return ao > bo ? -1 : 1;
  }

  const ae = String(a?.eventId ?? "");
  const be = String(b?.eventId ?? "");

  if (ae !== be) {
    return ae > be ? -1 : 1;
  }

  const as = String(a?.stream ?? "");
  const bs = String(b?.stream ?? "");

  if (as === bs) {
    return 0;
  }

  return as > bs ? -1 : 1;
}

export function makeTimelineCursor(
  item: TimelineOrderable
): string | null {
  const occurredAt = String(item?.occurredAt ?? "").trim();
  const eventId = String(item?.eventId ?? "").trim();
  const stream = String(item?.stream ?? "").trim();

  if (!occurredAt || !eventId) {
    return null;
  }

  return [occurredAt, eventId, stream].join("|");
}

export function parseTimelineCursor(
  cursor: string
): TimelineOrderable | null {
  const parts = String(cursor ?? "").split("|");

  const occurredAt = String(parts[0] ?? "").trim();
  const eventId = String(parts[1] ?? "").trim();
  const stream = String(parts[2] ?? "").trim();

  if (!occurredAt || !eventId) {
    return null;
  }

  return {
    occurredAt,
    eventId,
    stream
  };
}

export function isTimelineItemAfterCursor(
  item: TimelineOrderable,
  cursorItem: TimelineOrderable
): boolean {
  return compareTimelineNewestFirst(item, cursorItem) > 0;
}
const MAX_TIMELINE_MS = 253402300799999;

export function makeInvertedMillisKey(occurredAt: string): string {
  const ms = Date.parse(occurredAt);
  const safeMs = Number.isFinite(ms) ? ms : Date.now();
  return String(MAX_TIMELINE_MS - safeMs).padStart(15, "0");
}

export function makeNewestFirstRowKey(occurredAt: string, stableId: string): string {
  return `${makeInvertedMillisKey(occurredAt)}|${stableId}`;
}


