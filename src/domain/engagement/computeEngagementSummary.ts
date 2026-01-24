export type EngagementSummary = {
  visitorId: string;
  version: number;
  updatedAt: string;

  lastEventRowKey: string;

  eventCount: number;
  firstEngagedAt?: string;
  lastEngagedAt?: string;

  channels: Record<string, number>;
  types: Record<string, number>;
};

export type EngagementEventForSummary = {
  visitorId: string;
  rowKey: string; // occurredAt_id (same rowKey as event row)
  type: string;
  channel?: string;
  occurredAt: string;
};

function safeInc(map: Record<string, number>, key: string) {
  const k = (key || "").trim();
  if (!k) return;
  map[k] = (map[k] ?? 0) + 1;
}

export function computeNextEngagementSummary(input: {
  prev: EngagementSummary | null;
  event: EngagementEventForSummary;
  nowIso: string;
}): EngagementSummary {
  const { prev, event, nowIso } = input;

  const next: EngagementSummary = prev
    ? {
        ...prev,
        channels: { ...prev.channels },
        types: { ...prev.types },
      }
    : {
        visitorId: event.visitorId,
        version: 1,
        updatedAt: nowIso,
        lastEventRowKey: "",
        eventCount: 0,
        channels: {},
        types: {},
      };

  // Update watermark
  next.lastEventRowKey = event.rowKey;

  // Counts
  next.eventCount = (next.eventCount ?? 0) + 1;
  safeInc(next.channels, event.channel || "");
  safeInc(next.types, event.type || "");

  // Time bounds
  const occurredAt = event.occurredAt;
  if (!next.firstEngagedAt || occurredAt < next.firstEngagedAt) {
    next.firstEngagedAt = occurredAt;
  }
  if (!next.lastEngagedAt || occurredAt > next.lastEngagedAt) {
    next.lastEngagedAt = occurredAt;
  }

  next.updatedAt = nowIso;
  return next;
}