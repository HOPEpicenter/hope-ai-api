import { getTableClient } from "../storage/tableClient";
import { randomUUID } from "crypto";

export type VisitorEntity = {
  partitionKey: "VISITOR";
  rowKey: string; // visitorId
  name: string;
  email?: string;
  emailLower?: string; // normalized (lowercase) for idempotency lookup
  createdAt: string; // ISO
  updatedAt: string; // ISO
};

export type Visitor = {
  visitorId: string;
  name: string;
  email?: string;
  emailLower?: string; // normalized (lowercase) for idempotency lookup
  createdAt: string;
  updatedAt: string;
};

export interface VisitorsRepository {
  create(input: { name: string; email?: string }): Promise<Visitor>;
  getById(visitorId: string): Promise<Visitor | null>;
  list(input: { limit: number }): Promise<{ items: Visitor[]; count: number }>;
  upsert(visitor: Visitor): Promise<Visitor>;
}

const TABLE = "Visitors";
const PK: VisitorEntity["partitionKey"] = "VISITOR";

function toVisitor(e: VisitorEntity): Visitor {
  return {
    visitorId: e.rowKey,
    name: e.name,
    email: e.email,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

export class AzureTableVisitorsRepository implements VisitorsRepository {
  async create(input: { name: string; email?: string }): Promise<Visitor> {
    const table = await getTableClient(TABLE);
    const id = randomUUID();
    const now = nowIso();

    const entity: VisitorEntity = {
      partitionKey: PK,
      rowKey: id,
      name: input.name,
      email: input.email,
      createdAt: now,
      updatedAt: now,
    };

    await Promise.race([
      table.createEntity(entity),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("TABLE_CREATE_TIMEOUT")), 8000)
      ),
    ]);

    return toVisitor(entity);
  }

  async getById(visitorId: string): Promise<Visitor | null> {
    const table = await getTableClient(TABLE);
    try {
      const e = await table.getEntity<VisitorEntity>(PK, visitorId);
      return toVisitor(e);
    } catch (err: any) {
      const code = String(err?.code ?? "");
      const status = Number(err?.statusCode ?? 0);
      if (code === "ResourceNotFound" || status === 404) return null;
      throw err;
    }
  }

  async getByEmail(email: string): Promise<Visitor | null> {
    const table = await getTableClient(TABLE);

    const raw = (email ?? "").trim();
    if (!raw) return null;

    const emailLower = raw.toLowerCase();

    // Escape single quotes for OData
    const safe = emailLower.replace(/'/g, "''");
    const filter = `PartitionKey eq 'VISITOR' and emailLower eq '${safe}'`;

    for await (const e of table.listEntities<VisitorEntity>({ queryOptions: { filter } })) {
      return toVisitor(e);
    }

    return null;
  }
  async list(input: { limit: number }): Promise<{ items: Visitor[]; count: number }> {
    const table = await getTableClient(TABLE);
    const limit = Math.max(1, Math.min(input?.limit ?? 5, 200));

    const items: Visitor[] = [];
    const filter = "PartitionKey eq 'VISITOR'";

    for await (const e of table.listEntities<VisitorEntity>({ queryOptions: { filter } })) {
      items.push(toVisitor(e));
      if (items.length >= limit) break;
    }

    return { items, count: items.length };
  }

  async upsert(visitor: Visitor): Promise<Visitor> {
    const table = await getTableClient(TABLE);
    const now = nowIso();

    const entity: VisitorEntity = {
      partitionKey: PK,
      rowKey: visitor.visitorId,
      name: visitor.name,
      email: visitor.email,
      createdAt: visitor.createdAt ?? now,
      updatedAt: now,
    };

    await table.upsertEntity(entity, "Merge");
    return toVisitor(entity);
  }
}



