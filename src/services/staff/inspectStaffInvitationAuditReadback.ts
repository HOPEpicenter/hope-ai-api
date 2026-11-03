import { types } from "node:util";

import {
  STAFF_INVITATION_AUDIT_PARTITION,
  STAFF_INVITATION_AUDIT_SOURCE
} from "../../repositories/staffInvitationAuditTableRecorderPrototype";

export type AuditReadbackStatus =
  | "matching_evidence"
  | "missing"
  | "incomplete"
  | "contradictory"
  | "unavailable"
  | "invalid_input";

export type AuditReadbackResult = Readonly<{
  status: AuditReadbackStatus;
  authoritative: false;
  independentlyVerifiedDurability: false;
  storageAccessPermitted: false;
  executionPermitted: false;
  retryPermitted: false;
  productionRolloutPermitted: false;
}>;

export type AuditReadbackRequest = Readonly<{
  operationId: string;
  actorCorrelationId: string;
  canonicalStaffId: string;
  action: "create" | "read";
}>;

export type AuditReadbackPort = Readonly<{
  /**
   * Must be supplied by trusted backend composition.
   * Read only; no table creation, fallback, retry or mutation.
   * The port must return all records relevant to this request,
   * including duplicates, without hiding contradictory evidence.
   */
  readRows(request: AuditReadbackRequest): Promise<readonly unknown[]>;
}>;

const uuidV4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const safeStaffId =
  /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const denied = Object.freeze({
  authoritative: false,
  independentlyVerifiedDurability: false,
  storageAccessPermitted: false,
  executionPermitted: false,
  retryPermitted: false,
  productionRolloutPermitted: false
} as const);

function result(status: AuditReadbackStatus): AuditReadbackResult {
  return Object.freeze({ status, ...denied });
}

function own(value: unknown, key: string): unknown {
  if (
    !value ||
    typeof value !== "object" ||
    types.isProxy(value) ||
    Array.isArray(value)
  ) {
    throw new Error("Invalid evidence");
  }

  const descriptor = Object.getOwnPropertyDescriptor(value, key);

  if (!descriptor || !("value" in descriptor)) {
    throw new Error("Invalid evidence");
  }

  return descriptor.value;
}

function requestFrom(input: unknown): AuditReadbackRequest | null {
  try {
    const operationId = own(input, "operationId");
    const actorCorrelationId = own(input, "actorCorrelationId");
    const canonicalStaffId = own(input, "canonicalStaffId");
    const action = own(input, "action");

    if (
      typeof operationId !== "string" ||
      !uuidV4.test(operationId) ||
      typeof actorCorrelationId !== "string" ||
      !uuid.test(actorCorrelationId) ||
      typeof canonicalStaffId !== "string" ||
      !safeStaffId.test(canonicalStaffId) ||
      (action !== "create" && action !== "read")
    ) return null;

    return Object.freeze({
      operationId,
      actorCorrelationId,
      canonicalStaffId,
      action
    });
  } catch {
    return null;
  }
}

function validRow(
  row: unknown,
  request: AuditReadbackRequest
): "attempt" | "outcome" | null {
  try {
    if (
      own(row, "partitionKey") !==
        STAFF_INVITATION_AUDIT_PARTITION ||
      own(row, "source") !== STAFF_INVITATION_AUDIT_SOURCE ||
      own(row, "schemaVersion") !== 1 ||
      own(row, "operationId") !== request.operationId ||
      own(row, "actorCorrelationId") !==
        request.actorCorrelationId ||
      own(row, "canonicalStaffId") !==
        request.canonicalStaffId ||
      own(row, "action") !== request.action
    ) return null;

    const eventId = own(row, "eventId");
    const rowKey = own(row, "rowKey");
    const occurredAt = own(row, "occurredAt");
    const phase = own(row, "phase");
    const status = own(row, "status");

    if (
      typeof eventId !== "string" ||
      !uuidV4.test(eventId) ||
      rowKey !== `audit-${eventId}` ||
      typeof occurredAt !== "string" ||
      !Number.isFinite(Date.parse(occurredAt)) ||
      new Date(occurredAt).toISOString() !== occurredAt
    ) return null;

    if (phase === "attempt") {
      return status === "attempted" ? "attempt" : null;
    }

    if (phase !== "outcome") return null;

    const validStatuses = request.action === "create"
      ? [
          "recorded_unverified",
          "conflict",
          "invalid_input",
          "uncertain"
        ]
      : [
          "matching_evidence",
          "missing",
          "contradictory",
          "invalid_input",
          "unavailable"
        ];

    return typeof status === "string" &&
      validStatuses.includes(status)
      ? "outcome"
      : null;
  } catch {
    return null;
  }
}

/**
 * Synthetic, non-authorizing readback inspection.
 *
 * The injected port is not automatically an independent trust source.
 * This function cannot prove Azure control-plane permissions,
 * durability, retention, immutability or operational authorization.
 */
export async function inspectStaffInvitationAuditReadback(
  input: unknown,
  port: AuditReadbackPort
): Promise<AuditReadbackResult> {
  const request = requestFrom(input);

  if (!request) return result("invalid_input");

  try {
    if (
      !port ||
      types.isProxy(port) ||
      typeof own(port, "readRows") !== "function"
    ) return result("unavailable");

    const readRows = own(port, "readRows") as
      AuditReadbackPort["readRows"];

    const rows = await readRows(request);

    if (!Array.isArray(rows) || types.isProxy(rows)) {
      return result("unavailable");
    }

    if (rows.length === 0) return result("missing");
    if (rows.length > 2) return result("contradictory");

    const phases: string[] = [];
    const eventIds = new Set<string>();

    for (const row of rows) {
      const phase = validRow(row, request);

      if (!phase) return result("contradictory");

      phases.push(phase);
      eventIds.add(own(row, "eventId") as string);
    }

    if (rows.length === 1) return result("incomplete");

    if (
      phases.filter(phase => phase === "attempt").length !== 1 ||
      phases.filter(phase => phase === "outcome").length !== 1 ||
      eventIds.size !== 2
    ) return result("contradictory");

    return result("matching_evidence");
  } catch {
    return result("unavailable");
  }
}
