import { EngagementEventEnvelopeV1 } from "../../contracts/engagementEvent.v1";

export type EngagementScoreComputedV1 = {
  engaged: boolean;
  lastEngagedAt: string | null;
  daysSinceLastEngagement: number | null;
  engagementCount: number;

  // Phase 5 hooks (keep stable fields; tune logic later)
  score: number;
  scoreReasons: string[];
  needsFollowup: boolean;
};

function daysBetweenUtc(olderIso: string, newerIso: string): number | null {
  const a = Date.parse(olderIso);
  const b = Date.parse(newerIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const ms = Math.max(0, b - a);
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function computeEngagementScoreV1(args: {
  events: EngagementEventEnvelopeV1[];
  windowDays: number;
  nowIso?: string;
}): EngagementScoreComputedV1 {
  const nowIso = args.nowIso ?? new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  const windowMs = args.windowDays * 24 * 60 * 60 * 1000;
  const cutoffMs = Number.isFinite(nowMs) ? nowMs - windowMs : Date.now() - windowMs;

  // Treat these as "engagement signals" for v1.
  // (You can refine later without changing storage.)
  const isSignal = (e: EngagementEventEnvelopeV1) => {
    const t = String(e.type ?? "").toLowerCase();
    if (t === "note.add") return true;
    if (t === "status.transition") return true; // esp. engaged/disengaged
    if (t === "tag.add") return true;
    // tag.remove is not a positive engagement signal (still an event, but doesn't indicate contact)
    return false;
  };

  const inWindowSignals = args.events.filter((e) => {
    if (!e || typeof e.occurredAt !== "string") return false;
    const ms = Date.parse(e.occurredAt);
    if (!Number.isFinite(ms)) return false;
    if (ms < cutoffMs) return false;
    return isSignal(e);
  });

  // lastEngagedAt = most recent signal in window (timeline is newest-first, but don't assume)
  let lastEngagedAt: string | null = null;
  for (const e of inWindowSignals) {
    if (typeof e.occurredAt === "string") {
      if (!lastEngagedAt) lastEngagedAt = e.occurredAt;
      else if (String(e.occurredAt) > String(lastEngagedAt)) lastEngagedAt = e.occurredAt;
    }
  }

  const engagementCount = inWindowSignals.length;
  const engaged = engagementCount > 0;

  const daysSinceLastEngagement =
    lastEngagedAt ? daysBetweenUtc(lastEngagedAt, nowIso) : null;

  // Minimal scoring v1 (stable shape; tune weights later)
let score = 0;
const scoreReasons: string[] = [];

// If there are no signals, score must be low (not 100)
if (engagementCount === 0) {
  score = 0;
  scoreReasons.push("no_signals_in_window");
} else {
  score += Math.min(50, engagementCount * 10);
  scoreReasons.push(`signals_in_window:${engagementCount}`);
}

if (daysSinceLastEngagement !== null) {
  if (daysSinceLastEngagement <= 2) { score += 30; scoreReasons.push("recent:<=2d"); }
  else if (daysSinceLastEngagement <= 7) { score += 15; scoreReasons.push("recent:<=7d"); }
  else { scoreReasons.push("stale:>7d"); }
} else {
  scoreReasons.push("no_last_engaged_at");
}

score = Math.max(0, Math.min(100, score));

const needsFollowup = engagementCount === 0;
if (needsFollowup) scoreReasons.push("needs_followup");return {
    engaged,
    lastEngagedAt,
    daysSinceLastEngagement,
    engagementCount,
    score,
    scoreReasons,
    needsFollowup,
  };
}

