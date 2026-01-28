import { TableClient } from "@azure/data-tables";
import { randomUUID } from "crypto";
import { ensureTableExists } from "../shared/storage/ensureTableExists";
import { makeTableClient } from "../shared/storage/makeTableClient";
import { resolveStorageConnectionString } from "../shared/storage/resolveStorageConnectionString";

export interface FormationEvent {
  id: string;
  visitorId: string;
  type: string;
  notes?: string;
  occurredAt: string;
  recordedAt: string;
}

type FormationEventEntity = {
  // NOTE: data-tables typings require lowercase partitionKey/rowKey for writes
  partitionKey: string;
  rowKey: string;

  // Keep PascalCase for reads/filters
  PartitionKey: string;
  RowKey: string;
  id?: string;
  visitorId?: string;
  type?: string;
  notes?: string;
  occurredAt?: string;
  recordedAt?: string;
};

export type FormationEventPage = {
  items: FormationEvent[];
  cursor?: string; // RowKey of last item in the returned page (newest-first paging)
};

function getFormationEventsTableName(): string {
  return process.env.FORMATION_EVENTS_TABLE || "devFormationEvents";
}

/**
 * Preferred RowKey format:
 *   <occurredAtISO>__<id>
 * Legacy accepted:
 *   <occurredAtISO>_<id>
 */
function parseRowKey(rk: string): { occurredAt?: string; id?: string } {
  if (!rk) return {};
  const delim = rk.includes("__") ? "__" : "_";
  const parts = rk.split(delim);
  if (parts.length < 2) return {};
  const occurredAt = parts[0];
  const id = parts.slice(1).join(delim);
  return { occurredAt, id };
}

function toDomain(e: any): FormationEvent {
  const pk = (e.PartitionKey ?? e.partitionKey ?? "") as string;
  const rk = (e.RowKey ?? e.rowKey ?? "") as string;

  const parsed = parseRowKey(rk);

  const id =
    (e.id ?? e.eventId ?? e.clientId ?? parsed.id ?? rk ?? "missing-id").toString();

  const occurredAt =
    (e.occurredAt ?? e.occurred_at ?? parsed.occurredAt ?? "").toString();

  const recordedAt =
    (e.recordedAt ??
      e.recorded_at ??
      e.createdAt ??
      e.created_at ??
      e.timestamp ??
      new Date().toISOString()
    ).toString();

  const visitorId = (e.visitorId ?? e.visitor_id ?? pk).toString();

  return {
    id,
    visitorId,
    type: (e.type ?? e.eventType ?? e.kind ?? "").toString(),
    notes: e.notes,
    occurredAt,
    recordedAt,
  };
}

function isConflictAlreadyExists(err: any): boolean {
  const status = err?.statusCode ?? err?.status;
  const code =
    err?.details?.odataError?.code ??
    err?.details?.errorCode ??
    err?.code ??
    err?.name;

  return status === 409 || code === "EntityAlreadyExists";
}

export class FormationEventRepository {
  private readonly client: TableClient;
  private ensured = false;

  constructor() {
    const raw =
      process.env.STORAGE_CONNECTION_STRING ||
      (process.env.AzureWebJobsStorage as string | undefined);

    const cs = resolveStorageConnectionString(raw);
    const table = getFormationEventsTableName();
    this.client = makeTableClient(cs, table);
  }

  private async ensureTable(): Promise<void> {
    if (this.ensured) return;
    await ensureTableExists(this.client);
    this.ensured = true;
  }

  /**
   * Create immutable FormationEvent.
   * Idempotent when client supplies args.id:
   *   - if an entity already exists with PartitionKey=visitorId and id=<clientId>, return it.
   */
  async create(args: {
    visitorId: string;
    type: string;
    notes?: string;
    occurredAt: string;
    id?: string;
  }): Promise<FormationEvent> {
    await this.ensureTable();

    const visitorId = (args.visitorId ?? "").toString().trim();
    if (!visitorId) throw new Error("visitorId is required");

    const clientId = String((args as any).id ?? (args as any).idempotencyKey ?? "").trim();
    const id = clientId || randomUUID();

    const occurredAt = (args.occurredAt ?? "").toString().trim() || new Date().toISOString();
    const recordedAt = new Date().toISOString();

    const PartitionKey = visitorId;
    const RowKey = `${occurredAt}__${id}`;

    // Idempotency by client-supplied id (even if occurredAt differs between retries)
    if (clientId) {
      const safePk = PartitionKey.replace(/'/g, "''");
      const safeId = id.replace(/'/g, "''");
      const filter = `PartitionKey eq '${safePk}' and id eq '${safeId}'`;

      for await (const existing of this.client.listEntities({ queryOptions: { filter } })) {
        return toDomain(existing);
      }
    }

    const entity: FormationEventEntity = {
      partitionKey: PartitionKey,
      rowKey: RowKey,
      PartitionKey,
      RowKey,
      id,
      visitorId,
      type: args.type,
      notes: args.notes,
      occurredAt,
      recordedAt,
    };

    try {
      await this.client.createEntity(entity);
    } catch (err: any) {
      if (isConflictAlreadyExists(err)) {
        const got = await this.client.getEntity<FormationEventEntity>(PartitionKey, RowKey);
        return toDomain(got);
      }
      throw err;
    }

    return toDomain(entity);
  }

  /**
   * Newest-first paging. Cursor is RowKey of last item in returned page.
   */
  /**
   * Lookup by visitorId + event id (id column). Used by route idempotency retry.
   */
  async getByVisitorAndId(visitorId: string, id: string): Promise<FormationEvent | undefined> {
    await this.ensureTable();

    const pk = String(visitorId ?? "").trim();
    const eid = String(id ?? "").trim();
    if (!pk || !eid) return undefined;

    const safePk = pk.replace(/'/g, "''");
    const safeId = eid.replace(/'/g, "''");
    const filter = `PartitionKey eq '${safePk}' and id eq '${safeId}'`;

    for await (const e of this.client.listEntities({ queryOptions: { filter } })) {
      return toDomain(e);
    }
    return undefined;
  }
  async listByVisitor(visitorId: string, limit: number, cursor?: string): Promise<FormationEventPage> {
    await this.ensureTable();

    const max = Math.max(1, Math.min(Number(limit ?? 50), 200));
    const pk = (visitorId ?? "").toString().trim();
    const cur = (cursor ?? "").toString().trim();

    const safePk = pk.replace(/'/g, "''");
    let filter = `PartitionKey eq '${safePk}'`;
    if (cur) {
      const safeCur = cur.replace(/'/g, "''");
      filter += ` and RowKey lt '${safeCur}'`;
    }

    // Azure Tables lists ascending by RowKey. We sort DESC in-memory for newest-first.
    const cap = Math.max(50, Math.min(max * 5, 500));

    const rows: any[] = [];
    let n = 0;
    for await (const e of this.client.listEntities({ queryOptions: { filter } })) {
      rows.push(e);
      n++;
      if (n >= cap) break;
    }

    rows.sort((a, b) => {
      const ar = (a.RowKey ?? a.rowKey ?? "").toString();
      const br = (b.RowKey ?? b.rowKey ?? "").toString();
      return br.localeCompare(ar); // DESC
    });

    const pageEntities = rows.slice(0, max);
    const items = pageEntities.map(toDomain);

    const nextCursor =
      pageEntities.length > 0
        ? (pageEntities[pageEntities.length - 1].RowKey ?? pageEntities[pageEntities.length - 1].rowKey)?.toString()
        : undefined;

    return { items, cursor: nextCursor };
  }
}