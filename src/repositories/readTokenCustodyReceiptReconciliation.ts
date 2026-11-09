import {
  inspectTokenCustodyReceiptReconciliation,
  type CustodyReceiptReconciliationResult
} from "../services/authorization/inspectTokenCustodyReceiptReconciliation";

import {
  TOKEN_CUSTODY_PARTITION_KEY
} from "./tokenCustodyMetadataRepository";

/**
 * Injected read-only port. Trusted infrastructure owns the implementation.
 * This module never constructs SDK clients or reads credentials.
 */
export interface CustodyReceiptReadPort {
  getEntity(
    partitionKey: string,
    rowKey: string
  ): Promise<unknown>;
}

type ReadResult =
  | { kind: "found"; value: unknown }
  | { kind: "missing" }
  | { kind: "unavailable" };

const RECORD_ID = /^[A-Za-z0-9_-]{1,128}$/;
const RECEIPT_ROW =
  /^audit-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function unresolved(): CustodyReceiptReconciliationResult {
  return {
    status: "unresolved",
    executionPermitted: false,
    retryPermitted: false
  };
}

function plain(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" ||
      Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exact(
  value: unknown,
  keys: readonly string[]
): value is Record<string, unknown> {
  if (!plain(value)) return false;
  const actual = Reflect.ownKeys(value);

  return actual.length === keys.length &&
    actual.every(key => typeof key === "string") &&
    keys.every(key =>
      Object.prototype.hasOwnProperty.call(value, key)
    );
}

/**
 * Determine expected storage addresses without trusting request data.
 * Full receipt and snapshot validation remains the evaluator's job.
 */
function addresses(plan: unknown): {
  metadataId: string;
  receiptId: string;
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

  if (!plain(update) || !plain(create) ||
      update.kind !== "update" ||
      create.kind !== "create" ||
      update.partitionKey !== TOKEN_CUSTODY_PARTITION_KEY ||
      create.partitionKey !== TOKEN_CUSTODY_PARTITION_KEY ||
      typeof update.rowKey !== "string" ||
      !RECORD_ID.test(update.rowKey) ||
      typeof create.rowKey !== "string" ||
      !RECEIPT_ROW.test(create.rowKey)) {
    return null;
  }

  return {
    metadataId: update.rowKey,
    receiptId: create.rowKey
  };
}

function statusCode(error: unknown): number | null {
  if (error === null || typeof error !== "object") {
    return null;
  }

  try {
    for (const name of ["statusCode", "status"]) {
      const descriptor = Object.getOwnPropertyDescriptor(error, name);

      if (!descriptor ||
          !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
        continue;
      }

      const value = descriptor.value;

      if (typeof value === "number" &&
          Number.isInteger(value)) {
        return value;
      }
    }
  } catch {
    return null;
  }

  return null;
}

async function read(
  port: CustodyReceiptReadPort,
  rowKey: string
): Promise<ReadResult> {
  try {
    const value = await port.getEntity(
      TOKEN_CUSTODY_PARTITION_KEY,
      rowKey
    );

    if (value === null || value === undefined) {
      return { kind: "unavailable" };
    }

    return { kind: "found", value };
  } catch (error) {
    if (statusCode(error) === 404) {
      return { kind: "missing" };
    }

    return { kind: "unavailable" };
  }
}

/**
 * Read-only reconciliation, not permission to execute or retry.
 *
 * Two independent reads are NOT an atomic snapshot.
 * Even "recorded" must never authorize credential execution.
 *
 * Missing is distinguished from unavailable only when the
 * trusted port provides an explicit storage 404 response.
 */
export async function readTokenCustodyReceiptReconciliation(
  plan: unknown,
  port: CustodyReceiptReadPort
): Promise<CustodyReceiptReconciliationResult> {
  const keys = addresses(plan);

  if (!keys || !port || typeof port.getEntity !== "function") {
    return unresolved();
  }

  const metadata = await read(port, keys.metadataId);

  if (metadata.kind === "unavailable") {
    return unresolved();
  }

  const receipt = await read(port, keys.receiptId);

  if (receipt.kind === "unavailable") {
    return unresolved();
  }

  return inspectTokenCustodyReceiptReconciliation(plan, {
    metadata: metadata.kind === "missing"
      ? null
      : metadata.value,
    receipt: receipt.kind === "missing"
      ? null
      : receipt.value
  });
}
