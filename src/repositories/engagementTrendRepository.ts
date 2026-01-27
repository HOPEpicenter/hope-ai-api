import { listStatus } from "./visitorStatusRepository";
import { computeEngagementScore } from "./engagementRepository";

export interface EngagementTrendPoint {
  timestamp: string;
  status: string;
  note?: string;
  scoreAfter: number;
}

export interface EngagementTrendResult {
  visitorId: string;
  totalScore: number;
  points: EngagementTrendPoint[];
  direction: "up" | "down" | "flat";
}

export async function getEngagementTrend(visitorId: string): Promise<EngagementTrendResult> {
  const history = await listStatus(visitorId);

  if (history.length === 0) {
    return {
      visitorId,
      totalScore: 0,
      points: [],
      direction: "flat"
    };
  }

  const engagement = await computeEngagementScore(visitorId);
  const totalScore = engagement.score;

  const sortedHistory = [...history].sort((a, b) => {
    const da = new Date(a.timestamp).getTime();
    const db = new Date(b.timestamp).getTime();
    return da - db;
  });

  const baseScorePerEvent = sortedHistory.length > 0 ? totalScore / sortedHistory.length : 0;
  let runningScore = 0;

  const points: EngagementTrendPoint[] = [];

  for (const event of sortedHistory) {
    runningScore += baseScorePerEvent;

    points.push({
      timestamp: event.timestamp,
      status: event.status,
      note: event.note,
      scoreAfter: Math.round(runningScore)
    });
  }

  let direction: "up" | "down" | "flat" = "flat";
  if (points.length >= 2) {
    const first = points[0].scoreAfter;
    const last = points[points.length - 1].scoreAfter;
    if (last > first) direction = "up";
    else if (last < first) direction = "down";
  }

  return {
    visitorId,
    totalScore,
    points,
    direction
  };
}
