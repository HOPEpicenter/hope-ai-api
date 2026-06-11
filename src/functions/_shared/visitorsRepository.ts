import { randomUUID } from "crypto";
import { getTableClient } from "./tableClient";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";

export type FunctionVisitor = {
  visitorId: string;
  name: string;
  email?: string;
  phone?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  birthday?: string;
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
  phone?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  birthday?: string;
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
    phone: entity.phone,
    address1: entity.address1,
    address2: entity.address2,
    city: entity.city,
    state: entity.state,
    postalCode: entity.postalCode,
    birthday: entity.birthday,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt
  };
}

export async function getVisitorById(visitorId: string): Promise<FunctionVisitor | null> {
  const table = getTableClient(TABLE);
  await ensureTableExists(table);

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
  await ensureTableExists(table);
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
  return { items, count: all.length };
}

export async function createVisitorRecord(input: {
  name: string;
  email?: string;
  phone?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  birthday?: string;
}): Promise<FunctionCreateVisitorResult> {
  const table = getTableClient(TABLE);
  await ensureTableExists(table);
  const id = randomUUID();
  const now = nowIso();

  const emailTrim = typeof input.email === "string" ? input.email.trim() : undefined;
  const emailLower = emailTrim ? emailTrim.toLowerCase() : undefined;
  const phoneTrim = typeof input.phone === "string" ? input.phone.trim() : undefined;
  const address1Trim = typeof input.address1 === "string" ? input.address1.trim() : undefined;
  const address2Trim = typeof input.address2 === "string" ? input.address2.trim() : undefined;
  const cityTrim = typeof input.city === "string" ? input.city.trim() : undefined;
  const stateTrim = typeof input.state === "string" ? input.state.trim() : undefined;
  const postalCodeTrim = typeof input.postalCode === "string" ? input.postalCode.trim() : undefined;
  const birthdayTrim = typeof input.birthday === "string" ? input.birthday.trim() : undefined;

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
    phone: phoneTrim,
    address1: address1Trim,
    address2: address2Trim,
    city: cityTrim,
    state: stateTrim,
    postalCode: postalCodeTrim,
    birthday: birthdayTrim,
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
export async function updateVisitorRecord(
  visitorId: string,
  input: {
    name?: string;
    email?: string;
    phone?: string;
    address1?: string;
    address2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    birthday?: string;
  }
): Promise<FunctionVisitor | null> {
  const table = getTableClient(TABLE);
  await ensureTableExists(table);

  const visitor = await getVisitorById(visitorId);
  if (!visitor) return null;

  const entity = await table.getEntity<VisitorEntity>(VISITOR_PK, visitorId);
  const now = nowIso();

  const nextName = typeof input.name === "string" ? input.name.trim() : entity.name;
  const nextEmail = typeof input.email === "string" ? input.email.trim() : entity.email;
  const nextPhone = typeof input.phone === "string" ? input.phone.trim() : entity.phone;
  const nextAddress1 = typeof input.address1 === "string" ? input.address1.trim() : entity.address1;
  const nextAddress2 = typeof input.address2 === "string" ? input.address2.trim() : entity.address2;
  const nextCity = typeof input.city === "string" ? input.city.trim() : entity.city;
  const nextState = typeof input.state === "string" ? input.state.trim() : entity.state;
  const nextPostalCode = typeof input.postalCode === "string" ? input.postalCode.trim() : entity.postalCode;
  const nextBirthday = typeof input.birthday === "string" ? input.birthday.trim() : entity.birthday;

  if (!nextName) {
    throw new Error("name is required");
  }

  const updated: VisitorEntity = {
    ...entity,
    name: nextName,
    email: nextEmail || undefined,
    emailLower: nextEmail ? nextEmail.toLowerCase() : undefined,
    phone: nextPhone || undefined,
    address1: nextAddress1 || undefined,
    address2: nextAddress2 || undefined,
    city: nextCity || undefined,
    state: nextState || undefined,
    postalCode: nextPostalCode || undefined,
    birthday: nextBirthday || undefined,
    updatedAt: now
  };

  await table.upsertEntity(updated as any, "Replace");

  return toVisitor(updated);
}

