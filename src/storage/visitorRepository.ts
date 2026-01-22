import { TableClient } from "@azure/data-tables";

export type VisitorEntity = {
  partitionKey: string; // mapped from PartitionKey
  rowKey: string;       // mapped from RowKey
  name: string;
  email?: string;
  source?: string;
  createdAtIso: string; // ISO string
};

export type Visitor = {
  id: string;
  name: string;
  email?: string;
  source?: string;
  createdAtIso: string;
};

type ListOptions = {
  limit: number;
};

function getConnectionString(): string {
  return (
    process.env.STORAGE_CONNECTION_STRING ||
    process.env.AzureWebJobsStorage ||
    ""
  );
}

function getVisitorsTableName(): string {
  // Keep your current table name convention.
  // If you already use "devVisitors", leave it.
  return process.env.VISITORS_TABLE || "devVisitors";
}

const VISITOR_PARTITION_KEY = "visitor";

function toDomain(e: VisitorEntity): Visitor {
  return {
    id: e.rowKey,
    name: e.name,
    email: e.email,
    source: e.source,
    createdAtIso: e.createdAtIso,
  };
}

function toEntityProps(v: Omit<VisitorEntity, "partitionKey" | "rowKey">) {
  return {
    PartitionKey: VISITOR_PARTITION_KEY,
    // RowKey is supplied separately for create/upsert calls
    name: v.name,
    email: v.email,
    source: v.source,
    createdAtIso: v.createdAtIso,
  };
}

export class VisitorRepository {
  private readonly client: TableClient;

  constructor(client?: TableClient) {
    const cs = getConnectionString();
    if (!cs) {
      throw new Error(
        "Missing STORAGE_CONNECTION_STRING or AzureWebJobsStorage for Table Storage."
      );
    }
    this.client =
      client ?? TableClient.fromConnectionString(cs, getVisitorsTableName());
  }

  async ensureTable(): Promise<void> {
    await this.client.createTable();
  }

  async create(visitor: {
    id: string;
    name: string;
    email?: string;
    source?: string;
    createdAtIso: string;
  }): Promise<void> {
    await this.client.createEntity({
      ...toEntityProps({
        name: visitor.name,
        email: visitor.email,
        source: visitor.source,
        createdAtIso: visitor.createdAtIso,
      }),
      RowKey: visitor.id,
    });
  }

  async getById(id: string): Promise<Visitor | null> {
    try {
      const e = await this.client.getEntity<any>(VISITOR_PARTITION_KEY, id);

      const entity: VisitorEntity = {
        partitionKey: e.partitionKey ?? e.PartitionKey ?? VISITOR_PARTITION_KEY,
        rowKey: e.rowKey ?? e.RowKey ?? id,
        name: e.name,
        email: e.email,
        source: e.source,
        createdAtIso: e.createdAtIso,
      };

      return toDomain(entity);
    } catch (err: any) {
      // 404 from Tables SDK often appears as RestError with statusCode 404
      if (err?.statusCode === 404) return null;
      throw err;
    }
  }

  async list(options: ListOptions): Promise<{ items: Visitor[]; count: number }> {
    const limit = Math.max(1, Math.min(options.limit ?? 25, 200));

    // IMPORTANT:
    // - OData property name MUST be PartitionKey (capital P, capital K)
    // - Value must match exactly: "visitor"
    const filter = `PartitionKey eq '${VISITOR_PARTITION_KEY}'`;

    const out: Visitor[] = [];

    // Note: Azure Table does not support "ORDER BY" server-side.
    // We’ll fetch up to "limit" and then sort client-side by createdAtIso desc.
    for await (const e of this.client.listEntities<any>({
      queryOptions: { filter },
    })) {
      const entity: VisitorEntity = {
        partitionKey: e.partitionKey ?? e.PartitionKey ?? VISITOR_PARTITION_KEY,
        rowKey: e.rowKey ?? e.RowKey,
        name: e.name,
        email: e.email,
        source: e.source,
        createdAtIso: e.createdAtIso,
      };
      out.push(toDomain(entity));

      // We can early-stop once we have "limit" items,
      // BUT sorting is client-side, so we’ll collect and sort only what we have.
      if (out.length >= limit) break;
    }

    // Newest first (ISO sorts lexicographically if always ISO)
    out.sort((a, b) => (a.createdAtIso < b.createdAtIso ? 1 : -1));

    return { items: out, count: out.length };
  }
}
