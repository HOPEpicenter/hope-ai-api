export type EngagementAnalyticsV1 = {
  v: 1;
  visitorId: string;
  currentStatus: string | null;
  currentStatusSince: string | null;

  transitions: {
    total: number;
    engaged: number;
    disengaged: number;
  };

  firstEngagedAt: string | null;
  lastTransitionAt: string | null;
};

export type EngagementAnalyticsQueryV1 = {
  visitorId: string;
};

export function validateEngagementAnalyticsQueryV1(query: any):
  | { ok: true; value: EngagementAnalyticsQueryV1 }
  | { ok: false; issues: { path: string; message: string }[] } {

  const issues: { path: string; message: string }[] = [];

  const visitorId = query?.visitorId;
  if (typeof visitorId !== "string" || visitorId.trim().length < 8) {
    issues.push({ path: "visitorId", message: "must be a string (min 8 chars)" });
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: { visitorId: visitorId.trim() } };
}
