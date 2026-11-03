import { randomUUID } from "node:crypto";
import { types } from "node:util";
import type { TableClient } from "@azure/data-tables";
import type { ProtectedInvitationAuditActorResult } from "../services/staff/resolveProtectedInvitationAuditActor";
import type {
  InvitationAuditEvent,
  InvitationAuditRecorder
} from "./staffInvitationAuditedStorageAdapter";

/**
 * Isolated C6 create-only audit persistence prototype.
 *
 * Caller injects the TableClient and owns its lifecycle.
 * No table creation, live endpoint wiring, Graph access or scheduling.
 * The actor ID remains an unverified caller claim.
 * An acknowledged insert is not independently verified durability.
 */

export const STAFF_INVITATION_AUDIT_SOURCE =
  "staff-invitation-audit-table-prototype-v1";

export const STAFF_INVITATION_AUDIT_PARTITION =
  "staff-invitation-access-audit-prototype-v1";

const operationIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const actorIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const fieldNames = [
  "schemaVersion",
  "action",
  "phase",
  "status",
  "operationId",
  "actorCorrelationId"
] as const;

const writeStatuses = new Set([
  "recorded_unverified", "conflict", "invalid_input", "uncertain"
]);

const readStatuses = new Set([
  "matching_evidence", "missing", "contradictory",
  "invalid_input", "unavailable"
]);

function validatedEvent(
  input: unknown
): InvitationAuditEvent | null {
  try {
    if (
      input === null ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      types.isProxy(input)
    ) return null;

    const proto = Object.getPrototypeOf(input);
    if (proto !== Object.prototype && proto !== null) return null;

    const keys = Reflect.ownKeys(input);
    if (
      keys.length !== fieldNames.length ||
      keys.some(key =>
        typeof key !== "string" ||
        !fieldNames.includes(key as typeof fieldNames[number])
      )
    ) return null;

    const descriptors = Object.getOwnPropertyDescriptors(input);
    const values: Record<string, unknown> = Object.create(null);

    for (const key of fieldNames) {
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable ||
          !("value" in descriptor)) return null;
      values[key] = descriptor.value;
    }

    if (
      values.schemaVersion !== 1 ||
      (values.action !== "create" && values.action !== "read") ||
      (values.phase !== "attempt" && values.phase !== "outcome") ||
      typeof values.operationId !== "string" ||
      !operationIdPattern.test(values.operationId) ||
      typeof values.actorCorrelationId !== "string" ||
      !actorIdPattern.test(values.actorCorrelationId)
    ) return null;

    if (values.phase === "attempt") {
      if (values.status !== "attempted") return null;
    } else if (
      typeof values.status !== "string" ||
      !(values.action === "create"
        ? writeStatuses
        : readStatuses).has(values.status)
    ) {
      return null;
    }

    return Object.freeze({
      schemaVersion: 1,
      action: values.action,
      phase: values.phase,
      status: values.status,
      operationId: values.operationId,
      actorCorrelationId: values.actorCorrelationId
    } as InvitationAuditEvent);
  } catch {
    return null;
  }
}

type BoundActor = Readonly<{
  canonicalStaffId: string;
  actorCorrelationId: string;
}>;

/**
 * An attribution claim supplied by trusted backend composition.
 * This check cannot independently authenticate a caller or token.
 * Neither a valid shape nor an injected dependency grants authority.
 */
function validatedBinding(input: unknown): BoundActor | null {
  try {
    if (
      input === null ||
      typeof input !== "object" ||
      types.isProxy(input)
    ) return null;

    function data(key: string): unknown {
      const descriptor = Object.getOwnPropertyDescriptor(
        input, key
      );
      if (!descriptor || !("value" in descriptor)) {
        throw new Error("Invalid actor binding");
      }
      return descriptor.value;
    }

    if (
      data("status") !== "authenticated_admin_bound" ||
      data("authoritative") !== false ||
      data("storageAccessPermitted") !== false ||
      data("invitationExecutionPermitted") !== false ||
      data("retryPermitted") !== false ||
      data("productionRolloutPermitted") !== false
    ) return null;

    const actor = data("actor");

    if (
      actor === null ||
      typeof actor !== "object" ||
      types.isProxy(actor)
    ) return null;

    function actorData(key: string): unknown {
      const descriptor = Object.getOwnPropertyDescriptor(
        actor, key
      );
      if (!descriptor || !("value" in descriptor)) {
        throw new Error("Invalid actor identity");
      }
      return descriptor.value;
    }

    const canonicalStaffId = actorData("canonicalStaffId");
    const actorCorrelationId = actorData("actorCorrelationId");

    if (
      typeof canonicalStaffId !== "string" ||
      canonicalStaffId.length === 0 ||
      canonicalStaffId.length > 128 ||
      canonicalStaffId.trim() !== canonicalStaffId ||
      /[\u0000-\u001f\u007f]/.test(canonicalStaffId) ||
      typeof actorCorrelationId !== "string" ||
      !actorIdPattern.test(actorCorrelationId)
    ) return null;

    return Object.freeze({
      canonicalStaffId,
      actorCorrelationId
    });
  } catch {
    return null;
  }
}
export class StaffInvitationAuditTableRecorderPrototype
  implements InvitationAuditRecorder {
  constructor(
    private readonly table: Pick<TableClient, "createEntity">,
    private readonly binding?: ProtectedInvitationAuditActorResult
  ) {}

  /**
   * A separate create-only entity for every attempt/outcome.
   * Never retries after an ambiguous failure.
   * Throws on rejected input or storage failure so the adapter
   * can refuse access or report uncertainty.
   */
  async record(input: InvitationAuditEvent): Promise<void> {
    const event = validatedEvent(input);

    if (!event) {
      throw new Error("Invitation audit event rejected");
    }

    const binding = this.binding === undefined
      ? null
      : validatedBinding(this.binding);

    if (
      this.binding !== undefined &&
      (!binding || binding.actorCorrelationId !== event.actorCorrelationId)
    ) {
      throw new Error("Invitation audit actor binding rejected");
    }

    const eventId = randomUUID();
    const occurredAt = new Date().toISOString();

    try {
      await this.table.createEntity({
        partitionKey: STAFF_INVITATION_AUDIT_PARTITION,
        rowKey: `audit-${eventId}`,
        schemaVersion: 1,
        source: STAFF_INVITATION_AUDIT_SOURCE,
        eventId,
        occurredAt,
        action: event.action,
        phase: event.phase,
        status: event.status,
        operationId: event.operationId,
        actorCorrelationId: event.actorCorrelationId,
        ...(binding ? { canonicalStaffId: binding.canonicalStaffId } : {})
      });
    } catch {
      // Never expose storage SDK details or infer retry safety.
      // The write may have succeeded before its response failed.
      throw new Error("Invitation audit persistence uncertain");
    }
  }
}
