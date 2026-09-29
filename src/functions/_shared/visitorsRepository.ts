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
  phoneCanonical?: string;
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

type PhoneIndexEntity = {
  partitionKey: "PHONE";
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

export function normalizePhoneIdentifier(phone: string): string {
  const trimmed = phone.trim();
  if (!trimmed || !/^[0-9\s().+\-]+$/.test(trimmed)) return "";
  return trimmed.replace(/\D/g, "");
}

async function recoverMissingPhoneIdentity(
  table: any,
  rowKey: string,
  canonical: string,
  now: string
): Promise<{ visitorId: string } | null> {
  const canonicalFilter = `PartitionKey eq 'VISITOR' and phoneCanonical eq '${canonical.replace(/'/g, "''")}'`;
  const canonicalMatches: VisitorEntity[] = [];
  for await (const entity of table.listEntities({ queryOptions: { filter: canonicalFilter } })) {
    canonicalMatches.push(entity);
  }

  if (canonicalMatches.length > 1) throw new Error("PHONE_IDENTITY_CONFLICT");
  if (canonicalMatches.length === 1) {
    return await reserveRecoveredPhone(table, canonicalMatches[0], rowKey, canonical, now);
  }

  const legacyMatches: VisitorEntity[] = [];
  for await (const entity of table.listEntities({ queryOptions: { filter: "PartitionKey eq 'VISITOR'" } })) {
    if (normalizePhoneIdentifier(entity.phone || "") === canonical) legacyMatches.push(entity);
  }

  if (legacyMatches.length > 1) throw new Error("PHONE_IDENTITY_CONFLICT");
  if (legacyMatches.length === 0) return null;
  return await reserveRecoveredPhone(table, legacyMatches[0], rowKey, canonical, now);
}

async function reserveRecoveredPhone(
  table: any,
  entity: VisitorEntity,
  rowKey: string,
  canonical: string,
  now: string
): Promise<{ visitorId: string }> {
  let createdIndex = false;
  try {
    await table.createEntity({ partitionKey: "PHONE", rowKey, visitorId: entity.rowKey, createdAt: now });
    createdIndex = true;
  } catch (err: any) {
    const code = String(err?.code ?? "");
    const status = Number(err?.statusCode ?? err?.status ?? 0);
    if (!(status === 409 || code === "EntityAlreadyExists")) throw err;
    const existingIndex = await table.getEntity("PHONE", rowKey);
    if ((existingIndex as any).visitorId !== entity.rowKey) throw new Error("PHONE_IDENTITY_CONFLICT");
  }

  if (!entity.phoneCanonical) {
    try {
      await table.upsertEntity({ ...entity, phoneCanonical: canonical, updatedAt: now } as any, "Replace");
    } catch (err) {
      if (createdIndex) {
        try { await table.deleteEntity("PHONE", rowKey); } catch { }
      }
      throw err;
    }
  }

  return { visitorId: entity.rowKey };
}

async function resolveIdentity(
  table: any,
  partitionKey: "EMAIL" | "PHONE",
  rowKey: string,
  field: "emailLower" | "phoneCanonical",
  canonical: string,
  now: string
): Promise<{ visitorId: string } | null> {
  try {
    const index = await table.getEntity(partitionKey, rowKey);
    const visitorId = (index as any).visitorId as string | undefined;
    if (!visitorId) return null;

    const existing = await getVisitorById(visitorId);
    if (existing) return { visitorId };

    const escaped = canonical.replace(/'/g, "''");
    const filter = `PartitionKey eq 'VISITOR' and ${field} eq '${escaped}'`;
    let recovered: VisitorEntity | undefined;
    for await (const entity of table.listEntities({ queryOptions: { filter } })) {
      recovered = entity;
      break;
    }

    if (recovered) {
      const repaired = {
        partitionKey: partitionKey,
        rowKey,
        visitorId: recovered.rowKey,
        createdAt: now
      };
      await table.upsertEntity(repaired as any, "Replace");
      return { visitorId: recovered.rowKey };
    }

    throw new Error(`${partitionKey}_INDEX_STALE_OR_UNREADABLE`);
  } catch (err: any) {
    const code = String(err?.code ?? "");
    const status = Number(err?.statusCode ?? err?.status ?? 0);
    if (partitionKey === "PHONE" && (code === "ResourceNotFound" || status === 404)) {
      return await recoverMissingPhoneIdentity(table, rowKey, canonical, now);
    }
    if (code === "ResourceNotFound" || status === 404) return null;
    throw err;
  }
}

async function reserveIdentity(
  table: any,
  partitionKey: "EMAIL" | "PHONE",
  rowKey: string,
  visitorId: string,
  now: string
): Promise<{ visitorId?: string; created: boolean }> {
  try {
    await table.createEntity({ partitionKey, rowKey, visitorId, createdAt: now });
    return { created: true };
  } catch (err: any) {
    const code = String(err?.code ?? "");
    const status = Number(err?.statusCode ?? err?.status ?? 0);
    if (!(status === 409 || code === "EntityAlreadyExists")) throw err;

    const index = await table.getEntity(partitionKey, rowKey);
    return { visitorId: (index as any).visitorId as string | undefined, created: false };
  }
}

async function removeReservations(
  table: any,
  reservations: Array<{ partitionKey: "EMAIL" | "PHONE"; rowKey: string }>
): Promise<void> {
  for (const reservation of reservations) {
    try {
      await table.deleteEntity(reservation.partitionKey, reservation.rowKey);
    } catch {
    }
  }
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
  const phoneCanonical = phoneTrim ? normalizePhoneIdentifier(phoneTrim) : undefined;
  const address1Trim = typeof input.address1 === "string" ? input.address1.trim() : undefined;
  const address2Trim = typeof input.address2 === "string" ? input.address2.trim() : undefined;
  const cityTrim = typeof input.city === "string" ? input.city.trim() : undefined;
  const stateTrim = typeof input.state === "string" ? input.state.trim() : undefined;
  const postalCodeTrim = typeof input.postalCode === "string" ? input.postalCode.trim() : undefined;
  const birthdayTrim = typeof input.birthday === "string" ? input.birthday.trim() : undefined;

  const createdReservations: Array<{ partitionKey: "EMAIL" | "PHONE"; rowKey: string }> = [];
  const emailExisting = emailLower
    ? await resolveIdentity(table, "EMAIL", encodeURIComponent(emailLower), "emailLower", emailLower, now)
    : null;
  const phoneExisting = phoneCanonical
    ? await resolveIdentity(table, "PHONE", encodeURIComponent(phoneCanonical), "phoneCanonical", phoneCanonical, now)
    : null;

  if (emailExisting && phoneExisting && emailExisting.visitorId !== phoneExisting.visitorId) {
    throw new Error("VISITOR_IDENTIFIER_CONFLICT");
  }

  const existingId = emailExisting?.visitorId ?? phoneExisting?.visitorId;
  const visitorId = existingId ?? id;

  for (const identity of [
    emailLower ? { partitionKey: "EMAIL" as const, rowKey: encodeURIComponent(emailLower) } : null,
    phoneCanonical ? { partitionKey: "PHONE" as const, rowKey: encodeURIComponent(phoneCanonical) } : null
  ]) {
    if (!identity) continue;
    const reservation = await reserveIdentity(table, identity.partitionKey, identity.rowKey, visitorId, now);
    if (reservation.visitorId && reservation.visitorId !== visitorId) {
      await removeReservations(table, createdReservations);
      throw new Error("VISITOR_IDENTIFIER_CONFLICT");
    }
    if (reservation.created) createdReservations.push(identity);
  }

  if (existingId) {
    const existingEntity = await table.getEntity<VisitorEntity>(VISITOR_PK, existingId);
    const existingEmailCanonical = existingEntity.emailLower || (existingEntity.email ? existingEntity.email.trim().toLowerCase() : "");
    const existingPhoneCanonical = existingEntity.phoneCanonical || normalizePhoneIdentifier(existingEntity.phone || "");
    if (
      (emailLower && existingEmailCanonical && existingEmailCanonical !== emailLower) ||
      (phoneCanonical && existingPhoneCanonical && existingPhoneCanonical !== phoneCanonical)
    ) {
      await removeReservations(table, createdReservations);
      throw new Error("VISITOR_IDENTIFIER_CONFLICT");
    }

    const attachedEntity: VisitorEntity = {
      ...existingEntity,
      email: existingEntity.email || emailTrim,
      emailLower: existingEntity.emailLower || emailLower,
      phone: existingEntity.phone || phoneTrim,
      phoneCanonical: existingEntity.phoneCanonical || phoneCanonical,
      updatedAt: now
    };

    try {
      if (
        attachedEntity.email !== existingEntity.email ||
        attachedEntity.emailLower !== existingEntity.emailLower ||
        attachedEntity.phone !== existingEntity.phone ||
        attachedEntity.phoneCanonical !== existingEntity.phoneCanonical
      ) {
        await table.upsertEntity(attachedEntity as any, "Replace");
      }
    } catch (err) {
      await removeReservations(table, createdReservations);
      throw err;
    }

    return { visitor: toVisitor(attachedEntity), created: false };
  }

  const entity: VisitorEntity = {
    partitionKey: VISITOR_PK,
    rowKey: visitorId,
    name: input.name,
    email: emailTrim,
    emailLower,
    phone: phoneTrim,
    phoneCanonical,
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
    await removeReservations(table, createdReservations);
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

