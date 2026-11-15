import type { TableClient } from "@azure/data-tables";
import {
  ensureTable,
  getTableClient
} from "../../functions/_shared/tableClient";

const TABLE = "KioskDeviceAdmissionSlots";
const EVENT = "friends-family-2026-11-22";
const DEFAULT_CAPACITY = 5;
const MAX_CAPACITY = 20;

const UUID4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type DeviceSlotStore = {
  createEntity(entity: any): Promise<unknown>;
};

type Dependencies = {
  enabled?: boolean;
  now?: Date;
  capacity?: number;
  store?: DeviceSlotStore;
};

export type DeviceAdmissionResult =
  | Readonly<{ admitted: true }>
  | Readonly<{
      admitted: false;
      reason: "disabled" | "device_capacity_exhausted";
    }>;

function isAlreadyExists(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  return (
    (error as { statusCode?: unknown }).statusCode === 409
  );
}

/**
 * Atomic per-device admission limit across backend instances.
 *
 * The deviceId must come from an independently verified
 * signed kiosk credential, never an anonymous JSON field.
 *
 * Each accepted claim creates a distinct Azure Table row.
 * Atomic createEntity conflicts prevent two simultaneous
 * requests from claiming the same slot.
 *
 * This implementation intentionally has no visitor PII,
 * no delete operations and no automatic contact behavior.
 */
export async function reserveKioskDeviceSlotV1(
  deviceId: string,
  deps: Dependencies = {}
): Promise<DeviceAdmissionResult> {
  if (deps.enabled !== true) {
    return {
      admitted: false,
      reason: "disabled"
    };
  }

  if (!UUID4.test(deviceId)) {
    throw new Error("INVALID_KIOSK_DEVICE_ID");
  }

  const capacity = deps.capacity ?? DEFAULT_CAPACITY;

  if (
    !Number.isSafeInteger(capacity) ||
    capacity < 1 ||
    capacity > MAX_CAPACITY
  ) {
    throw new Error("INVALID_KIOSK_DEVICE_CAPACITY");
  }

  const now = deps.now ?? new Date();

  if (
    !(now instanceof Date) ||
    !Number.isFinite(now.getTime())
  ) {
    throw new Error("INVALID_KIOSK_DEVICE_TIME");
  }

  const minute = Math.floor(now.getTime() / 60000);

  // Reuse the established Azure Table storage boundary.
  // Synthetic tests inject an atomic in-memory store.
  const store = deps.store ?? getTableClient(TABLE);

  if (!deps.store) {
    await ensureTable(store as TableClient);
  }

  for (let slot = 0; slot < capacity; slot++) {
    const rowKey =
      `device__${deviceId}__${minute}__${slot}`;

    try {
      await store.createEntity({
        partitionKey: EVENT,
        rowKey
      });

      return { admitted: true };
    } catch (error) {
      if (isAlreadyExists(error)) {
        continue;
      }

      // Storage failures are not capacity successes.
      // Caller must deny intake and avoid PII leakage.
      throw error;
    }
  }

  return {
    admitted: false,
    reason: "device_capacity_exhausted"
  };
}