import type { TableClient } from "@azure/data-tables";
import {
  ensureTable,
  getTableClient
} from "../../functions/_shared/tableClient";

const TABLE = "KioskAdmissionSlots";
const EVENT = "friends-family-2026-11-22";

type SlotStore = {
  createEntity(entity: any): Promise<unknown>;
};

type Dependencies = {
  store?: SlotStore;
  now?: () => Date;
  enabled?: boolean;
  capacity?: number;
};

export type AdmissionResult =
  | Readonly<{ admitted: true }>
  | Readonly<{
      admitted: false;
      reason: "disabled" | "capacity_exhausted";
    }>;

function isConflict(error: any): boolean {
  return (
    Number(error?.statusCode ?? error?.status ?? 0) === 409 ||
    error?.code === "EntityAlreadyExists"
  );
}

/**
 * Atomic, shared global capacity guard.
 *
 * NOT visitor authentication, device authentication,
 * a per-client quota, or a complete anti-abuse system.
 *
 * Call only after a separate trusted admission decision.
 * Never expose the enabled option to browser requests.
 */
export async function reserveKioskAdmissionSlotV1(
  deps: Dependencies = {}
): Promise<AdmissionResult> {
  if (deps.enabled !== true) {
    return {
      admitted: false,
      reason: "disabled"
    };
  }

  const capacity = deps.capacity ?? 30;

  if (
    !Number.isSafeInteger(capacity) ||
    capacity < 1 ||
    capacity > 100
  ) {
    throw new Error("INVALID_KIOSK_CAPACITY");
  }

  const now = (deps.now ?? (() => new Date()))();

  if (
    !(now instanceof Date) ||
    !Number.isFinite(now.getTime())
  ) {
    throw new Error("INVALID_SERVER_TIME");
  }

  // Same UTC minute across all workers and instances.
  const minute = now.toISOString().slice(0, 16);

  const store: SlotStore =
    deps.store ?? getTableClient(TABLE);

  if (!deps.store) {
    await ensureTable(store as TableClient);
  }

  for (let slot = 0; slot < capacity; slot++) {
    const rowKey =
      `${minute.replace(/[-:T]/g, "")}__` +
      String(slot).padStart(3, "0");

    try {
      await store.createEntity({
        partitionKey: EVENT,
        rowKey,
        reservedAt: now.toISOString()
      });

      return { admitted: true };
    } catch (error: any) {
      // Only an actual duplicate claim advances to
      // the next slot. Storage errors must fail closed.
      if (isConflict(error)) continue;
      throw error;
    }
  }

  return {
    admitted: false,
    reason: "capacity_exhausted"
  };
}