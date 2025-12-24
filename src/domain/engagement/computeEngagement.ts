export type EngagementSummary = {
  engaged: boolean;
  lastEngagedAt: string | null;
  daysSinceLastEngagement: number | null;
  engagementCount: number;
  windowDays: number;

  // Phase 5
  score: number;
  scoreReasons: string[];
  needsFollowup: boolean;
};

function toIso(val: any): string | null {
  if (!val) return null;
  const s = String(val);
  // if already ISO-ish, keep it
  return s;
}

export function computeEngagementSummary(args: {
  events: any[];
  windowDays: number;
  nowMs?: number;
}): EngagementSummary {
  const nowMs = typeof args.nowMs === "number" ? args.nowMs : Date.now();
  const windowDays = args.windowDays;
  const windowMs = windowDays * 24 * 60 * 60 * 1000;

  let engagementCount = 0;
  let lastEngagedAtMs: number | null = null;
  let lastEngagedAtIso: string | null = null;

  for (const e of args.events ?? []) {
    engagementCount++;

    // prefer recordedAt/occurredAt/timestamp/RowKey prefix, fallback to nothing
    const candidate =
      e?.recordedAt ??
      e?.occurredAt ??
      e?.timestamp ??
      e?.Timestamp ??
      null;

    let tMs: number | null = null;
    if (candidate) {
      const p = Date.parse(String(candidate));
      if (!Number.isNaN(p)) tMs = p;
    }

    // If no timestamp, try RowKey like "2025-12-24T...Z__abcd"
    if (tMs == null && (e?.rowKey || e?.RowKey)) {
      const rk = String(e?.rowKey ?? e?.RowKey);
      const iso = rk.split("__")[0];
      const p = Date.parse(iso);
      if (!Number.isNaN(p)) tMs = p;
    }

    if (tMs != null && (lastEngagedAtMs == null || tMs > lastEngagedAtMs)) {
      lastEngagedAtMs = tMs;
      lastEngagedAtIso = new Date(tMs).toISOString();
    }
  }

  let daysSinceLastEngagement: number | null = null;
  if (lastEngagedAtMs != null) {
    const diffMs = Math.max(0, nowMs - lastEngagedAtMs);
    daysSinceLastEngagement = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  const engaged = lastEngagedAtMs != null && nowMs - lastEngagedAtMs <= windowMs;
  const needsFollowup = !engaged;

  // Phase 5 scoring (simple + explainable)
  const reasons: string[] = [];
  let score = 0;

  if (engagementCount === 0) {
    reasons.push("no_engagement_events");
    score += 80;
  } else {
    score += Math.min(40, engagementCount * 4);
    reasons.push(`event_count:${engagementCount}`);
  }

  if (daysSinceLastEngagement == null) {
    score += 20;
    reasons.push("no_last_engaged_at");
  } else {
    // overdue weight
    score += Math.min(60, daysSinceLastEngagement * 3);
    reasons.push(`days_since:${daysSinceLastEngagement}`);
  }

  if (engaged) {
    // engaged people should not float to the top of followup urgency
    score = Math.max(0, score - 50);
    reasons.push("engaged_recently:-50");
  } else {
    reasons.push("needs_followup");
  }

  // clamp
  score = Math.max(0, Math.min(100, score));

  return {
    engaged,
    lastEngagedAt: toIso(lastEngagedAtIso),
    daysSinceLastEngagement,
    engagementCount,
    windowDays,
    score,
    scoreReasons: reasons,
    needsFollowup,
  };
}
