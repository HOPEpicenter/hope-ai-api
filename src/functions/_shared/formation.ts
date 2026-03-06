import { TableClient } from "@azure/data-tables";
import { getConnString } from "./tableClient";

export type FunctionFormationEventEntity = {
  partitionKey: string;
  rowKey: string;
  visitorId: string;
  type: string;
  occurredAt: string;
  recordedAt: string;
  channel?: string;
  visibility?: string;
  sensitivity?: string;
  summary?: string;
  metadata?: string;
  idempotencyKey?: string;
};

export type FunctionFormationProfileEntity = {
  partitionKey: "VISITOR";
  rowKey: string;
  visitorId: string;
  stage?: string;
  stageUpdatedAt?: string;
  stageUpdatedBy?: string;
  stageReason?: string;
  assignedTo?: string | null;
  lastEventType?: string;
  lastEventAt?: string;
  updatedAt?: string;
  lastServiceAttendedAt?: string;
  lastFollowupAssignedAt?: string;
  lastFollowupContactedAt?: string;
  lastFollowupOutcomeAt?: string;
  lastNextStepAt?: string;
  lastPrayerRequestedAt?: string;
  [k: string]: any;
};

const FORMATION_EVENTS_TABLE = process.env.FORMATION_EVENTS_TABLE || "devFormationEvents";
const FORMATION_PROFILES_TABLE = process.env.FORMATION_PROFILES_TABLE || "devFormationProfiles";

function escapeOData(value: string): string {
  return String(value ?? "").replace(/'/g, "''");
}

export function getFormationEventsTableClient(): TableClient {
  const conn = getConnString();
  if (!conn) {
    throw new Error("Missing STORAGE_CONNECTION_STRING (or AzureWebJobsStorage).");
  }
  return TableClient.fromConnectionString(conn, FORMATION_EVENTS_TABLE);
}

export function getFormationProfilesTableClient(): TableClient {
  const conn = getConnString();
  if (!conn) {
    throw new Error("Missing STORAGE_CONNECTION_STRING (or AzureWebJobsStorage).");
  }
  return TableClient.fromConnectionString(conn, FORMATION_PROFILES_TABLE);
}

export async function ensureTable(client: TableClient): Promise<void> {
  try {
    await client.createTable();
  } catch (err: any) {
    const code = Number(err?.statusCode ?? err?.status ?? 0);
    if (code === 409) {
      return;
    }
    throw err;
  }
}

export async function getFormationProfileByVisitorId(
  table: TableClient,
  visitorId: string
): Promise<FunctionFormationProfileEntity | null> {
  try {
    const entity = await table.getEntity<FunctionFormationProfileEntity>("VISITOR", visitorId);
    return {
      ...entity,
      partitionKey: "VISITOR",
      rowKey: visitorId,
      visitorId
    };
  } catch (err: any) {
    const code = Number(err?.statusCode ?? err?.status ?? 0);
    if (code === 404) {
      return null;
    }
    throw err;
  }
}

export async function listFormationEventsByVisitorId(
  table: TableClient,
  visitorId: string,
  input?: {
    limit?: number;
    beforeRowKey?: string;
  }
): Promise<FunctionFormationEventEntity[]> {
  const limit = input?.limit ?? 50;

  const filter = input?.beforeRowKey
    ? `PartitionKey eq '${escapeOData(visitorId)}' and RowKey lt '${escapeOData(input.beforeRowKey)}'`
    : `PartitionKey eq '${escapeOData(visitorId)}'`;

  const select = [
    "PartitionKey",
    "RowKey",
    "visitorId",
    "type",
    "occurredAt",
    "recordedAt",
    "channel",
    "visibility",
    "sensitivity",
    "summary",
    "metadata",
    "idempotencyKey"
  ];

  const results: FunctionFormationEventEntity[] = [];

  for await (const entity of table.listEntities<any>({
    queryOptions: { filter, select }
  })) {
    results.push({
      partitionKey: entity.partitionKey ?? entity.PartitionKey,
      rowKey: entity.rowKey ?? entity.RowKey,
      visitorId: entity.visitorId,
      type: entity.type,
      occurredAt: entity.occurredAt,
      recordedAt: entity.recordedAt,
      channel: entity.channel,
      visibility: entity.visibility,
      sensitivity: entity.sensitivity,
      summary: entity.summary,
      metadata: entity.metadata,
      idempotencyKey: entity.idempotencyKey
    });

    if (results.length >= limit) {
      break;
    }
  }

  return results;
}
