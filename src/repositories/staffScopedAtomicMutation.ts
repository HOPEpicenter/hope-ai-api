import type { TransactionAction } from "@azure/data-tables";
import type { StaffEvent } from "../domain/staff/projectStaffDirectory";
import {
  normalizeEntraStaffBinding
} from "../domain/staff/projectStaffDirectory";
import {
  classifyStaffSecurityMutation
} from "../domain/staff/classifyStaffSecurityMutation";
import {
  STAFF_SECURITY_METADATA_HEAD,
  STAFF_SECURITY_METADATA_RECEIPT_PREFIX
} from "./staffEventsRepository";
import type {
  StaffScopedAtomicPort,
  StaffScopedAtomicResult
} from "./staffScopedAtomicDeactivation";

/**
 * Isolated, default-disabled same-partition storage operation.
 *
 * All participating updates must advance the SAME Staff-scoped
 * security head used by atomic Staff deactivation.
 *
 * No production TableClient, command wiring, head bootstrap,
 * OAuth execution, or authorization capability is provided.
 */
type ObjectRecord = Record<string, unknown>;

function object(value: unknown): ObjectRecord | null {
  if (value === null || typeof value !== "object" ||
      Array.isArray(value)) return null;
  return value as ObjectRecord;
}

function identifier(value: unknown): value is string {
  return typeof value === "string" &&
    /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function decision(
  status: StaffScopedAtomicResult["status"]
): StaffScopedAtomicResult {
  return {
    status,
    executionPermitted: false,
    retryPermitted: false,
    productionWriterFenced: false
  };
}

function validEvent(value: unknown): value is StaffEvent {
  try {
    const event = object(value);
    if (!event ||
        !identifier(event.staffId) ||
        !identifier(event.eventId) ||
        !identifier(event.actorId) ||
        (event.type !== "staff.updated" &&
         event.type !== "staff.activated")) {
      return false;
    }

    const timestamp = event.occurredAt;
    if (typeof timestamp !== "string" ||
        timestamp.length > 64 ||
        !Number.isFinite(Date.parse(timestamp)) ||
        new Date(timestamp).toISOString() !== timestamp) {
      return false;
    }

    const data = object(event.data);
    if (!data) return false;

    const keys = Object.keys(data);
    if (keys.length === 0) return false;

    if (event.type === "staff.activated") {
      return keys.length === 1 && data.status === "active";
    }

    const classification = classifyStaffSecurityMutation(
      event as StaffEvent
    );

    if (classification.kind === "unknown" ||
        classification.kind === "deactivation") {
      return false;
    }

    // Deactivation must use the revoking transaction, never
    // the active-head mutation path.
    if (Object.prototype.hasOwnProperty.call(data, "status") &&
        data.status !== "active") {
      return false;
    }

    const hasTenant = Object.prototype.hasOwnProperty.call(
      data, "entraTenantId"
    );
    const hasObject = Object.prototype.hasOwnProperty.call(
      data, "entraObjectId"
    );

    if (hasTenant !== hasObject) return false;

    if (hasTenant) {
      const binding = normalizeEntraStaffBinding(
        data.entraTenantId,
        data.entraObjectId
      );
      if (!binding) return false;
    }

    return JSON.stringify(data).length <= 16384;
  } catch {
    return false;
  }
}

function conflict(error: unknown): boolean {
  const value = object(error);
  return value?.statusCode === 409 || value?.statusCode === 412;
}

/**
 * Testing-only participation in the Staff-scoped security
 * ordering head. Not a production authorization check.
 */
export async function submitStaffScopedAtomicMutation(
  event: unknown,
  port: StaffScopedAtomicPort,
  prototypeEnabled = false
): Promise<StaffScopedAtomicResult> {
  if (prototypeEnabled !== true ||
      !validEvent(event) ||
      !port ||
      typeof port.getEntity !== "function" ||
      typeof port.submitTransaction !== "function") {
    return decision("denied");
  }

  let head: ObjectRecord | null;

  try {
    head = object(await port.getEntity(
      event.staffId,
      STAFF_SECURITY_METADATA_HEAD
    ));
  } catch {
    return decision("uncertain");
  }

  if (!head ||
      head.state !== "active" ||
      typeof head.revision !== "number" ||
      !Number.isSafeInteger(head.revision) ||
      head.revision < 0 ||
      head.revision >= Number.MAX_SAFE_INTEGER - 1 ||
      typeof head.etag !== "string" ||
      !head.etag.trim() ||
      head.etag === "*" ||
      head.etag !== head.etag.trim()) {
    return decision("denied");
  }

  const revision = head.revision + 1;
  const partitionKey = event.staffId;

  const actions: TransactionAction[] = [
    [
      "update",
      {
        partitionKey,
        rowKey: STAFF_SECURITY_METADATA_HEAD,
        revision,
        state: "active"
      },
      "Replace",
      { etag: head.etag }
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
        kind: "staff.mutation.prototype",
        revision
      }
    ]
  ];

  try {
    await port.submitTransaction(actions);
    return decision("committed");
  } catch (error) {
    return decision(conflict(error) ? "denied" : "uncertain");
  }
}