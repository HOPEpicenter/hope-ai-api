// src/storage/formation/formationEventsRepo.ts
import { TableClient, TableEntityResult } from "@azure/data-tables";
import {
  FormationEventType,
  FormationVisibility,
  FormationSensitivity,
} from "../../domain/formation/phase3_1_scope";

export type FormationEventEntity = {
  partitionKey: string; // visitorId
  rowKey: string; // ISO timestamp + random suffix (sortable)
  id?: string;

  visitorId: string;
  type: FormationEventType;

  occurredAt: string;  // ISO
  recordedAt: string;  // ISO

  channel: string;
  visibility: FormationVisibility;
  sensitivity: FormationSensitivity;

  summary?: string;
  metadata?: string; // JSON string
  idempotencyKey?: string;
};

export type FormationEventResult = TableEntityResult<FormationEventEntity>;

/**
 * Insert a Formation event (append-only).
 * We never update events; corrections are new events.
 */
export async function insertFormationEvent(
  table: TableClient,
  entity: FormationEventEntity
): Promise<void> {
  await table.createEntity(entity);
}

/**
 * List Formation events for a visitor (timeline).
 * Uses PartitionKey = visitorId.
 *
 * NOTE: Azure Tables OData filter uses PartitionKey/RowKey, not our "partitionKey" property.
 */
export async function listFormationEventsByVisitor(
  table: TableClient,
  visitorId: string,
  options?: {
    limit?: number;
    beforeRowKey?: string; // optional pagination cursor (RowKey sort)
  }
): Promise<FormationEventEntity[]> {
  const limit = options?.limit ?? 50;

  // RowKey is `${occurredAtIso}__${suffix}` so it sorts chronologically.
  // If beforeRowKey is provided, return events strictly earlier than that.
  const filter = options?.beforeRowKey
    ? `PartitionKey eq '${escapeOData(visitorId)}' and RowKey lt '${escapeOData(
        options.beforeRowKey
      )}'`
    : `PartitionKey eq '${escapeOData(visitorId)}'`;

  const results: FormationEventEntity[] = [];

  // Select only what we need for performance
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
    "idempotencyKey",
  ];

  // listEntities returns in ascending order by RowKey for a given partition
  // We'll keep that, and let the caller reverse if they want newest-first UI.
  for await (const e of table.listEntities<any>({
    queryOptions: { filter, select },
  })) {
    results.push({
      partitionKey: e.partitionKey ?? e.PartitionKey,
      rowKey: e.rowKey ?? e.RowKey,

      visitorId: e.visitorId,
      type: e.type,

      occurredAt: e.occurredAt,
      recordedAt: e.recordedAt,

      channel: e.channel,
      visibility: e.visibility,
      sensitivity: e.sensitivity,

      summary: e.summary,
      metadata: e.metadata,
      idempotencyKey: e.idempotencyKey,
    });

    if (results.length >= limit) break;
  }

  return results;
}

/** Minimal OData string escaping for single quotes */
function escapeOData(value: string): string {
  return value.replace(/'/g, "''");
}

export async function listRecentFormationEvents(
  table: any,
  options?: {
    limit?: number;
    since?: string;
  }
): Promise<any[]> {
  const limitRaw = Number(options?.limit ?? 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 10;
  const since = typeof options?.since === "string" && options.since.trim().length > 0
    ? options.since.trim()
    : null;

  const items: any[] = [];

  for await (const entity of table.listEntities()) {
    const occurredAt =
      typeof entity?.occurredAt === "string" && entity.occurredAt.trim().length > 0
        ? entity.occurredAt.trim()
        : null;

    if (since && occurredAt && occurredAt < since) {
      continue;
    }

    items.push(entity);
  }

  items.sort((a, b) => {
    const aOccurredAt =
      typeof a?.occurredAt === "string" && a.occurredAt.trim().length > 0
        ? a.occurredAt.trim()
        : "";
    const bOccurredAt =
      typeof b?.occurredAt === "string" && b.occurredAt.trim().length > 0
        ? b.occurredAt.trim()
        : "";

    if (aOccurredAt !== bOccurredAt) {
      return aOccurredAt < bOccurredAt ? 1 : -1;
    }

    const aRowKey = typeof a?.rowKey === "string" ? a.rowKey : "";
    const bRowKey = typeof b?.rowKey === "string" ? b.rowKey : "";

    if (aRowKey === bRowKey) return 0;
    return aRowKey < bRowKey ? 1 : -1;
  });

  return items.slice(0, limit);
}
