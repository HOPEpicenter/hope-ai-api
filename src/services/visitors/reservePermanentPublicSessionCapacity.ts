import { randomInt } from "node:crypto";
import type { TableClient } from "@azure/data-tables";

export type SessionCapacityResult =
  | "reserved"
  | "capacity_exhausted"
  | "unavailable";

function recognizedConflict(error: unknown): boolean {
  const value = error as {
    statusCode?: number;
    code?: string;
    details?: {
      errorCode?: string;
      odataError?: { code?: string };
    };
  } | null;

  if (value?.statusCode !== 409) {
    return false;
  }

  const codes = [
    value.code,
    value.details?.errorCode,
    value.details?.odataError?.code
  ].filter(code => code !== undefined);

  return codes.length > 0 &&
    codes.every(code => code === "EntityAlreadyExists");
}

/**
 * Global issuance budget across all public browsers
 * and events, using create-only durable capacity slots.
 *
 * No visitor information, session token or device
 * identifier is stored in these quota rows.
 */
export async function reservePermanentPublicSessionCapacity(
  table: Pick<TableClient, "createEntity">,
  nowMs: number,
  capacity = 60
): Promise<SessionCapacityResult> {
  if (!Number.isSafeInteger(nowMs) ||
      nowMs < 0 ||
      !Number.isSafeInteger(capacity) ||
      capacity < 1 ||
      capacity > 100) {
    return "unavailable";
  }

  try {
    const minute = Math.floor(nowMs / 60000);
    const partitionKey = `pv-session-v1-${minute}`;

    // Randomized first slot reduces contention when
    // independent browsers request sessions together.
    const first = randomInt(capacity);

    for (let offset = 0; offset < capacity; offset++) {
      const slot = (first + offset) % capacity;

      try {
        await table.createEntity({
          partitionKey,
          rowKey: `slot-${String(slot).padStart(3, "0")}`,
          version: 1
        });

        return "reserved";
      } catch (error) {
        if (!recognizedConflict(error)) {
          // An uncertain write must not issue a session.
          return "unavailable";
        }
      }
    }

    return "capacity_exhausted";
  } catch {
    return "unavailable";
  }
}
