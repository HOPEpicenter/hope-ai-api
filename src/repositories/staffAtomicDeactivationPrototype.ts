import type { TransactionAction } from "@azure/data-tables";
import type { StaffEvent } from "../domain/staff/projectStaffDirectory";
import {
  STAFF_SECURITY_PROTOTYPE_PARTITION,
  STAFF_SECURITY_HEAD_ROW
} from "./oauthStaffSecurityStorageRepository";

/**
 * Isolated, non-production Staff deactivation transaction.
 *
 * All actions target one prototype partition. This is NOT the
 * canonical StaffEvents partition or an OAuth execution fence.
 *
 * No TableClient construction, production wiring, credential
 * access, automatic retry, or StaffEventsRepository mutation.
 */
export interface StaffAtomicDeactivationPort {
  getEntity(
    partitionKey: string,
    rowKey: string
  ): Promise<unknown>;

  submitTransaction(
    actions: TransactionAction[]
  ): Promise<unknown>;
}

export type StaffAtomicDeactivationResult = Readonly<{
  outcome: "committed" | "denied" | "uncertain";
  executionPermitted: false;
  retryPermitted: false;
  productionWriterFenced: false;
}>;

function result(
  outcome: StaffAtomicDeactivationResult["outcome"]
): StaffAtomicDeactivationResult {
  return {
    outcome,
    executionPermitted: false,
    retryPermitted: false,
    productionWriterFenced: false
  };
}

function record(value: unknown):
  Record<string, unknown> | null {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function validIdentifier(value: unknown): value is string {
  return typeof value === "string" &&
    /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function validEvent(value: unknown): value is StaffEvent {
  const event = record(value);
  if (!event) return false;

  const data = record(event.data);

  if (
    !validIdentifier(event.eventId) ||
    !validIdentifier(event.staffId) ||
    !validIdentifier(event.actorId) ||
    event.type !== "staff.deactivated" ||
    !data ||
    data.status !== "inactive" ||
    Object.keys(data).some(
      key => key !== "status" && key !== "reason"
    ) ||
    (data.reason !== undefined &&
      data.reason !== null &&
      typeof data.reason !== "string")
  ) {
    return false;
  }

  if (typeof event.occurredAt !== "string") {
    return false;
  }

  const date = Date.parse(event.occurredAt);

  return Number.isFinite(date) &&
    new Date(date).toISOString() === event.occurredAt;
}

function knownConflict(error: unknown): boolean {
  const value = record(error);
  return value !== null &&
    (value.statusCode === 409 ||
      value.statusCode === 412);
}

/**
 * Explicit prototype-only switch. Defaults to disabled.
 *
 * Successful submission proves only the injected storage
 * port acknowledged this same-partition transaction.
 * It cannot authorize OAuth or migrate a production writer.
 */
export async function submitStaffAtomicDeactivationPrototype(
  event: unknown,
  port: StaffAtomicDeactivationPort,
  prototypeEnabled = false
): Promise<StaffAtomicDeactivationResult> {
  if (
    prototypeEnabled !== true ||
    !validEvent(event) ||
    !port ||
    typeof port.getEntity !== "function" ||
    typeof port.submitTransaction !== "function"
  ) {
    return result("denied");
  }

  let head: Record<string, unknown> | null;

  try {
    head = record(await port.getEntity(
      STAFF_SECURITY_PROTOTYPE_PARTITION,
      STAFF_SECURITY_HEAD_ROW
    ));
  } catch {
    return result("uncertain");
  }

  if (
    !head ||
    head.state !== "active" ||
    !Number.isSafeInteger(head.revision) ||
    typeof head.revision !== "number" ||
    head.revision < 0 ||
    head.revision >= Number.MAX_SAFE_INTEGER - 1 ||
    typeof head.etag !== "string" ||
    !head.etag.trim() ||
    head.etag === "*" ||
    head.etag !== head.etag.trim()
  ) {
    return result("denied");
  }

  const revision = head.revision + 1;

  const actions: TransactionAction[] = [
    [
      "update",
      {
        partitionKey: STAFF_SECURITY_PROTOTYPE_PARTITION,
        rowKey: STAFF_SECURITY_HEAD_ROW,
        revision,
        state: "revoked"
      },
      "Replace",
      { etag: head.etag }
    ],
    [
      "create",
      {
        partitionKey: STAFF_SECURITY_PROTOTYPE_PARTITION,
        rowKey: `event-${event.occurredAt}__${event.eventId}`,
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
        partitionKey: STAFF_SECURITY_PROTOTYPE_PARTITION,
        rowKey: `operation-${event.eventId}`,
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
    // Unknown acknowledgement may follow a real commit.
    // No automatic retry or inference of execution authority.
    return result(knownConflict(error) ? "denied" : "uncertain");
  }
}