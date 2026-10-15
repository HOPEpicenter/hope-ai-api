import {
  type TableClient,
  type TransactionAction
} from "@azure/data-tables";
import type { StaffEvent } from "../domain/staff/projectStaffDirectory";

/**
 * Synthetic-only atomic persistence proof.
 *
 * Never use this partition as staff security authority.
 * It does not update canonical StaffEvents or Entra binding ownership.
 */
export const STAFF_ATOMIC_EVENT_PROTOTYPE_PARTITION =
  "staff-atomic-event-transition-prototype-v1";

export const STAFF_ATOMIC_EVENT_PROTOTYPE_HEAD = "ordering-head";

export type StaffAtomicEventPrototypeRequest = Readonly<{
  operationId: string;
  expectedRevision: number;
  event: StaffEvent;
}>;

export type StaffAtomicEventPrototypeResult = Readonly<{
  status:
    | "committed"
    | "conflict"
    | "rejected"
    | "uncertain"
    | "unavailable"
    | "invalid_input";
  revision?: number;
  authoritative: false;
  executionPermitted: false;
  retryPermitted: false;
}>;

type StoredHead = {
  revision: number;
  etag?: string;
};

const identifiers = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const allowedTypes = new Set<string>([
  "staff.created",
  "staff.updated",
  "staff.deactivated",
  "staff.invited",
  "staff.activated"
]);

function result(
  status: StaffAtomicEventPrototypeResult["status"],
  revision?: number
): StaffAtomicEventPrototypeResult {
  return {
    status,
    ...(revision === undefined ? {} : { revision }),
    authoritative: false,
    executionPermitted: false,
    retryPermitted: false
  };
}

function statusCode(error: unknown): number {
  try {
    if (!error || typeof error !== "object") return 0;
    const value = (error as { statusCode?: unknown }).statusCode;
    return typeof value === "number" ? value : 0;
  } catch {
    return 0;
  }
}

function prepareRequest(
  request: StaffAtomicEventPrototypeRequest
): { dataJson: string } | null {
  try {
    if (
      !request ||
      !identifiers.test(request.operationId) ||
      !Number.isSafeInteger(request.expectedRevision) ||
      request.expectedRevision < 0 ||
      !request.event ||
      !identifiers.test(request.event.eventId) ||
      !identifiers.test(request.event.staffId) ||
      !allowedTypes.has(request.event.type) ||
      typeof request.event.occurredAt !== "string" ||
      request.event.occurredAt.length === 0 ||
      request.event.occurredAt.length > 64 ||
      typeof request.event.actorId !== "string" ||
      !identifiers.test(request.event.actorId) ||
      !request.event.data ||
      typeof request.event.data !== "object" ||
      Array.isArray(request.event.data)
    ) {
      return null;
    }

    const dataJson = JSON.stringify(request.event.data);

    if (
      typeof dataJson !== "string" ||
      dataJson.length > 16384
    ) {
      return null;
    }

    return { dataJson };
  } catch {
    return null;
  }
}

export class StaffAtomicEventTransitionPrototypeRepository {
  constructor(private readonly table: TableClient) {}

  /**
   * Explicit synthetic fixture setup only.
   * Production code must never call this to bootstrap authorization.
   */
  async initializeHead(): Promise<
    "initialized" | "conflict" | "unavailable"
  > {
    try {
      await this.table.createEntity({
        partitionKey: STAFF_ATOMIC_EVENT_PROTOTYPE_PARTITION,
        rowKey: STAFF_ATOMIC_EVENT_PROTOTYPE_HEAD,
        revision: 0
      });
      return "initialized";
    } catch (error) {
      return statusCode(error) === 409
        ? "conflict"
        : "unavailable";
    }
  }

  async commit(
    request: StaffAtomicEventPrototypeRequest
  ): Promise<StaffAtomicEventPrototypeResult> {
    const prepared = prepareRequest(request);
    if (!prepared) return result("invalid_input");

    const partitionKey = STAFF_ATOMIC_EVENT_PROTOTYPE_PARTITION;

    let head: StoredHead;

    try {
      head = await this.table.getEntity<StoredHead>(
        partitionKey,
        STAFF_ATOMIC_EVENT_PROTOTYPE_HEAD
      );
    } catch {
      return result("unavailable");
    }

    if (
      !Number.isSafeInteger(head.revision) ||
      head.revision < 0 ||
      !head.etag ||
      head.etag === "*"
    ) {
      return result("unavailable");
    }

    if (head.revision !== request.expectedRevision) {
      return result("rejected");
    }

    if (head.revision === Number.MAX_SAFE_INTEGER) {
      return result("unavailable");
    }

    const nextRevision = head.revision + 1;

    const actions: TransactionAction[] = [
      [
        "update",
        {
          partitionKey,
          rowKey: STAFF_ATOMIC_EVENT_PROTOTYPE_HEAD,
          revision: nextRevision
        },
        "Replace",
        { etag: head.etag }
      ],
      [
        "create",
        {
          partitionKey,
          rowKey: `event-${request.event.eventId}`,
          operationId: request.operationId,
          eventId: request.event.eventId,
          staffId: request.event.staffId,
          type: request.event.type,
          occurredAt: request.event.occurredAt,
          actorId: request.event.actorId,
          dataJson: prepared.dataJson,
          revision: nextRevision
        }
      ],
      [
        "create",
        {
          partitionKey,
          rowKey: `operation-${request.operationId}`,
          operationId: request.operationId,
          eventId: request.event.eventId,
          staffId: request.event.staffId,
          revision: nextRevision
        }
      ]
    ];

    try {
      await this.table.submitTransaction(actions);
      return result("committed", nextRevision);
    } catch (error) {
      const code = statusCode(error);

      if (code === 409 || code === 412) {
        return result("conflict");
      }

      // Submission may have committed even when its acknowledgement
      // could not be observed. Never retry automatically.
      return result("uncertain");
    }
  }
}
