import { TableClient } from "@azure/data-tables";
import { resolveStorageConnectionString } from "../shared/storage/resolveStorageConnectionString";

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

export class EngagementRepository {
  private readonly client: TableClient;

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
  }

  async ensureTable(): Promise<void> {
    // Create is idempotent in Azurite/SDK; if you see conflicts later we can switch to "create if not exists".
    await this.client.createTable();
  }

  async create(input: {
    visitorId: string;
    type: string;
    channel?: string;
    notes?: string;
    occurredAt?: string;
  }): Promise<EngagementEvent> {
    await this.ensureTable();

    const id =
      (globalThis.crypto as any)?.randomUUID?.() ??
      require("crypto").randomUUID();

    const occurredAt =
      input.occurredAt && input.occurredAt.trim() ? input.occurredAt : isoNow();
    const recordedAt = isoNow();

    const entity: any = {
      partitionKey: input.visitorId,
      rowKey: makeRowKey(occurredAt, id),

      id,
      visitorId: input.visitorId,
      type: input.type,
      channel: input.channel ?? "",
      notes: input.notes ?? "",

      occurredAt,
      recordedAt,
    };

    await this.client.createEntity(entity);

    return {
      id,
      visitorId: input.visitorId,
      type: input.type,
      channel: input.channel,
      notes: input.notes,
      occurredAt,
      recordedAt,
    };
  }

  async listByVisitor(visitorId: string, limit: number): Promise<EngagementEvent[]> {
    await this.ensureTable();

    const items: EngagementEvent[] = [];
    const max = Math.max(1, Math.min(limit || 50, 200));
    const filter = `PartitionKey eq '${visitorId.replace(/'/g, "''")}'`;

    for await (const e of this.client.listEntities<any>({ queryOptions: { filter } })) {
      items.push({
        id: e.id,
        visitorId: e.visitorId,
        type: e.type,
        channel: e.channel || "",
        notes: e.notes || "",
        occurredAt: e.occurredAt,
        recordedAt: e.recordedAt,
      });

      if (items.length >= max) break;
    }

    // newest-first
    items.sort((a, b) =>
      a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0
    );

    return items;
  }
}
