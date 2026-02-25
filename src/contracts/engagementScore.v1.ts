export type EngagementScoreV1 = {
  v: 1;
  visitorId: string;
  windowDays: number;

  engaged: boolean;
  lastEngagedAt: string | null;
  daysSinceLastEngagement: number | null;
  engagementCount: number;

  // Phase 5
  score: number;
  scoreReasons: string[];
  needsFollowup: boolean;
};

export type EngagementScoreQueryV1 = {
  visitorId: string;
  windowDays?: number;
};

export function validateEngagementScoreQueryV1(query: any):
  | { ok: true; value: { visitorId: string; windowDays: number } }
  | { ok: false; issues: { path: string; message: string }[] } {

  const issues: { path: string; message: string }[] = [];

  const visitorId = query?.visitorId;
  if (typeof visitorId !== "string" || visitorId.trim().length < 8) {
    issues.push({ path: "visitorId", message: "must be a string (min 8 chars)" });
  }

  let windowDays = 14;
  if (query?.windowDays !== undefined) {
    const n = Number(query.windowDays);
    if (!Number.isFinite(n) || n < 1 || n > 365) {
      issues.push({ path: "windowDays", message: "must be a number in range 1..365" });
    } else {
      windowDays = Math.floor(n);
    }
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: { visitorId: visitorId.trim(), windowDays } };
}
