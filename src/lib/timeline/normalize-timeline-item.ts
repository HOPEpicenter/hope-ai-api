import type { NormalizedTimelineItem } from "./normalize-timeline-types";

type TimelineLike = {
  id?: string | null;
  visitorId?: string | null;
  type?: string | null;
  eventType?: string | null;
  summary?: string | null;
  source?: string | null;
  happenedAt?: string | null;
  occurredAt?: string | null;
  recordedAt?: string | null;
  createdAt?: string | null;
  timestamp?: string | null;
  actor?: string | null;
  by?: string | null;
};

function getBestTimestamp(item: TimelineLike): string | null {
  return (
    item.happenedAt ??
    item.occurredAt ??
    item.recordedAt ??
    item.createdAt ??
    item.timestamp ??
    null
  );
}

function getEventType(item: TimelineLike): string {
  return item.eventType ?? item.type ?? "UNKNOWN";
}

function getKind(item: TimelineLike): NormalizedTimelineItem["kind"] {
  const source = (item.source ?? "").toLowerCase();
  const eventType = getEventType(item).toLowerCase();

  if (source.includes("engagement") || eventType.startsWith("note") || eventType.startsWith("tag")) {
    return "engagement";
  }

  if (source.includes("formation") || eventType.includes("SALVATION") || eventType.includes("BAPTISM") || eventType.includes("MEMBERSHIP")) {
    return "formation";
  }

  if (source.includes("integration") || eventType.includes("FOLLOWUP") || eventType.includes("GROUP_")) {
    return "integration";
  }

  return "system";
}

export function normalizeTimelineItem(item: TimelineLike): NormalizedTimelineItem {
  return {
    id: item.id ?? `${item.visitorId ?? "unknown"}:${getEventType(item)}:${getBestTimestamp(item) ?? "no-time"}`,
    visitorId: item.visitorId ?? null,
    kind: getKind(item),
    eventType: getEventType(item),
    happenedAt: getBestTimestamp(item),
    summary: item.summary?.trim() || getEventType(item),
    actor: item.actor ?? item.by ?? null,
    source: item.source ?? "unknown",
    raw: item
  };
}

