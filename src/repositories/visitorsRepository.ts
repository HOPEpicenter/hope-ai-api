import { getTableClient } from "../storage/tableClient";
import { randomUUID } from "crypto";

export type VisitorEntity = {
  partitionKey: "VISITOR";
  rowKey: string; // visitorId
  name: string;
  email?: string;
  emailLower?: string; // canonical lowercase for consistency
  createdAt: string; // ISO
  updatedAt: string; // ISO
};

export type EmailIndexEntity = {
  partitionKey: "EMAIL";
  rowKey: string; // encodeURIComponent(emailLower)
  visitorId: string;
  createdAt: string; // ISO
};

export type Visitor = {
  visitorId: string;
  name: string;
  email?: string;
  emailLower?: string; // canonical lowercase for consistency
  createdAt: string;
  updatedAt: string;
};

export interface VisitorsRepository {
  create(input: { name: string; email?: string }): Promise<Visitor>;
  getById(visitorId: string): Promise<Visitor | null>;
  getByEmail(email: string): Promise<Visitor | null>;
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

    const emailTrim = typeof input.email === "string" ? input.email.trim() : undefined;
    const emailLower = emailTrim ? emailTrim.toLowerCase() : undefined;
    const entity: VisitorEntity = {
      partitionKey: PK,
      rowKey: id,
      name: input.name,
      email: emailTrim,
      emailLower: emailLower,
      createdAt: now,
      updatedAt: now,
    };

    await Promise.race([
      table.createEntity(entity),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("TABLE_CREATE_TIMEOUT")), 8000)
      ),
    ]);

    // EMAIL index for idempotency (same email -> same visitorId)
    if (emailLower) {
      // emailLower already computed above
      const emailKey = encodeURIComponent(emailLower!);
      const indexEntity: EmailIndexEntity = {
        partitionKey: "EMAIL",
        rowKey: emailKey,
        visitorId: id,
        createdAt: now,
      };

      try {
        await table.createEntity(indexEntity as any);
      } catch (err: any) {
        const status = err?.statusCode ?? err?.status;
        // 409 = already exists (idempotent repeat)
        if (status !== 409) throw err;
      }
    }

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
      const emailKey = encodeURIComponent(emailLower!);
    try {
      const idx = await table.getEntity<EmailIndexEntity>("EMAIL", emailKey);
      const visitorId = (idx as any).visitorId as string | undefined;
      if (!visitorId) return null;
      return await this.getById(visitorId);
    } catch (err: any) {
      const code = String(err?.code ?? "");
      const status = Number(err?.statusCode ?? 0);
      if (code === "ResourceNotFound" || status === 404) return null;
      throw err;
    }
  }

  async list(input: { limit: number }): Promise<{ items: Visitor[]; count: number }> {
    const table = await getTableClient(TABLE);
    const limit = Math.max(1, Math.min(input?.limit ?? 5, 200));

    const items: Visitor[] = [];
    const filter = "PartitionKey eq 'VISITOR'";

    for await (const e of table.listEntities<VisitorEntity>({ queryOptions: { filter } })) {
      items.push(toVisitor(e as any));
      if (items.length >= limit) break;
    }

    return { items, count: items.length };
  }

  async upsert(visitor: Visitor): Promise<Visitor> {
    const table = await getTableClient(TABLE);
    const now = nowIso();

    

    const emailTrim = typeof visitor.email === "string" ? visitor.email.trim() : undefined;
    const emailLower = emailTrim ? emailTrim.toLowerCase() : undefined;
const emailTrim = typeof input.email === "string" ? input.email.trim() : undefined;
    const emailLower = emailTrim ? emailTrim.toLowerCase() : undefined;
    const entity: VisitorEntity = {
      partitionKey: PK,
      rowKey: visitor.visitorId,
      name: visitor.name,
      email: emailTrim,
      createdAt: visitor.createdAt ?? now,
      updatedAt: now,
    };

    await table.upsertEntity(entity as any, "Merge");
    return toVisitor(entity);
  }
}


