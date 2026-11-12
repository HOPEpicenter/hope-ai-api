import type { TransactionAction } from "@azure/data-tables";
import type { StaffEvent } from "../domain/staff/projectStaffDirectory";
import {
  STAFF_SECURITY_METADATA_HEAD,
  STAFF_SECURITY_METADATA_RECEIPT_PREFIX
} from "./staffEventsRepository";
import {
  readStaffSecurityHead
} from "./staffSecurityHead";
import type {
  StaffScopedAtomicPort,
  StaffScopedAtomicResult
} from "./staffScopedAtomicDeactivation";

type ObjectRecord = Record<string, unknown>;

export type StaffReactivationAuthorization = Readonly<{
  authorized: true;
  staffId: string;
  eventId: string;
  actorId: string;
  authorizationRevision: number;
}>;

export interface StaffReactivationAuthorizationPort {
  authorizeReactivation(input: Readonly<{
    staffId: string;
    eventId: string;
    actorId: string;
    authorizationRevision: number;
  }>): Promise<unknown>;
}

function object(value: unknown): ObjectRecord | null {
  if (value === null || typeof value !== "object" ||
      Array.isArray(value)) {
    return null;
  }
  return value as ObjectRecord;
}

function identifier(value: unknown): value is string {
  return typeof value === "string" &&
    /^[A-Za-z0-9_-]{1,128}$/.test(value);
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

function validEvent(value: unknown): value is StaffEvent {
  try {
    const event = object(value);
    if (!event ||
        !identifier(event.staffId) ||
        !identifier(event.eventId) ||
        !identifier(event.actorId) ||
        event.type !== "staff.activated") {
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
    return !!data &&
      Object.keys(data).length === 1 &&
      data.status === "active" &&
      JSON.stringify(data).length <= 16384;
  } catch {
    return false;
  }
}

function validAuthorization(
  value: unknown,
  event: StaffEvent,
  authorizationRevision: number
): value is StaffReactivationAuthorization {
  const authorization = object(value);
  return !!authorization &&
    authorization.authorized === true &&
    authorization.staffId === event.staffId &&
    authorization.eventId === event.eventId &&
    authorization.actorId === event.actorId &&
    authorization.authorizationRevision === authorizationRevision;
}

function conflict(error: unknown): boolean {
  const value = object(error);
  return value?.statusCode === 409 || value?.statusCode === 412;
}

/**
 * Default-disabled proof for an explicitly authorized revoked-to-active
 * transition. The injected authorization port must be a trusted server-side
 * administrator boundary; this function is not wired to production writers.
 */
export async function submitStaffScopedAtomicReactivation(
  event: unknown,
  port: StaffScopedAtomicPort,
  authorizationPort: StaffReactivationAuthorizationPort,
  prototypeEnabled = false
): Promise<StaffScopedAtomicResult> {
  if (prototypeEnabled !== true ||
      !validEvent(event) ||
      !port ||
      typeof port.getEntity !== "function" ||
      typeof port.submitTransaction !== "function" ||
      !authorizationPort ||
      typeof authorizationPort.authorizeReactivation !== "function") {
    return result("denied");
  }

  let head;
  try {
    head = readStaffSecurityHead(
      await port.getEntity(
        event.staffId,
        STAFF_SECURITY_METADATA_HEAD
      ),
      event.staffId
    );
  } catch {
    return result("uncertain");
  }

  if (!head || head.state !== "revoked") {
    return result("denied");
  }

  let authorization: unknown;
  try {
    authorization = await authorizationPort.authorizeReactivation({
      staffId: event.staffId,
      eventId: event.eventId,
      actorId: event.actorId,
      authorizationRevision: head.authorizationRevision
    });
  } catch {
    return result("uncertain");
  }

  if (!validAuthorization(
    authorization,
    event,
    head.authorizationRevision
  )) {
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
        authorizationRevision: revision,
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
        kind: "staff.reactivation.prototype",
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
