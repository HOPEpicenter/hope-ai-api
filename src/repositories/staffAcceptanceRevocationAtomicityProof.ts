import type { TransactionAction } from "@azure/data-tables";
import {
  ENTRA_STAFF_ACCEPTANCE_OPERATION
} from "./entraStaffAcceptanceHandoffReceiptStorageRepository";
import {
  STAFF_SECURITY_METADATA_HEAD,
  STAFF_SECURITY_METADATA_RECEIPT_PREFIX
} from "./staffEventsRepository";
import type {
  StaffScopedAtomicPort,
  StaffScopedAtomicResult
} from "./staffScopedAtomicDeactivation";

type Entity = Record<string, unknown>;
type ActiveHead = Entity & {
  partitionKey: string;
  rowKey: typeof STAFF_SECURITY_METADATA_HEAD;
  revision: number;
  authorizationRevision: number;
  state: "active";
  etag: string;
};
type IssuedReceipt = Entity & {
  partitionKey: string;
  rowKey: string;
  schemaVersion: 1;
  operation: typeof ENTRA_STAFF_ACCEPTANCE_OPERATION;
  identityDigest: string;
  authorizationRevision: number;
  issuedAtMs: number;
  expiresAtMs: number;
  state: "issued";
  revision: 0;
  etag: string;
};

export type StaffAcceptanceAtomicReceiptConsumption = Readonly<{
  staffId: string;
  receiptId: string;
  operation: typeof ENTRA_STAFF_ACCEPTANCE_OPERATION;
  identityDigest: string;
  authorizationRevision: number;
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

function object(value: unknown): Entity | null {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value as Entity
    : null;
}

function identifier(value: unknown): value is string {
  return typeof value === "string" &&
    /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function validTime(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 8640000000000000;
}

function validConsumption(
  value: unknown
): value is StaffAcceptanceAtomicReceiptConsumption {
  const request = object(value);
  return !!request &&
    identifier(request.staffId) &&
    typeof request.receiptId === "string" &&
    /^[0-9a-f]{64}$/.test(request.receiptId) &&
    request.operation === ENTRA_STAFF_ACCEPTANCE_OPERATION &&
    typeof request.identityDigest === "string" &&
    /^[0-9a-f]{64}$/.test(request.identityDigest) &&
    typeof request.authorizationRevision === "number" &&
    Number.isSafeInteger(request.authorizationRevision) &&
    request.authorizationRevision >= 0 &&
    request.authorizationRevision < Number.MAX_SAFE_INTEGER - 1;
}

function validEtag(value: unknown): value is string {
  return typeof value === "string" &&
    !!value.trim() &&
    value !== "*" &&
    value === value.trim();
}

function validHead(
  value: Entity | null,
  request: StaffAcceptanceAtomicReceiptConsumption
): value is ActiveHead {
  return !!value &&
    value.partitionKey === request.staffId &&
    value.rowKey === STAFF_SECURITY_METADATA_HEAD &&
    value.state === "active" &&
    value.authorizationRevision === request.authorizationRevision &&
    value.revision === request.authorizationRevision &&
    validEtag(value.etag);
}

function validReceipt(
  value: Entity | null,
  request: StaffAcceptanceAtomicReceiptConsumption
): value is IssuedReceipt {
  return !!value &&
    value.partitionKey === request.staffId &&
    value.rowKey ===
      `${STAFF_SECURITY_METADATA_RECEIPT_PREFIX}${request.receiptId}` &&
    value.schemaVersion === 1 &&
    value.operation === request.operation &&
    value.identityDigest === request.identityDigest &&
    value.authorizationRevision === request.authorizationRevision &&
    value.state === "issued" &&
    value.revision === 0 &&
    validTime(value.issuedAtMs) &&
    validTime(value.expiresAtMs) &&
    value.expiresAtMs > value.issuedAtMs &&
    value.expiresAtMs - value.issuedAtMs <= 60_000 &&
    validEtag(value.etag);
}

function missingEntity(error: unknown): boolean {
  try {
    const value = object(error);
    if (!value || value.code === "TableNotFound") return false;
    const status = Number(value.statusCode ?? value.status ?? 0);
    return status === 404 ||
      value.code === "ResourceNotFound" ||
      value.code === "EntityNotFound";
  } catch {
    return false;
  }
}

function conditionalConflict(error: unknown): boolean {
  try {
    const value = object(error);
    const status = Number(value?.statusCode ?? value?.status ?? 0);
    return status === 409 || status === 412 ||
      value?.code === "UpdateConditionNotSatisfied" ||
      value?.code === "ConditionNotMet";
  } catch {
    return false;
  }
}

/**
 * Isolated proof only. No live authorization or operation execution is
 * provided; callers must supply a server-verified identity digest.
 */
export async function consumeStaffAcceptanceReceiptAtomically(
  request: unknown,
  port: StaffScopedAtomicPort,
  prototypeEnabled = false,
  clock: () => number = Date.now
): Promise<StaffScopedAtomicResult> {
  if (
    prototypeEnabled !== true ||
    !validConsumption(request) ||
    !port ||
    typeof port.getEntity !== "function" ||
    typeof port.submitTransaction !== "function"
  ) {
    return result("denied");
  }

  let head: Entity | null;
  let receipt: Entity | null;
  try {
    const [headValue, receiptValue] = await Promise.all([
      port.getEntity(request.staffId, STAFF_SECURITY_METADATA_HEAD),
      port.getEntity(
        request.staffId,
        `${STAFF_SECURITY_METADATA_RECEIPT_PREFIX}${request.receiptId}`
      )
    ]);
    head = object(headValue);
    receipt = object(receiptValue);
  } catch (error) {
    return result(missingEntity(error) ? "denied" : "uncertain");
  }

  if (!validHead(head, request) || !validReceipt(receipt, request)) {
    return result("denied");
  }

  const checkedAt = clock();
  if (
    !validTime(checkedAt) ||
    receipt.issuedAtMs > checkedAt ||
    checkedAt >= receipt.expiresAtMs
  ) {
    return result("denied");
  }

  const nextRevision = request.authorizationRevision + 1;
  const actions: TransactionAction[] = [
    [
      "update",
      {
        partitionKey: request.staffId,
        rowKey: STAFF_SECURITY_METADATA_HEAD,
        revision: nextRevision,
        authorizationRevision: nextRevision,
        state: "active"
      },
      "Replace",
      { etag: head.etag }
    ],
    [
      "update",
      {
        partitionKey: request.staffId,
        rowKey: receipt.rowKey,
        schemaVersion: receipt.schemaVersion,
        operation: receipt.operation,
        identityDigest: receipt.identityDigest,
        authorizationRevision: request.authorizationRevision,
        issuedAtMs: receipt.issuedAtMs,
        expiresAtMs: receipt.expiresAtMs,
        state: "consumed",
        revision: 1,
        consumedAtMs: checkedAt
      },
      "Replace",
      { etag: receipt.etag }
    ]
  ];

  try {
    await port.submitTransaction(actions);
  } catch (error) {
    return result(conditionalConflict(error) ? "denied" : "uncertain");
  }

  const confirmedAt = clock();
  if (
    !validTime(confirmedAt) ||
    confirmedAt < checkedAt ||
    confirmedAt >= receipt.expiresAtMs
  ) {
    return result("denied");
  }

  return result("committed");
}
