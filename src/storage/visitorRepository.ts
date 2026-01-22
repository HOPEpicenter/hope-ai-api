import { TableClient } from "@azure/data-tables";

export type Visitor = {
  id: string;

  // legacy fields your code currently uses
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  status?: string;
  tags?: string[];
  notes?: string;
  source?: string;

  // legacy timestamps (your errors show createdAt/updatedAt, but some code may use created/updated)
  createdAt?: string;
  updatedAt?: string;
  created?: string;
  updated?: string;

  // allow any extra fields without breaking compilation during migration
  [key: string]: any;
};

type ListOptions = { limit: number };

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

function toIso(val: any): string {
  if (typeof val === "string" && val.trim().length) return val;
  return new Date().toISOString();
}

function normalizeTags(raw: any): string[] {
  if (Array.isArray(raw)) return raw.filter((x) => typeof x === "string");
  if (typeof raw === "string" && raw.trim().length) {
    const s = raw.trim();
    if (s.startsWith("[") && s.endsWith("]")) {
      try {
        const arr = JSON.parse(s);
        if (Array.isArray(arr)) return arr.filter((x) => typeof x === "string");
      } catch {
        // ignore
      }
    }
    return s.split(",").map((t) => t.trim()).filter(Boolean);
  }
  return [];
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
   * Back-compat: existing code calls repo.save(visitor).
   * We'll upsert with Merge so partial updates work.
   */
  async save(visitor: Visitor): Promise<void> {
    await this.ensureTable();

    const createdIso = toIso(visitor.createdAt ?? visitor.created);
    const updatedIso = toIso(visitor.updatedAt ?? visitor.updated ?? createdIso);

    // IMPORTANT: Table SDK entity uses lowercase partitionKey/rowKey fields
    const entity: any = {
      partitionKey: VISITOR_PARTITION_KEY,
      rowKey: visitor.id,

      firstName: visitor.firstName ?? "",
      lastName: visitor.lastName ?? "",
      email: visitor.email,
      phone: visitor.phone,
      status: visitor.status,
      notes: visitor.notes,
      source: visitor.source,

      createdAt: createdIso,
      updatedAt: updatedIso,

      // store tags as JSON string to keep schema simple
      tags: JSON.stringify(Array.isArray(visitor.tags) ? visitor.tags : []),
    };

    await this.client.upsertEntity(entity, "Merge");
  }

  async getById(id: string): Promise<Visitor | null> {
    try {
      const e = await this.client.getEntity<any>(VISITOR_PARTITION_KEY, id);

      return {
        id: e.rowKey ?? e.RowKey ?? id,
        firstName: e.firstName,
        lastName: e.lastName,
        email: e.email,
        phone: e.phone,
        status: e.status,
        notes: e.notes,
        source: e.source,
        createdAt: e.createdAt ?? e.created,
        updatedAt: e.updatedAt ?? e.updated,
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

    // IMPORTANT: correct OData property casing
    const filter = `PartitionKey eq '${VISITOR_PARTITION_KEY}'`;

    const out: Visitor[] = [];

    for await (const e of this.client.listEntities<any>({
      queryOptions: { filter },
    })) {
      out.push({
        id: e.rowKey ?? e.RowKey,
        firstName: e.firstName,
        lastName: e.lastName,
        email: e.email,
        phone: e.phone,
        status: e.status,
        notes: e.notes,
        source: e.source,
        createdAt: e.createdAt ?? e.created,
        updatedAt: e.updatedAt ?? e.updated,
        tags: normalizeTags(e.tags),
      });

      if (out.length >= limit) break;
    }

    // sort newest first if we have createdAt values
    out.sort((a, b) => {
      const aa = a.createdAt ?? "";
      const bb = b.createdAt ?? "";
      return aa < bb ? 1 : -1;
    });

    return { items: out, count: out.length };
  }
}
