import type { TableClient } from "@azure/data-tables";
import {
  ensureTable,
  getTableClient
} from "../../functions/_shared/tableClient";

const TABLE = "KioskGuestQrAdmissionSlots";
const EVENT = "friends-family-2026-11-22";
const START = Date.parse("2026-11-22T05:00:00Z");
const END = Date.parse("2026-11-23T05:00:00Z");
const DEFAULT_CAPACITY = 12;
const MAX_CAPACITY = 30;

const UUID4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type Store = {
  createEntity(entity: any): Promise<unknown>;
};

type Dependencies = {
  enabled?: boolean;
  now?: Date;
  capacity?: number;
  store?: Store;
};

export type GuestQrAdmission =
  | Readonly<{ admitted: true }>
  | Readonly<{
      admitted: false;
      reason:
        | "disabled"
        | "outside_event"
        | "capacity_exhausted";
    }>;

function conflict(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as {
    statusCode?: unknown;
    code?: unknown;
  };

  return (
    record.statusCode === 409 ||
    record.code === "EntityAlreadyExists"
  );
}

/**
 * Atomic, per-grant, per-minute guest QR quota.
 *
 * grantId MUST come from a verified signed guest QR grant,
 * not from visitor JSON or an unverified request header.
 *
 * This is an anti-abuse control, not visitor identity
 * verification. The caller must also enforce independent
 * guest-grant verification, global capacity, idempotency,
 * consent validation, and private server authorization.
 *
 * No visitor PII, staff authority or automatic contact.
 */
export async function reserveKioskGuestQrSlotV1(
  grantId: string,
  deps: Dependencies = {}
): Promise<GuestQrAdmission> {
  if (deps.enabled !== true) {
    return { admitted: false, reason: "disabled" };
  }

  if (typeof grantId !== "string" || !UUID4.test(grantId)) {
    throw new Error("INVALID_GUEST_QR_GRANT_ID");
  }

  const capacity = deps.capacity ?? DEFAULT_CAPACITY;

  if (
    !Number.isSafeInteger(capacity) ||
    capacity < 1 ||
    capacity > MAX_CAPACITY
  ) {
    throw new Error("INVALID_GUEST_QR_CAPACITY");
  }

  const now = deps.now ?? new Date();

  if (
    !(now instanceof Date) ||
    !Number.isFinite(now.getTime())
  ) {
    throw new Error("INVALID_GUEST_QR_TIME");
  }

  if (now.getTime() < START || now.getTime() >= END) {
    return { admitted: false, reason: "outside_event" };
  }

  const minute = Math.floor(now.getTime() / 60000);
  const store = deps.store ?? getTableClient(TABLE);

  if (!deps.store) {
    await ensureTable(store as TableClient);
  }

  for (let slot = 0; slot < capacity; slot++) {
    const rowKey =
      `qr__${grantId}__${minute}__` +
      String(slot).padStart(2, "0");

    try {
      await store.createEntity({
        partitionKey: EVENT,
        rowKey
      });

      return { admitted: true };
    } catch (error) {
      if (conflict(error)) {
        continue;
      }

      // Storage errors never authorize registration.
      throw error;
    }
  }

  return {
    admitted: false,
    reason: "capacity_exhausted"
  };
}