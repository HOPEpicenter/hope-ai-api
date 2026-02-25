import { randomUUID } from "crypto";
import { getTableClient } from "../storage/tableClient";

const TABLE = "EngagementEvents";

export type EngagementKind = string;

export type EngagementEvent = {
  engagementId: string;
  visitorId: string;
  kind: EngagementKind;
  occurredAt: string; // ISO
  createdAt: string;  // ISO
  metadata?: Record<string, any>;
};

type EngagementEntity = {
  partitionKey: string; // visitorId
  rowKey: string;       // sortable key
  engagementId: string;
  visitorId: string;
  kind: string;
  occurredAt: string;
  createdAt: string;
  metadata?: string; // JSON
};

function nowIso(): string {
  return new Date().toISOString();
}

function toEvent(e: EngagementEntity): EngagementEvent {
  let meta: any = undefined;
  try { meta = e.metadata ? JSON.parse(e.metadata) : undefined; } catch { meta = undefined; }

  return {
    engagementId: e.engagementId,
    visitorId: e.visitorId,
    kind: e.kind,
    occurredAt: e.occurredAt,
    createdAt: e.createdAt,
    metadata: meta,
  };
}

export interface EngagementsRepository {
  create(input: {
    visitorId: string;
    kind: string;
    occurredAt?: string;
    metadata?: Record<string, any>;
  }): Promise<EngagementEvent>;

  list(input: { visitorId: string; limit: number }): Promise<{ items: EngagementEvent[]; count: number }>;

  summary(input: { visitorId: string; limit?: number }): Promise<{
    visitorId: string;
    total: number;
    byKind: Record<string, number>;
  }>;
}

export class AzureTableEngagementsRepository implements EngagementsRepository {
  async create(input: { visitorId: string; kind: string; occurredAt?: string; metadata?: Record<string, any> }): Promise<EngagementEvent> {
    const table = await getTableClient(TABLE);

    const visitorId = String(input.visitorId || "").trim();
    const kind = String(input.kind || "").trim();
    if (!visitorId) throw new Error("visitorId is required");
    if (!kind) throw new Error("kind is required");

    const id = randomUUID();
    const createdAt = nowIso();
    const occurredAt = (input.occurredAt && String(input.occurredAt).trim()) ? String(input.occurredAt).trim() : createdAt;

    // rowKey sorts by time, then uuid
    const rowKey = `${occurredAt}_${id}`;

    const entity: EngagementEntity = {
      partitionKey: visitorId,
      rowKey,
      engagementId: id,
      visitorId,
      kind,
      occurredAt,
      createdAt,
      metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
    };

    await table.upsertEntity(entity as any, "Merge");
    return toEvent(entity);
  }

  async list(input: { visitorId: string; limit: number }): Promise<{ items: EngagementEvent[]; count: number }> {
    const table = await getTableClient(TABLE);

    const visitorId = String(input.visitorId || "").trim();
    if (!visitorId) throw new Error("visitorId is required");

    const limit = Math.max(1, Math.min(input?.limit ?? 10, 200));

    const items: EngagementEvent[] = [];
    const filter = `PartitionKey eq '${visitorId.replace(/'/g, "''")}'`;

    for await (const e of table.listEntities<EngagementEntity>({ queryOptions: { filter } })) {
      items.push(toEvent(e as any));
      if (items.length >= limit) break;
    }

    return { items, count: items.length };
  }

  async summary(input: { visitorId: string; limit?: number }): Promise<{ visitorId: string; total: number; byKind: Record<string, number> }> {
    // Keep it cheap: aggregate from list (limit can be bumped if needed)
    const visitorId = String(input.visitorId || "").trim();
    if (!visitorId) throw new Error("visitorId is required");

    const limit = Math.max(1, Math.min(input?.limit ?? 200, 1000));
    const { items } = await this.list({ visitorId, limit });

    const byKind: Record<string, number> = {};
    for (const it of items) byKind[it.kind] = (byKind[it.kind] ?? 0) + 1;

    return { visitorId, total: items.length, byKind };
  }
}
