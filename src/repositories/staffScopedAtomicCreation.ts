import type { TransactionAction } from "@azure/data-tables";
import {
  normalizeEntraStaffBinding,
  type StaffEvent
} from "../domain/staff/projectStaffDirectory";
import {
  STAFF_SECURITY_METADATA_HEAD,
  STAFF_SECURITY_METADATA_RECEIPT_PREFIX
} from "./staffEventsRepository";
import type {
  StaffScopedAtomicResult
} from "./staffScopedAtomicDeactivation";

/**
 * Isolated Staff-scoped canonical creation transaction.
 *
 * Creates the security head, first canonical event and
 * immutable receipt in one StaffEvents partition.
 *
 * Does NOT reserve global Entra binding ownership.
 * Does NOT provide cross-partition atomicity.
 * Does NOT authorize OAuth access or production execution.
 * No default TableClient or live endpoint wiring.
 */
export interface StaffCreationTransactionPort {
  submitTransaction(actions: TransactionAction[]): Promise<unknown>;
}

function result(
  status: StaffScopedAtomicResult["status"]
): StaffScopedAtomicResult {
  return {
    status,
    executionPermitted: false,
    retryPermitted: false,
    productionWriterFenced: false
  };
}

function identifier(value: unknown): value is string {
  return typeof value === "string" &&
    /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" ||
      Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function validCreation(value: unknown): value is StaffEvent {
  try {
    const event = record(value);
    if (!event ||
        event.type !== "staff.created" ||
        !identifier(event.staffId) ||
        !identifier(event.eventId) ||
        !identifier(event.actorId)) {
      return false;
    }

    if (typeof event.occurredAt !== "string" ||
        event.occurredAt.length > 64 ||
        !Number.isFinite(Date.parse(event.occurredAt)) ||
        new Date(event.occurredAt).toISOString() !== event.occurredAt) {
      return false;
    }

    const data = record(event.data);
    if (!data ||
        typeof data.displayName !== "string" ||
        !data.displayName.trim() ||
        data.displayName !== data.displayName.trim() ||
        data.status !== "active") {
      return false;
    }

    // Coordinated identity creation requires a complete,
    // normalized Entra binding. Unbound Staff creation
    // needs a separate explicitly reviewed protocol.
    const binding = normalizeEntraStaffBinding(
      data.entraTenantId,
      data.entraObjectId
    );

    if (!binding ||
        binding.entraTenantId !== data.entraTenantId ||
        binding.entraObjectId !== data.entraObjectId) {
      return false;
    }

    return Buffer.byteLength(JSON.stringify(data), "utf8") <= 16384;
  } catch {
    return false;
  }
}

function isConflict(error: unknown): boolean {
  try {
    const status = record(error)?.statusCode;
    return status === 409 || status === 412;
  } catch {
    return false;
  }
}

export async function submitStaffScopedAtomicCreation(
  event: unknown,
  port: StaffCreationTransactionPort,
  prototypeEnabled = false
): Promise<StaffScopedAtomicResult> {
  if (prototypeEnabled !== true ||
      !validCreation(event) ||
      !port ||
      typeof port.submitTransaction !== "function") {
    return result("denied");
  }

  const partitionKey = event.staffId;

  const actions: TransactionAction[] = [
    [
      "create",
      {
        partitionKey,
        rowKey: STAFF_SECURITY_METADATA_HEAD,
        revision: 0,
        state: "active"
      }
    ],
    [
      "create",
      {
        partitionKey,
        rowKey: `${event.occurredAt}__${event.eventId}`,
        eventId: event.eventId,
        staffId: event.staffId,
        type: event.type,
        occurredAt: event.occurredAt,
        actorId: event.actorId,
        dataJson: JSON.stringify(event.data)
      }
    ],
    [
      "create",
      {
        partitionKey,
        rowKey:
          `${STAFF_SECURITY_METADATA_RECEIPT_PREFIX}${event.eventId}`,
        eventId: event.eventId,
        staffId: event.staffId,
        kind: "staff.creation.prototype",
        revision: 0
      }
    ]
  ];

  try {
    await port.submitTransaction(actions);
    return result("committed");
  } catch (error) {
    return result(isConflict(error) ? "denied" : "uncertain");
  }
}