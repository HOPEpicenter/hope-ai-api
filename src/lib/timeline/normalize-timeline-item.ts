import type { NormalizedTimelineItem } from "./normalize-timeline-types";

type TimelineLike = {
  id?: string | null;
  visitorId?: string | null;
  type?: string | null;
  eventType?: string | null;
  summary?: string | null;
  source?: any;
  happenedAt?: string | null;
  occurredAt?: string | null;
  recordedAt?: string | null;
  createdAt?: string | null;
  timestamp?: string | null;
  actor?: string | null;
  by?: string | null;
};

function getSourceString(item: any): string {
  if (typeof item?.source === "string") return item.source;

  if (item?.source && typeof item.source === "object") {
    if (typeof item.source.system === "string") {
      return item.source.system;
    }
  }

  return "";
}

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
  const source = getSourceString(item).toLowerCase();
  const eventType = getEventType(item).toLowerCase();

  if (source.includes("engagement") || eventType.startsWith("note") || eventType.startsWith("tag")) {
    return "engagement";
  }

  if (source.includes("formation") || eventType.includes("salvation") || eventType.includes("baptism") || eventType.includes("membership")) {
    return "formation";
  }

  if (source.includes("integration") || eventType.includes("followup") || eventType.includes("group_")) {
    return "integration";
  }

  return "system";
}

export function normalizeTimelineItem(item: TimelineLike): NormalizedTimelineItem {
  function formatSummary(type: string): string {
  if (!type) return "";

  return type
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

return {
    id: item.id ?? `${item.visitorId ?? "unknown"}:${getEventType(item)}:${getBestTimestamp(item) ?? "no-time"}`,
    visitorId: item.visitorId ?? null,
    kind: getKind(item),
    eventType: getEventType(item),
    happenedAt: getBestTimestamp(item),
    summary: item.summary?.trim() || getEventType(item),
    actor: item.actor ?? item.by ?? null,
    source: getSourceString(item) || "unknown",
    raw: item
  };
}

