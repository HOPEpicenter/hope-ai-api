import type { EngagementRiskLevelV1, EngagementRiskV1 } from "../../contracts/engagementRisk.v1";

type ScoreLike = {
  visitorId: string;
  windowDays: number;
  engaged: boolean;
  lastEngagedAt: string | null;
  daysSinceLastEngagement: number | null;
  engagementCount: number;
  score: number;
  scoreReasons: string[];
  needsFollowup: boolean;
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function deriveEngagementRiskV1(score: ScoreLike): EngagementRiskV1 {
  const signals: string[] = [];
  let riskScore = 0;

  if (!score.engaged) {
    riskScore += 60;
    signals.push("no_recent_engagement");
  }

  if (score.needsFollowup) {
    riskScore += 25;
    signals.push("needs_followup");
  }

  const days = score.daysSinceLastEngagement;

  if (days !== null) {
    if (days >= 14) {
      riskScore += 35;
      signals.push("stale:>=14d");
    } else if (days >= 7) {
      riskScore += 20;
      signals.push("stale:>=7d");
    } else if (days <= 2) {
      signals.push("recent:<=2d");
    }
  } else {
    riskScore += 20;
    signals.push("no_last_engaged_at");
  }

  if (score.engagementCount === 0) {
    riskScore += 20;
    signals.push("signals_in_window:0");
  } else if (score.engagementCount <= 2) {
    riskScore += 10;
    signals.push(`signals_in_window:${score.engagementCount}`);
  } else {
    signals.push(`signals_in_window:${score.engagementCount}`);
  }

  if (score.score >= 60) {
    riskScore -= 20;
    signals.push("score:healthy");
  } else if (score.score <= 20) {
    riskScore += 15;
    signals.push("score:low");
  }

  riskScore = clamp(riskScore, 0, 100);

  let riskLevel: EngagementRiskLevelV1 = "low";
  let recommendedAction = "No immediate followup needed";

  if (riskScore >= 60) {
    riskLevel = "high";
    recommendedAction = "Immediate pastoral followup recommended";
  } else if (riskScore >= 30) {
    riskLevel = "medium";
    recommendedAction = "Review and schedule followup soon";
  }

  return {
    ok: true,
    v: 1,
    visitorId: score.visitorId,
    windowDays: score.windowDays,
    riskLevel,
    riskScore,
    signals,
    recommendedAction,
    engagement: {
      engaged: score.engaged,
      lastEngagedAt: score.lastEngagedAt,
      daysSinceLastEngagement: score.daysSinceLastEngagement,
      engagementCount: score.engagementCount,
      score: score.score,
      scoreReasons: score.scoreReasons,
      needsFollowup: score.needsFollowup
    }
  };
}
