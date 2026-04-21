export type EngagementRiskLevelV1 = "low" | "medium" | "high";

export type EngagementRiskV1 = {
  ok: true;
  v: 1;
  visitorId: string;
  windowDays: number;
  riskLevel: EngagementRiskLevelV1;
  riskScore: number;
  signals: string[];
  recommendedAction: string;
  engagement: {
    engaged: boolean;
    lastEngagedAt: string | null;
    daysSinceLastEngagement: number | null;
    engagementCount: number;
    score: number;
    scoreReasons: string[];
    needsFollowup: boolean;
  };
};

export function validateEngagementRiskQueryV1(query: any):
  | { ok: true; value: { visitorId: string; windowDays: number } }
  | { ok: false; issues: { path: string; message: string }[] } {
  const issues: { path: string; message: string }[] = [];

  const visitorId = String(query?.visitorId ?? "").trim();
  const rawWindowDays = query?.windowDays ?? "14";
  const windowDays = Number(rawWindowDays);

  if (visitorId.length < 8) {
    issues.push({ path: "visitorId", message: "must be a string (min 8 chars)" });
  }

  if (!Number.isFinite(windowDays) || windowDays < 1 || windowDays > 366) {
    issues.push({ path: "windowDays", message: "must be an integer between 1 and 366" });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      visitorId,
      windowDays: Math.floor(windowDays)
    }
  };
}
