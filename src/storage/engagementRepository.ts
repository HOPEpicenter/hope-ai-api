import { TableClient } from "@azure/data-tables";
import { resolveStorageConnectionString } from "../shared/storage/resolveStorageConnectionString";
import { EngagementSummaryRepository } from "./engagementSummaryRepository";

export type EngagementEvent = {
  id: string;
  visitorId: string;

  type: string;
  channel?: string;
  notes?: string;

  occurredAt: string;
  recordedAt: string;

  [key: string]: any;
};

function getConnectionString(): string {
  return resolveStorageConnectionString(
    process.env.STORAGE_CONNECTION_STRING ||
      process.env.AzureWebJobsStorage ||
      ""
  );
}

function getEngagementsTableName(): string {
  return process.env.ENGAGEMENTS_TABLE || "devEngagementEvents";
}

function isoNow(): string {
  return new Date().toISOString();
}

function makeRowKey(occurredAtIso: string, id: string): string {
  return `${occurredAtIso}_${id}`;
}

function isConflictAlreadyExists(err: any): boolean {
  const status = err?.statusCode ?? err?.status;
  const code = err?.code;
  return status === 409 || code === "EntityAlreadyExists";
}

export class EngagementRepository {
  private readonly client: TableClient;
  private readonly summaries: EngagementSummaryRepository;

  constructor(client?: TableClient) {
    const cs = getConnectionString();
    if (!cs) {
      throw new Error(
        "Missing STORAGE_CONNECTION_STRING or AzureWebJobsStorage for Table Storage."
      );
    }

    this.client =
      client ??
      TableClient.fromConnectionString(cs, getEngagementsTableName(), {
        allowInsecureConnection: true,
      });

    this.summaries = new EngagementSummaryRepository();
  }

  private toEvent(e: any): EngagementEvent {
    return {
      id: e.id,
      visitorId: e.visitorId,
      type: e.type,
      channel: e.channel || "",
      notes: e.notes || "",
      occurredAt: e.occurredAt,
      recordedAt: e.recordedAt,
    };
  }

  async ensureTable(): Promise<void> {
    try {
      await this.client.createTable();
    } catch (e: any) {
      // Azurite/Storage throws if already exists; ignore that
      if (!isConflictAlreadyExists(e)) throw e;
    }
  }

  async create(input: {
    id?: string;            // Ã¢Å“â€¦ Option A: allow client-supplied id
    visitorId: string;
    type: string;
    channel?: string;
    notes?: string;
    occurredAt?: string;
  }): Promise<EngagementEvent> {
    await this.ensureTable();

    const id =
      (input.id && input.id.trim())
        ? input.id.trim()
        : ((globalThis.crypto as any)?.randomUUID?.() ??
           require("crypto").randomUUID());

    const occurredAt =
      input.occurredAt && input.occurredAt.trim() ? input.occurredAt : isoNow();

    const recordedAt = isoNow();
    const rowKey = makeRowKey(occurredAt, id);

    const entity: any = {
      partitionKey: input.visitorId,
      rowKey,

      id,
      visitorId: input.visitorId,
      type: input.type,
      channel: input.channel ?? "",
      notes: input.notes ?? "",

      occurredAt,
      recordedAt,
    };

    try {
      await this.client.createEntity(entity);

      // Ã¢Å“â€¦ Only apply snapshot if we actually created a new entity
      await this.summaries.applyEvent({
        visitorId: input.visitorId,
        rowKey,
        type: input.type,
        channel: input.channel ?? "",
        occurredAt,
      });

      return this.toEvent(entity);
    } catch (e: any) {
      // Ã¢Å“â€¦ Idempotency: if same (visitorId + occurredAt + id) already exists,
      // return it and DO NOT re-apply summary.
      if (!isConflictAlreadyExists(e)) throw e;

      const existing = await this.client.getEntity<any>(input.visitorId, rowKey);
      return this.toEvent(existing);
    }
  }

  async listByVisitor(visitorId: string, limit: number): Promise<EngagementEvent[]> {
    await this.ensureTable();

    const items: EngagementEvent[] = [];
    const max = Math.max(1, Math.min(limit || 50, 200));
    const filter = `PartitionKey eq '${visitorId.replace(/'/g, "''")}'`;

    for await (const e of this.client.listEntities<any>({ queryOptions: { filter } })) {
      items.push(this.toEvent(e));
      if (items.length >= max) break;
    }

    // newest-first
    items.sort((a, b) =>
      a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0
    );

    return items;
  }
}
