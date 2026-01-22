import { TableClient } from "@azure/data-tables";

export type Visitor = {
  id: string;
  name: string;
  email?: string;
  source?: string;
  createdAtIso: string;

  // keep optional so legacy code (updateVisitor) compiles
  tags?: string[];
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
  return process.env.VISITORS_TABLE || "devVisitors";
}

const VISITOR_PARTITION_KEY = "visitor";

function normalizeTags(raw: any): string[] | undefined {
  if (Array.isArray(raw)) return raw.filter(x => typeof x === "string");
  if (typeof raw === "string" && raw.trim().length) {
    // if older data stored tags as JSON or CSV, best-effort parse
    const s = raw.trim();
    if (s.startsWith("[") && s.endsWith("]")) {
      try {
        const arr = JSON.parse(s);
        if (Array.isArray(arr)) return arr.filter(x => typeof x === "string");
      } catch { /* ignore */ }
    }
    // CSV fallback
    return s.split(",").map(t => t.trim()).filter(Boolean);
  }
  return undefined;
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

  /**
   * Back-compat for existing code: createVisitor/updateVisitor call repo.save(...)
   * We implement as an UPSERT (replace/merge is fine for dev).
   */
  async save(visitor: Visitor): Promise<void> {
    await this.ensureTable();

    // IMPORTANT: Table SDK entity shape is lower-case keys: partitionKey / rowKey
    const entity: any = {
      partitionKey: VISITOR_PARTITION_KEY,
      rowKey: visitor.id,
      name: visitor.name,
      email: visitor.email,
      source: visitor.source,
      createdAtIso: visitor.createdAtIso,
    };

    // Persist tags if present (as JSON string to keep schema simple)
    if (visitor.tags) {
      entity.tags = JSON.stringify(visitor.tags);
    }

    await this.client.upsertEntity(entity, "Merge");
  }

  async create(visitor: Visitor): Promise<void> {
    // keep create for new codepaths; use save to minimize duplication
    await this.save(visitor);
  }

  async getById(id: string): Promise<Visitor | null> {
    try {
      const e = await this.client.getEntity<any>(VISITOR_PARTITION_KEY, id);

      return {
        id: e.rowKey ?? e.RowKey ?? id,
        name: e.name,
        email: e.email,
        source: e.source,
        createdAtIso: e.createdAtIso,
        tags: normalizeTags(e.tags),
      };
    } catch (err: any) {
      if (err?.statusCode === 404) return null;
      throw err;
    }
  }

  async list(options: ListOptions): Promise<{ items: Visitor[]; count: number }> {
    await this.ensureTable();

    const limit = Math.max(1, Math.min(options.limit ?? 25, 200));

    // IMPORTANT: OData property name MUST be PartitionKey (capital P, K)
    const filter = `PartitionKey eq '${VISITOR_PARTITION_KEY}'`;

    const out: Visitor[] = [];

    for await (const e of this.client.listEntities<any>({
      queryOptions: { filter },
    })) {
      out.push({
        id: e.rowKey ?? e.RowKey,
        name: e.name,
        email: e.email,
        source: e.source,
        createdAtIso: e.createdAtIso,
        tags: normalizeTags(e.tags),
      });

      // early stop once we have enough
      if (out.length >= limit) break;
    }

    // newest first (ISO compares lexicographically)
    out.sort((a, b) => (a.createdAtIso < b.createdAtIso ? 1 : -1));

    return { items: out, count: out.length };
  }
}
