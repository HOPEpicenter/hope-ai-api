import { TableClient } from "@azure/data-tables";
import { getConnString } from "./tableClient";
import {
  ensureTable,
  getFormationProfilesTableClient,
  getFormationProfileByVisitorId
} from "./formation";

const ENGAGEMENT_EVENTS_TABLE = "EngagementEvents";

type FunctionEngagementEventEntity = {
  partitionKey: string;
  rowKey: string;
  eventId?: string;
  visitorId?: string;
  type?: string;
  occurredAt?: string;
};

function maxIso(a?: string | null, b?: string | null): string | null {
  const av = String(a ?? "").trim();
  const bv = String(b ?? "").trim();

  if (!av) return bv || null;
  if (!bv) return av || null;

  return av >= bv ? av : bv;
}

function escapeOData(value: string): string {
  return String(value ?? "").replace(/'/g, "''");
}

export function getEngagementEventsTableClient(): TableClient {
  const conn = getConnString();
  if (!conn) {
    throw new Error("Missing STORAGE_CONNECTION_STRING (or AzureWebJobsStorage).");
  }
  return TableClient.fromConnectionString(conn, ENGAGEMENT_EVENTS_TABLE);
}

export async function getLatestEngagementEventByVisitorId(
  table: TableClient,
  visitorId: string
): Promise<FunctionEngagementEventEntity | null> {
  const filter = `PartitionKey eq '${escapeOData(visitorId)}'`;
  const select = [
    "PartitionKey",
    "RowKey",
    "eventId",
    "visitorId",
    "type",
    "occurredAt"
  ];

  for await (const entity of table.listEntities<any>({
    queryOptions: { filter, select }
  })) {
    return {
      partitionKey: entity.partitionKey ?? entity.PartitionKey,
      rowKey: entity.rowKey ?? entity.RowKey,
      eventId: entity.eventId,
      visitorId: entity.visitorId,
      type: entity.type,
      occurredAt: entity.occurredAt
    };
  }

  return null;
}

export async function readIntegrationSummaryByVisitorId(visitorId: string): Promise<any> {
  const engagementTable = getEngagementEventsTableClient();
  const formationProfilesTable = getFormationProfilesTableClient();

  await ensureTable(engagementTable);
  await ensureTable(formationProfilesTable);

  const latestEngagement = await getLatestEngagementEventByVisitorId(engagementTable, visitorId);
  const profile = await getFormationProfileByVisitorId(formationProfilesTable, visitorId);

  const lastEngagementAt = String(latestEngagement?.occurredAt ?? "").trim() || null;
  const lastFormationAt = String(profile?.lastEventAt ?? "").trim() || null;
  const lastIntegratedAt = maxIso(lastEngagementAt, lastFormationAt);

  const assigneeId = String(profile?.assignedTo ?? "").trim();
  const assignedTo =
    assigneeId
      ? {
          ownerType: "user",
          ownerId: assigneeId
        }
      : undefined;

  const hasAssignee = !!assignedTo;

  let needsFollowup = false;
  let followupReason: string | undefined;

  if (hasAssignee) {
    needsFollowup = true;
    followupReason = "FOLLOWUP_ASSIGNED";
  } else if (!lastEngagementAt) {
    needsFollowup = true;
    followupReason = "no_engagement_yet";
  }

  return {
    visitorId,
    lastEngagementAt,
    lastFormationAt,
    lastIntegratedAt,
    sources: {
      engagement: !!lastEngagementAt,
      formation: !!lastFormationAt
    },
    needsFollowup,
    followupReason,
    assignedTo
  };
}
