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
  createdAt: string;
  updatedAt: string;
};

export type CreateVisitorResult = {
  visitor: Visitor;
  created: boolean;
};

export interface VisitorsRepository {
  create(input: { name: string; email?: string }): Promise<CreateVisitorResult>;
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
  async create(input: { name: string; email?: string }): Promise<CreateVisitorResult> {
    const table = await getTableClient(TABLE);
    const id = randomUUID();
    const now = nowIso();

    const emailTrim = typeof input.email === "string" ? input.email.trim() : undefined;
    const emailLower = emailTrim ? emailTrim.toLowerCase() : undefined;

    // Reserve email FIRST (prevents concurrent duplicates)
    if (emailLower) {
    // Reserve email FIRST (prevents concurrent duplicates)
    if (emailLower) {
      const emailKey = encodeURIComponent(emailLower);

      // One repair attempt for a stale EMAIL index (index exists but visitor row missing)
      for (let attempt = 0; attempt < 2; attempt++) {
        const indexEntity: EmailIndexEntity = {
          partitionKey: "EMAIL",
          rowKey: emailKey,
          visitorId: id,
          createdAt: now,
        };

        try {
          await table.createEntity(indexEntity as any);
          break; // reserved successfully
        } catch (err: any) {
          const code = String(err?.code ?? "");
          const status = Number(err?.statusCode ?? err?.status ?? 0);

          if (!(status === 409 || code === "EntityAlreadyExists")) throw err;

          // Already reserved -> return existing visitor if it exists
          try {
            const idx = await table.getEntity<EmailIndexEntity>("EMAIL", emailKey);
            const existingId = (idx as any).visitorId as string | undefined;
            if (existingId) {
              const existing = await this.getById(existingId);
              if (existing) return { visitor: existing, created: false };

              // Stale index: points to missing visitor.
              // Prefer recovery: find an existing VISITOR row by emailLower, repair the index to that visitorId, and return it.
              if (attempt === 0 && emailLower) {
                try {
                  const emailLowerEsc = emailLower.replace(/'/g, "''");
                  const filter = `PartitionKey eq 'VISITOR' and emailLower eq '${emailLowerEsc}'`;

                  let recovered: VisitorEntity | undefined;
                  for await (const e of table.listEntities<VisitorEntity>({ queryOptions: { filter } })) {
                    recovered = e;
                    break;
                  }

                  if (recovered) {
                    const recoveredVisitor = toVisitor(recovered);

                    // Repair index to the recovered visitorId
                    const repaired: EmailIndexEntity = {
                      partitionKey: "EMAIL",
                      rowKey: emailKey,
                      visitorId: recoveredVisitor.visitorId,
                      createdAt: now,
                    };
                    await table.upsertEntity(repaired as any, "Replace");

                    return { visitor: recoveredVisitor, created: false };
                  }
                } catch (e: any) {
                  // If recovery fails for any reason, fall back to delete+retry
                }

                // Fall back: delete the bad index and retry once
                try { await table.deleteEntity("EMAIL", emailKey); } catch { }
                continue;
              }
            }
          } catch (e: any) {
            const st = Number(e?.statusCode ?? e?.status ?? 0);
            const cd = String(e?.code ?? "");
            if (!(st === 404 || cd === "ResourceNotFound")) throw e;
          }

          // If we get here after retry, fail safe (forces visibility instead of silent corruption)
          throw new Error("EMAIL_INDEX_STALE_OR_UNREADABLE");
        }
      }
    }

    }

    const entity: VisitorEntity = {
      partitionKey: PK,
      rowKey: id,
      name: input.name,
      email: emailTrim,
      emailLower: emailLower,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await Promise.race([
        table.createEntity(entity),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("TABLE_CREATE_TIMEOUT")), 8000)
        ),
      ]);
    } catch (err: any) {
      // Best-effort cleanup: if we reserved email, remove index so retries work
      if (emailLower) {
        const emailKey = encodeURIComponent(emailLower);
        try { await table.deleteEntity("EMAIL", emailKey); } catch { }
      }
      throw err;
    }

    return { visitor: toVisitor(entity), created: true };
  }

  async getById(visitorId: string): Promise<Visitor | null> {
    const table = await getTableClient(TABLE);
    try {
      const e = await table.getEntity<VisitorEntity>(PK, visitorId);
      return toVisitor(e);
    } catch (err: any) {
      const code = String(err?.code ?? "");
      const status = Number(err?.statusCode ?? err?.status ?? 0);
      if (code === "ResourceNotFound" || status === 404) return null;
      throw err;
    }
  }

  async getByEmail(email: string): Promise<Visitor | null> {
    const table = await getTableClient(TABLE);
    const raw = (email ?? "").trim();
    if (!raw) return null;

    const emailLower = raw.toLowerCase();
    const emailKey = encodeURIComponent(emailLower);

    try {
      const idx = await table.getEntity<EmailIndexEntity>("EMAIL", emailKey);
      const visitorId = (idx as any).visitorId as string | undefined;
      if (!visitorId) return null;
      return await this.getById(visitorId);
    } catch (err: any) {
      const code = String(err?.code ?? "");
      const status = Number(err?.statusCode ?? err?.status ?? 0);
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

    const entity: VisitorEntity = {
      partitionKey: PK,
      rowKey: visitor.visitorId,
      name: visitor.name,
      email: emailTrim,
      emailLower: emailLower,
      createdAt: visitor.createdAt ?? now,
      updatedAt: now,
    };

    await table.upsertEntity(entity as any, "Merge");
    return toVisitor(entity);
  }
}





