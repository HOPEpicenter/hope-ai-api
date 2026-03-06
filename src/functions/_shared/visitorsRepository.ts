import { randomUUID } from "crypto";
import { getTableClient } from "./tableClient";

export type FunctionVisitor = {
  visitorId: string;
  name: string;
  email?: string;
  createdAt: string;
  updatedAt: string;
};

export type FunctionCreateVisitorResult = {
  visitor: FunctionVisitor;
  created: boolean;
};

type VisitorEntity = {
  partitionKey: "VISITOR";
  rowKey: string;
  name: string;
  email?: string;
  emailLower?: string;
  createdAt: string;
  updatedAt: string;
};

type EmailIndexEntity = {
  partitionKey: "EMAIL";
  rowKey: string;
  visitorId: string;
  createdAt: string;
};

const TABLE = "Visitors";
const VISITOR_PK: VisitorEntity["partitionKey"] = "VISITOR";

function nowIso(): string {
  return new Date().toISOString();
}

function toVisitor(entity: VisitorEntity): FunctionVisitor {
  return {
    visitorId: entity.rowKey,
    name: entity.name,
    email: entity.email,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt
  };
}

export async function getVisitorById(visitorId: string): Promise<FunctionVisitor | null> {
  const table = getTableClient(TABLE);

  try {
    const entity = await table.getEntity<VisitorEntity>(VISITOR_PK, visitorId);
    return toVisitor(entity);
  } catch (err: any) {
    const code = String(err?.code ?? "");
    const status = Number(err?.statusCode ?? err?.status ?? 0);
    if (code === "ResourceNotFound" || status === 404) {
      return null;
    }
    throw err;
  }
}

export async function listVisitorsRecords(input: { limit: number }): Promise<{ items: FunctionVisitor[]; count: number }> {
  const table = getTableClient(TABLE);
  const limit = Math.max(1, Math.min(input?.limit ?? 25, 200));
  const scanCap = 500;

  const all: FunctionVisitor[] = [];
  const filter = "PartitionKey eq 'VISITOR'";

  for await (const entity of table.listEntities<VisitorEntity>({ queryOptions: { filter } })) {
    all.push(toVisitor(entity));
    if (all.length >= scanCap) {
      break;
    }
  }

  all.sort((a, b) => {
    const au = a.updatedAt || a.createdAt || "";
    const bu = b.updatedAt || b.createdAt || "";
    if (au < bu) return 1;
    if (au > bu) return -1;

    const ai = a.visitorId || "";
    const bi = b.visitorId || "";
    if (ai < bi) return -1;
    if (ai > bi) return 1;
    return 0;
  });

  const items = all.slice(0, limit);
  return { items, count: items.length };
}

export async function createVisitorRecord(input: { name: string; email?: string }): Promise<FunctionCreateVisitorResult> {
  const table = getTableClient(TABLE);
  const id = randomUUID();
  const now = nowIso();

  const emailTrim = typeof input.email === "string" ? input.email.trim() : undefined;
  const emailLower = emailTrim ? emailTrim.toLowerCase() : undefined;

  if (emailLower) {
    const emailKey = encodeURIComponent(emailLower);

    for (let attempt = 0; attempt < 2; attempt++) {
      const indexEntity: EmailIndexEntity = {
        partitionKey: "EMAIL",
        rowKey: emailKey,
        visitorId: id,
        createdAt: now
      };

      try {
        await table.createEntity(indexEntity as any);
        break;
      } catch (err: any) {
        const code = String(err?.code ?? "");
        const status = Number(err?.statusCode ?? err?.status ?? 0);

        if (!(status === 409 || code === "EntityAlreadyExists")) {
          throw err;
        }

        try {
          const idx = await table.getEntity<EmailIndexEntity>("EMAIL", emailKey);
          const existingId = (idx as any).visitorId as string | undefined;

          if (existingId) {
            const existing = await getVisitorById(existingId);
            if (existing) {
              return { visitor: existing, created: false };
            }

            if (attempt === 0) {
              try {
                const emailLowerEsc = emailLower.replace(/'/g, "''");
                const filter = `PartitionKey eq 'VISITOR' and emailLower eq '${emailLowerEsc}'`;

                let recovered: VisitorEntity | undefined;
                for await (const entity of table.listEntities<VisitorEntity>({ queryOptions: { filter } })) {
                  recovered = entity;
                  break;
                }

                if (recovered) {
                  const recoveredVisitor = toVisitor(recovered);

                  const repaired: EmailIndexEntity = {
                    partitionKey: "EMAIL",
                    rowKey: emailKey,
                    visitorId: recoveredVisitor.visitorId,
                    createdAt: now
                  };

                  await table.upsertEntity(repaired as any, "Replace");
                  return { visitor: recoveredVisitor, created: false };
                }
              } catch {
              }

              try {
                await table.deleteEntity("EMAIL", emailKey);
              } catch {
              }

              continue;
            }
          }
        } catch (readErr: any) {
          const readCode = String(readErr?.code ?? "");
          const readStatus = Number(readErr?.statusCode ?? readErr?.status ?? 0);
          if (!(readCode === "ResourceNotFound" || readStatus === 404)) {
            throw readErr;
          }
        }

        throw new Error("EMAIL_INDEX_STALE_OR_UNREADABLE");
      }
    }
  }

  const entity: VisitorEntity = {
    partitionKey: VISITOR_PK,
    rowKey: id,
    name: input.name,
    email: emailTrim,
    emailLower,
    createdAt: now,
    updatedAt: now
  };

  try {
    await Promise.race([
      table.createEntity(entity as any),
      new Promise((_, reject) => setTimeout(() => reject(new Error("TABLE_CREATE_TIMEOUT")), 8000))
    ]);
  } catch (err: any) {
    if (emailLower) {
      const emailKey = encodeURIComponent(emailLower);
      try {
        await table.deleteEntity("EMAIL", emailKey);
      } catch {
      }
    }
    throw err;
  }

  return {
    visitor: toVisitor(entity),
    created: true
  };
}
