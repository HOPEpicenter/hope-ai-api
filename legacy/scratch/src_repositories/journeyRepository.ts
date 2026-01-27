import { TableClient } from "@azure/data-tables";
import { listStatus } from "./visitorStatusRepository";
import { computeEngagementScore } from "./engagementRepository";

const VISITOR_TABLE = "devVisitors";

function getVisitorClient() {
  return TableClient.fromConnectionString(
    process.env.AzureWebJobsStorage!,
    VISITOR_TABLE
  );
}

export interface JourneyEvent {
  type: "created" | "status";
  timestamp: string;
  status?: string;
  note?: string;
  scoreAfter?: number;
}

export interface JourneyResult {
  visitorId: string;
  timeline: JourneyEvent[];
}

export async function getJourney(visitorId: string, order: "asc" | "desc" = "asc"): Promise<JourneyResult> {
  const visitorClient = getVisitorClient();

  const rawVisitor = await visitorClient.getEntity("visitor", visitorId);
  const visitor = rawVisitor as unknown as {
    rowKey: string;
    createdAt?: string;
  };

  const history = await listStatus(visitorId);

  const timeline: JourneyEvent[] = [];

  if (visitor.createdAt) {
    timeline.push({
      type: "created",
      timestamp: visitor.createdAt
    });
  }

  const engagement = await computeEngagementScore(visitorId);
  const totalScore = engagement.score;

  const sortedHistory = [...history].sort((a, b) => {
    const da = new Date(a.timestamp).getTime();
    const db = new Date(b.timestamp).getTime();
    return da - db;
  });

  const statusEvents: JourneyEvent[] = [];
  const baseScorePerEvent = sortedHistory.length > 0 ? totalScore / sortedHistory.length : 0;
  let runningScore = 0;

  for (const event of sortedHistory) {
    runningScore += baseScorePerEvent;

    statusEvents.push({
      type: "status",
      status: event.status,
      note: event.note,
      timestamp: event.timestamp,
      scoreAfter: Math.round(runningScore)
    });
  }

  timeline.push(...statusEvents);

  const orderedTimeline =
    order === "asc"
      ? timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      : timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return {
    visitorId: visitor.rowKey,
    timeline: orderedTimeline
  };
}
