import { getTableClient } from "../storage/tableClient";
import { randomUUID } from "crypto";

export type VisitorEntity = {
  partitionKey: "VISITOR";
  rowKey: string; // visitorId
  name: string;
  email?: string;
  emailLower?: string; // canonical lowercase for consistency
  phone?: string;
  phoneCanonical?: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
};

export type EmailIndexEntity = {
  partitionKey: "EMAIL";
  rowKey: string; // encodeURIComponent(emailLower)
  visitorId: string;
  createdAt: string; // ISO
};

export type PhoneIndexEntity = {
  partitionKey: "PHONE";
  rowKey: string;
  visitorId: string;
  createdAt: string;
};

export type Visitor = {
  visitorId: string;
  name: string;
  email?: string;
  phone?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateVisitorResult = {
  visitor: Visitor;
  created: boolean;
};

export interface VisitorsRepository {
  create(input: { name: string; email?: string; phone?: string }): Promise<CreateVisitorResult>;
  getById(visitorId: string): Promise<Visitor | null>;
  getByEmail(email: string): Promise<Visitor | null>;
  getByPhone(phone: string): Promise<Visitor | null>;
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
    phone: e.phone,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
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

function nowIso(): string {
  return new Date().toISOString();
}

export class AzureTableVisitorsRepository implements VisitorsRepository {
  async create(input: { name: string; email?: string; phone?: string }): Promise<CreateVisitorResult> {
    const table = await getTableClient(TABLE);
    const id = randomUUID();
    const now = nowIso();

    const emailTrim = typeof input.email === "string" ? input.email.trim() : undefined;
    const emailLower = emailTrim ? emailTrim.toLowerCase() : undefined;
    const phoneTrim = typeof input.phone === "string" ? input.phone.trim() : undefined;
    const phoneCanonical = phoneTrim ? normalizePhoneIdentifier(phoneTrim) : undefined;
    const emailExisting = emailLower ? await this.resolveIdentity("EMAIL", encodeURIComponent(emailLower), "emailLower", emailLower, now) : null;
    const phoneExisting = phoneCanonical ? await this.resolveIdentity("PHONE", encodeURIComponent(phoneCanonical), "phoneCanonical", phoneCanonical, now) : null;

    if (emailExisting && phoneExisting && emailExisting.visitorId !== phoneExisting.visitorId) {
      throw new Error("VISITOR_IDENTIFIER_CONFLICT");
    }

    const existingId = emailExisting?.visitorId ?? phoneExisting?.visitorId;
    const visitorId = existingId ?? id;
    const createdReservations: Array<{ partitionKey: "EMAIL" | "PHONE"; rowKey: string }> = [];

    for (const identity of [
      emailLower ? { partitionKey: "EMAIL" as const, rowKey: encodeURIComponent(emailLower) } : null,
      phoneCanonical ? { partitionKey: "PHONE" as const, rowKey: encodeURIComponent(phoneCanonical) } : null
    ]) {
      if (!identity) continue;
      const reservation = await this.reserveIdentity(identity.partitionKey, identity.rowKey, visitorId, now);
      if (reservation.visitorId && reservation.visitorId !== visitorId) {
        await this.removeReservations(createdReservations);
        throw new Error("VISITOR_IDENTIFIER_CONFLICT");
      }
      if (reservation.created) createdReservations.push(identity);
    }

    if (existingId) {
      const existingEntity = await table.getEntity<VisitorEntity>(PK, existingId);
      const existingEmailCanonical = existingEntity.emailLower || (existingEntity.email ? existingEntity.email.trim().toLowerCase() : "");
      const existingPhoneCanonical = existingEntity.phoneCanonical || normalizePhoneIdentifier(existingEntity.phone || "");
      if (
        (emailLower && existingEmailCanonical && existingEmailCanonical !== emailLower) ||
        (phoneCanonical && existingPhoneCanonical && existingPhoneCanonical !== phoneCanonical)
      ) {
        await this.removeReservations(createdReservations);
        throw new Error("VISITOR_IDENTIFIER_CONFLICT");
      }

      const attachedEntity: VisitorEntity = {
        ...existingEntity,
        email: existingEntity.email || emailTrim,
        emailLower: existingEntity.emailLower || emailLower,
        phone: existingEntity.phone || phoneTrim,
        phoneCanonical: existingEntity.phoneCanonical || phoneCanonical,
        updatedAt: now,
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
        await this.removeReservations(createdReservations);
        throw err;
      }

      return { visitor: toVisitor(attachedEntity), created: false };
    }

    const entity: VisitorEntity = {
      partitionKey: PK,
      rowKey: visitorId,
      name: input.name,
      email: emailTrim,
      emailLower: emailLower,
      phone: phoneTrim,
      phoneCanonical,
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
      await this.removeReservations(createdReservations);
      throw err;
    }

    return { visitor: toVisitor(entity), created: true };
  }

  private async resolveIdentity(
    partitionKey: "EMAIL" | "PHONE",
    rowKey: string,
    field: "emailLower" | "phoneCanonical",
    canonical: string,
    now: string
  ): Promise<{ visitorId: string } | null> {
    const table = await getTableClient(TABLE);
    try {
      const index = await table.getEntity<EmailIndexEntity | PhoneIndexEntity>(partitionKey, rowKey);
      const visitorId = (index as any).visitorId as string | undefined;
      if (!visitorId) return null;
      const existing = await this.getById(visitorId);
      if (existing) return { visitorId };

      const escaped = canonical.replace(/'/g, "''");
      const filter = `PartitionKey eq 'VISITOR' and ${field} eq '${escaped}'`;
      let recovered: VisitorEntity | undefined;
      for await (const entity of table.listEntities<VisitorEntity>({ queryOptions: { filter } })) {
        recovered = entity;
        break;
      }
      if (recovered) {
        await table.upsertEntity({ partitionKey, rowKey, visitorId: recovered.rowKey, createdAt: now } as any, "Replace");
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

  private async reserveIdentity(
    partitionKey: "EMAIL" | "PHONE",
    rowKey: string,
    visitorId: string,
    now: string
  ): Promise<{ visitorId?: string; created: boolean }> {
    const table = await getTableClient(TABLE);
    try {
      await table.createEntity({ partitionKey, rowKey, visitorId, createdAt: now });
      return { created: true };
    } catch (err: any) {
      const code = String(err?.code ?? "");
      const status = Number(err?.statusCode ?? err?.status ?? 0);
      if (!(status === 409 || code === "EntityAlreadyExists")) throw err;
      const index = await table.getEntity<EmailIndexEntity | PhoneIndexEntity>(partitionKey, rowKey);
      return { visitorId: (index as any).visitorId as string | undefined, created: false };
    }
  }

  private async removeReservations(reservations: Array<{ partitionKey: "EMAIL" | "PHONE"; rowKey: string }>): Promise<void> {
    const table = await getTableClient(TABLE);
    for (const reservation of reservations) {
      try { await table.deleteEntity(reservation.partitionKey, reservation.rowKey); } catch { }
    }
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

  async getByPhone(phone: string): Promise<Visitor | null> {
    const table = await getTableClient(TABLE);
    const canonical = normalizePhoneIdentifier(phone ?? "");
    if (!canonical) return null;

    try {
      const idx = await table.getEntity<PhoneIndexEntity>("PHONE", encodeURIComponent(canonical));
      const visitorId = (idx as any).visitorId as string | undefined;
      return visitorId ? await this.getById(visitorId) : null;
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

    // NOTE: Azure Table iteration order is not guaranteed. Make results deterministic.
    // We cap the scan to avoid unbounded reads in early phases; add pagination later if needed.
    const scanCap = 500;

    const all: Visitor[] = [];
    const filter = "PartitionKey eq 'VISITOR'";

    for await (const e of table.listEntities<VisitorEntity>({ queryOptions: { filter } })) {
      all.push(toVisitor(e as any));
      if (all.length >= scanCap) break;
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

