import { TableClient } from "@azure/data-tables";

export interface FormationEventEntity {
  partitionKey: string;
  rowKey: string;
  id: string;
  visitorId: string;
  type: string;
  occurredAt: string;
  recordedAt: string;
  channel: string;
  visibility?: string;
  sensitivity?: string;
  summary?: string;
  metadata?: string;
  idempotencyKey?: string;
}

function isConflictAlreadyExists(err: any): boolean {
  return err?.statusCode === 409;
}

/**
 * INSERT (idempotent-safe)
 */
export async function insertFormationEvent(
  table: TableClient,
  entity: FormationEventEntity
): Promise<{ inserted: boolean }> {
  try {
    await table.createEntity(entity as any);
    return { inserted: true };
  } catch (err: any) {
    if (isConflictAlreadyExists(err)) {
      return { inserted: false };
    }
    throw err;
  }
}

/**
 * LIST BY VISITOR
 */
export async function listFormationEventsByVisitor(
  table: TableClient,
  visitorId: string,
  opts?: {
    limit?: number;
    beforeRowKey?: string;
  }
) {
  const results: any[] = [];

  let filter = `PartitionKey eq '${visitorId}'`;

  if (opts?.beforeRowKey) {
    filter += ` and RowKey lt '${opts.beforeRowKey}'`;
  }

  const entities = table.listEntities({
    queryOptions: { filter }
  });

  for await (const entity of entities) {
    results.push(entity);
    if (opts?.limit && results.length >= opts.limit) break;
  }

  return results;
}

/**
 * LIST RECENT
 */
export async function listRecentFormationEvents(
  table: TableClient,
  opts?: {
    limit?: number;
    since?: string;
  }
) {
  const results: any[] = [];

  let filter: string | undefined = undefined;

  if (opts?.since) {
    filter = "Timestamp ge datetime'" + opts.since + "'";
  }

  const entities = table.listEntities(
    filter ? { queryOptions: { filter } } : undefined
  );

  for await (const entity of entities) {
    results.push(entity);
    if (opts?.limit && results.length >= opts.limit) break;
  }

  return results;
}
