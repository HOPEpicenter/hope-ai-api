import type { TransactionAction } from "@azure/data-tables";
import type { StaffEvent } from "../domain/staff/projectStaffDirectory";
import {
  STAFF_SECURITY_METADATA_HEAD,
  STAFF_SECURITY_METADATA_RECEIPT_PREFIX
} from "./staffEventsRepository";

/**
 * Isolated StaffEvents same-partition transaction implementation.
 *
 * The caller supplies a storage port and an existing Staff-scoped
 * ordering head. This module never creates a live TableClient,
 * bootstraps security authority, or changes canonical writers.
 *
 * NOT an OAuth execution fence.
 */
export interface StaffScopedAtomicPort {
  getEntity(partitionKey: string, rowKey: string): Promise<unknown>;
  submitTransaction(actions: TransactionAction[]): Promise<unknown>;
}

export type StaffScopedAtomicResult = Readonly<{
  status: "committed" | "denied" | "uncertain";
  executionPermitted: false;
  retryPermitted: false;
  productionWriterFenced: false;
}>;

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

function object(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" ||
      Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function identifier(value: unknown): value is string {
  return typeof value === "string" &&
    /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function validEvent(value: unknown): value is StaffEvent {
  try {
    const event = object(value);
    if (!event ||
        !identifier(event.staffId) ||
        !identifier(event.eventId) ||
        !identifier(event.actorId) ||
        event.type !== "staff.deactivated") {
      return false;
    }

    const data = object(event.data);
    if (!data ||
        data.status !== "inactive" ||
        Object.keys(data).some(
          key => key !== "status" && key !== "reason"
        ) ||
        (data.reason !== undefined &&
         data.reason !== null &&
         typeof data.reason !== "string")) {
      return false;
    }

    const timestamp = event.occurredAt;
    if (typeof timestamp !== "string" ||
        timestamp.length > 64 ||
        !Number.isFinite(Date.parse(timestamp)) ||
        new Date(timestamp).toISOString() !== timestamp) {
      return false;
    }

    const serialized = JSON.stringify(data);
    return serialized.length <= 16384;
  } catch {
    return false;
  }
}

function conflict(error: unknown): boolean {
  try {
    const status = object(error)?.statusCode;
    return status === 409 || status === 412;
  } catch {
    return false;
  }
}

/**
 * Atomic within the canonical StaffEvents table and one staffId
 * partition, assuming the injected port is the correct Table client.
 *
 * Explicit enablement is for isolated testing only.
 * This does not enforce production migration or OAuth ordering.
 */
export async function submitStaffScopedAtomicDeactivation(
  event: unknown,
  port: StaffScopedAtomicPort,
  prototypeEnabled = false
): Promise<StaffScopedAtomicResult> {
  if (prototypeEnabled !== true ||
      !validEvent(event) ||
      !port ||
      typeof port.getEntity !== "function" ||
      typeof port.submitTransaction !== "function") {
    return result("denied");
  }

  let head: Record<string, unknown> | null;

  try {
    head = object(await port.getEntity(
      event.staffId,
      STAFF_SECURITY_METADATA_HEAD
    ));
  } catch {
    return result("uncertain");
  }

  if (!head ||
      head.state !== "active" ||
      !Number.isSafeInteger(head.revision) ||
      typeof head.revision !== "number" ||
      head.revision < 0 ||
      head.revision >= Number.MAX_SAFE_INTEGER - 1 ||
      (head.authorizationRevision !== undefined &&
       head.authorizationRevision !== head.revision) ||
      typeof head.etag !== "string" ||
      !head.etag.trim() ||
      head.etag === "*" ||
      head.etag !== head.etag.trim()) {
    return result("denied");
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
        ...(head.authorizationRevision !== undefined
          ? { authorizationRevision: revision }
          : {}),
        state: "revoked"
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
        kind: "staff.deactivation.prototype",
        revision
      }
    ]
  ];

  try {
    await port.submitTransaction(actions);
    return result("committed");
  } catch (error) {
    return result(conflict(error) ? "denied" : "uncertain");
  }
}