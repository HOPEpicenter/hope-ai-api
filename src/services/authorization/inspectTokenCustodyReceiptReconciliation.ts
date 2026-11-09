/**
 * Read-only, metadata-only custody receipt reconciliation v1.
 *
 * Observations are normalized DTOs supplied by trusted infrastructure.
 * This evaluator neither authenticates their source nor reads storage.
 * It never executes credentials, writes records, or permits retries.
 */

export type CustodyReceiptReconciliationStatus =
  | "recorded"
  | "absent_unproven"
  | "conflicting_evidence"
  | "unresolved";

export type CustodyReceiptReconciliationResult = Readonly<{
  status: CustodyReceiptReconciliationStatus;
  executionPermitted: false;
  retryPermitted: false;
}>;

const PARTITION = "token-custody-metadata-v1";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null);
}

function exact(
  value: unknown,
  keys: readonly string[]
): value is Record<string, unknown> {
  if (!record(value)) return false;
  const actual = Reflect.ownKeys(value);
  return actual.length === keys.length &&
    actual.every(key => typeof key === "string") &&
    keys.every(key =>
      Object.prototype.hasOwnProperty.call(value, key)
    );
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function equalFields(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
  fields: readonly string[]
): boolean {
  return fields.every(key => left[key] === right[key]);
}

function decision(
  status: CustodyReceiptReconciliationStatus
): CustodyReceiptReconciliationResult {
  return Object.freeze({
    status,
    executionPermitted: false,
    retryPermitted: false
  });
}

const SNAPSHOT_FIELDS = [
  "recordId", "revision", "rotationRevision",
  "revocationRevision", "state", "accessExpiresAtMs"
] as const;

const RECEIPT_FIELDS = [
  "schemaVersion", "receiptId", "recordId",
  "action", "previousRevision", "nextRevision"
] as const;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const RECORD_ID = /^[A-Za-z0-9_-]{1,128}$/;

function validRevision(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) && value >= 0;
}

/**
 * A proposed plan is synthetic evidence, not authorization.
 * Verify its shape independently before comparing stored observations.
 */
function expectedFromPlan(plan: unknown): {
  recordId: string;
  receiptRowKey: string;
  snapshot: Record<string, unknown>;
  receipt: Record<string, unknown>;
} | null {
  if (!exact(plan, [
    "outcome", "actions", "executionPermitted", "retryPermitted"
  ]) ||
      plan.outcome !== "proposed" ||
      plan.executionPermitted !== false ||
      plan.retryPermitted !== false ||
      !Array.isArray(plan.actions) ||
      plan.actions.length !== 2) {
    return null;
  }

  const [update, create]: unknown[] = plan.actions;

  if (!exact(update, [
    "kind", "partitionKey", "rowKey",
    "snapshotJson", "etag", "mode"
  ]) ||
      !exact(create, [
        "kind", "partitionKey", "rowKey", "receiptJson"
      ]) ||
      update.kind !== "update" ||
      create.kind !== "create" ||
      update.mode !== "Replace" ||
      update.partitionKey !== PARTITION ||
      create.partitionKey !== PARTITION ||
      typeof update.rowKey !== "string" ||
      !RECORD_ID.test(update.rowKey) ||
      typeof update.etag !== "string" ||
      !update.etag.trim() ||
      update.etag.trim() === "*" ||
      update.etag !== update.etag.trim()) {
    return null;
  }

  const snapshot = parseJson(update.snapshotJson);
  const receipt = parseJson(create.receiptJson);

  if (!exact(snapshot, SNAPSHOT_FIELDS) ||
      !exact(receipt, RECEIPT_FIELDS) ||
      snapshot.recordId !== update.rowKey ||
      !validRevision(snapshot.revision) ||
      snapshot.revision < 1 ||
      !validRevision(snapshot.rotationRevision) ||
      !validRevision(snapshot.revocationRevision) ||
      snapshot.rotationRevision > snapshot.revision ||
      snapshot.revocationRevision > snapshot.revision ||
      (snapshot.state !== "active" &&
        snapshot.state !== "revoked") ||
      !validRevision(snapshot.accessExpiresAtMs) ||
      snapshot.accessExpiresAtMs === 0 ||
      receipt.schemaVersion !== 1 ||
      typeof receipt.receiptId !== "string" ||
      !UUID.test(receipt.receiptId) ||
      receipt.recordId !== update.rowKey ||
      (receipt.action !== "rotate" &&
        receipt.action !== "revoke") ||
      !validRevision(receipt.previousRevision) ||
      receipt.nextRevision !== snapshot.revision ||
      receipt.previousRevision + 1 !== snapshot.revision ||
      (receipt.action === "rotate" &&
        snapshot.state !== "active") ||
      (receipt.action === "revoke" &&
        snapshot.state !== "revoked") ||
      create.rowKey !== `audit-${receipt.receiptId}`) {
    return null;
  }

  return {
    recordId: update.rowKey,
    receiptRowKey: create.rowKey as string,
    snapshot,
    receipt
  };
}

/**
 * "recorded" means internally consistent with supplied observations.
 * It is not proof of storage authenticity or a durable execution fence.
 *
 * A missing receipt never authorizes resubmission.
 * A reader failure must be supplied as unavailable, not absent.
 */
export function inspectTokenCustodyReceiptReconciliation(
  plan: unknown,
  observation: unknown
): CustodyReceiptReconciliationResult {
  const expected = expectedFromPlan(plan);

  if (!expected ||
      !exact(observation, ["metadata", "receipt"])) {
    return decision("unresolved");
  }

  const { metadata, receipt } = observation;

  if (metadata === undefined || receipt === undefined) {
    return decision("unresolved");
  }

  if (metadata === null || receipt === null) {
    return decision("absent_unproven");
  }

  if (!exact(metadata, [
    "partitionKey", "rowKey", "snapshotJson", "etag"
  ]) ||
      !exact(receipt, [
        "partitionKey", "rowKey", "receiptJson", "etag"
      ])) {
    return decision("conflicting_evidence");
  }

  if (metadata.partitionKey !== PARTITION ||
      receipt.partitionKey !== PARTITION ||
      metadata.rowKey !== expected.recordId ||
      receipt.rowKey !== expected.receiptRowKey ||
      typeof metadata.etag !== "string" ||
      typeof receipt.etag !== "string" ||
      !metadata.etag.trim() ||
      !receipt.etag.trim() ||
      metadata.etag.trim() === "*" ||
      receipt.etag.trim() === "*") {
    return decision("conflicting_evidence");
  }

  const observedSnapshot = parseJson(metadata.snapshotJson);
  const observedReceipt = parseJson(receipt.receiptJson);

  if (!exact(observedSnapshot, SNAPSHOT_FIELDS) ||
      !exact(observedReceipt, RECEIPT_FIELDS) ||
      !equalFields(
        observedSnapshot, expected.snapshot, SNAPSHOT_FIELDS
      ) ||
      !equalFields(
        observedReceipt, expected.receipt, RECEIPT_FIELDS
      )) {
    return decision("conflicting_evidence");
  }

  return decision("recorded");
}
