import { TableClient } from "@azure/data-tables";
import { listStatus } from "./visitorStatusRepository";

const VISITOR_TABLE = "devVisitors";

function getVisitorClient() {
  return TableClient.fromConnectionString(
    process.env.AzureWebJobsStorage!,
    VISITOR_TABLE
  );
}

export interface EngagementResult {
  visitorId: string;
  score: number;
  lastStatus: string | null;
  lastStatusAt: string | null;
  statusCount: number;
  tags: string[];
  lastContactDaysAgo: number | null;
  riskLevel: string;
}

export async function computeEngagementScore(visitorId: string): Promise<EngagementResult> {
  const visitorClient = getVisitorClient();

  const rawVisitor = await visitorClient.getEntity("visitor", visitorId);
  const visitor = rawVisitor as unknown as {
    partitionKey: string;
    rowKey: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    notes?: string;
    source?: string;
    status?: string;
    createdAt?: string;
    updatedAt?: string;
    tagsJson?: string;
  };

  const history = await listStatus(visitorId);

  const tags: string[] = visitor.tagsJson ? JSON.parse(visitor.tagsJson) : [];

  if (history.length === 0) {
    return {
      visitorId,
      score: 0,
      lastStatus: null,
      lastStatusAt: null,
      statusCount: 0,
      tags,
      lastContactDaysAgo: null,
      riskLevel: "high"
    };
  }

  const statusPoints: Record<string, number> = {
    "first-time": 20,
    "contacted": 10,
    "follow-up scheduled": 15,
    "attended service": 25,
    "prayed with pastor": 30,
    "joined small group": 40,
    "baptized": 100
  };

  let score = 0;
  const now = new Date();

  for (const event of history) {
    const base = statusPoints[event.status.toLowerCase()] ?? 5;

    const eventDate = new Date(event.timestamp);
    const daysAgo = (now.getTime() - eventDate.getTime()) / (1000 * 60 * 60 * 24);

    let multiplier = 0.1;
    if (daysAgo <= 7) multiplier = 1.0;
    else if (daysAgo <= 30) multiplier = 0.5;
    else if (daysAgo <= 90) multiplier = 0.25;

    score += base * multiplier;
  }

  if (tags.includes("first-time")) score += 10;
  if (tags.includes("member")) score += 20;
  if (tags.includes("inactive")) score -= 15;

  if (visitor.notes && visitor.notes.length > 0) score += 5;

  const lastEvent = history[0];
  const lastEventDate = new Date(lastEvent.timestamp);
  const lastContactDaysAgo = Math.floor(
    (now.getTime() - lastEventDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (lastContactDaysAgo > 30) score -= 20;
  if (lastContactDaysAgo > 60) score -= 40;

  let riskLevel = "low";
  if (score < 40) riskLevel = "medium";
  if (score < 20) riskLevel = "high";

  return {
    visitorId,
    score: Math.max(0, Math.round(score)),
    lastStatus: lastEvent.status,
    lastStatusAt: lastEvent.timestamp,
    statusCount: history.length,
    tags,
    lastContactDaysAgo,
    riskLevel
  };
}
