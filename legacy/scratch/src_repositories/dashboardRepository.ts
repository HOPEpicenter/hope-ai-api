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

export interface DashboardResult {
  visitor: {
    id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    status?: string;
    tags: string[];
    notes?: string;
    source?: string;
    createdAt?: string;
    updatedAt?: string;
  };
  engagement: {
    score: number;
    riskLevel: string;
    lastStatus: string | null;
    lastStatusAt: string | null;
    statusCount: number;
    lastContactDaysAgo: number | null;
    tags: string[];
  };
  statusHistory: {
    status: string;
    note?: string;
    timestamp: string;
  }[];
}

export async function getDashboard(visitorId: string): Promise<DashboardResult> {
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

  const tags: string[] = visitor.tagsJson ? JSON.parse(visitor.tagsJson) : [];

  const engagement = await computeEngagementScore(visitorId);
  const history = await listStatus(visitorId);

  const statusHistory = history.map(h => ({
    status: h.status,
    note: h.note,
    timestamp: h.timestamp
  }));

  return {
    visitor: {
      id: visitor.rowKey,
      firstName: visitor.firstName,
      lastName: visitor.lastName,
      email: visitor.email,
      phone: visitor.phone,
      status: visitor.status,
      tags,
      notes: visitor.notes,
      source: visitor.source,
      createdAt: visitor.createdAt,
      updatedAt: visitor.updatedAt
    },
    engagement: {
      score: engagement.score,
      riskLevel: engagement.riskLevel,
      lastStatus: engagement.lastStatus,
      lastStatusAt: engagement.lastStatusAt,
      statusCount: engagement.statusCount,
      lastContactDaysAgo: engagement.lastContactDaysAgo,
      tags: engagement.tags
    },
    statusHistory
  };
}
