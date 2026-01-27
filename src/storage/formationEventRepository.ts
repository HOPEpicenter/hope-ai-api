import { TableClient } from "@azure/data-tables";
import { v4 as uuid } from "uuid";
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
  PartitionKey: string;
  RowKey: string;
  id: string;
  visitorId: string;
  type: string;
  notes?: string;
  occurredAt: string;
  recordedAt: string;
};

function getFormationEventsTableName(): string {
  return process.env.FORMATION_EVENTS_TABLE || "devFormationEvents";
}

function toDomain(e: any): FormationEvent {
  return {
    id: String(e.id),
    visitorId: String(e.visitorId),
    type: String(e.type),
    notes: e.notes !== undefined && e.notes !== null ? String(e.notes) : undefined,
    occurredAt: String(e.occurredAt),
    recordedAt: String(e.recordedAt),
  };
}

function cursorFrom(event: FormationEvent): string {
  return `${event.occurredAt}_${event.id}`;
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

  async create(args: {
    visitorId: string;
    type: string;
    notes?: string;
    occurredAt: string;
    id?: string;
  }): Promise<FormationEvent> {
    await this.ensureTable();

    const visitorId = String(args.visitorId || "").trim();
    const type = String(args.type || "").trim();
    const occurredAt = String(args.occurredAt || "").trim();
    const notes = args.notes !== undefined ? String(args.notes) : undefined;

    if (!visitorId) throw new Error("visitorId is required");
    if (!type) throw new Error("type is required");
    if (!occurredAt) throw new Error("occurredAt is required");

    const id = (args.id ? String(args.id) : uuid()).trim();
    const recordedAt = new Date().toISOString();

    const ent: FormationEventEntity = {
      PartitionKey: visitorId,
      RowKey: `${occurredAt}_${id}`,
      id,
      visitorId,
      type,
      notes,
      occurredAt,
      recordedAt,
    };

    try {
      await this.client.createEntity(ent as any);
    } catch (err: any) {
      // Re-throw but mark it as a conflict for callers that want idempotent behavior.
      if (isConflictAlreadyExists(err)) throw err;
      throw err;
    }

    return { id, visitorId, type, notes, occurredAt, recordedAt };
  }

  async getByVisitorAndId(visitorId: string, id: string): Promise<FormationEvent | null> {
    await this.ensureTable();

    const pk = String(visitorId || "").trim();
    const eid = String(id || "").trim();
    if (!pk) throw new Error("visitorId is required");
    if (!eid) throw new Error("id is required");

    // id is stored as a property; query it (safe + avoids needing occurredAt).
    const filter = `PartitionKey eq '${pk}' and id eq '${eid}'`;

    for await (const e of this.client.listEntities<FormationEventEntity>({ queryOptions: { filter } })) {
      return toDomain(e);
    }
    return null;
  }

  async listByVisitor(
    visitorId: string,
    limit: number,
    cursor?: string
  ): Promise<{ items: FormationEvent[]; cursor: string }> {
    await this.ensureTable();

    const pk = String(visitorId || "").trim();
    if (!pk) throw new Error("visitorId is required");

    const max = Math.max(1, Math.min(limit || 50, 200));
    const upperExclusive = cursor ? String(cursor) : undefined;

    const filter = upperExclusive
      ? `PartitionKey eq '${pk}' and RowKey lt '${upperExclusive}'`
      : `PartitionKey eq '${pk}'`;

    const rows: FormationEvent[] = [];
    for await (const e of this.client.listEntities<FormationEventEntity>({ queryOptions: { filter } })) {
      rows.push(toDomain(e));
    }

    // RowKey is occurredAt_id, but we sort by occurredAt then id to be safe.
    rows.sort((a, b) =>
      a.occurredAt === b.occurredAt ? (a.id < b.id ? 1 : -1) : a.occurredAt < b.occurredAt ? 1 : -1
    );

    const items = rows.slice(0, max);
    const next = items.length === max ? cursorFrom(items[items.length - 1]) : "";

    return { items, cursor: next };
  }
}