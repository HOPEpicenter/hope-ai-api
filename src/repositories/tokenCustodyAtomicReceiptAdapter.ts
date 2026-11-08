import {
  type CustodyAtomicReceiptAction,
  type CustodyAtomicReceiptPlan,
} from "../services/authorization/planTokenCustodyAtomicReceipt";
import {
  TOKEN_CUSTODY_PARTITION_KEY,
} from "./tokenCustodyMetadataRepository";

/**
 * Synthetic port only. It represents ONE atomic submission.
 * It MUST NOT be replaced with sequential update/create calls.
 * No Azure SDK, live identity, credential, or external executor.
 */
export interface SyntheticCustodyTransactionPort {
  submitTransaction(
    actions: readonly [
      CustodyAtomicReceiptAction,
      CustodyAtomicReceiptAction,
    ],
  ): Promise<unknown>;
}

export type CustodyAtomicCommitResult = Readonly<{
  outcome: "committed" | "denied" | "uncertain";
  executionPermitted: false;
  retryPermitted: false;
}>;

const RECORD_ID = /^[A-Za-z0-9_-]{1,128}$/;
const RECEIPT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function result(
  outcome: CustodyAtomicCommitResult["outcome"],
): CustodyAtomicCommitResult {
  return {
    outcome,
    executionPermitted: false,
    retryPermitted: false,
  };
}

function exactKeys(
  value: unknown,
  expected: readonly string[],
): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return keys.length === expected.length &&
    expected.every(key =>
      Object.prototype.hasOwnProperty.call(value, key)
    );
}

function validPlan(
  plan: CustodyAtomicReceiptPlan,
): plan is Extract<CustodyAtomicReceiptPlan, { outcome: "proposed" }> {
  if (!exactKeys(plan, [
    "outcome", "actions", "executionPermitted", "retryPermitted",
  ]) ||
      plan.outcome !== "proposed" ||
      plan.executionPermitted !== false ||
      plan.retryPermitted !== false ||
      !Array.isArray(plan.actions) ||
      plan.actions.length !== 2) {
    return false;
  }

  const [update, create] = plan.actions;

  if (!exactKeys(update, [
    "kind", "partitionKey", "rowKey", "snapshotJson",
    "etag", "mode",
  ]) ||
      !exactKeys(create, [
        "kind", "partitionKey", "rowKey", "receiptJson",
      ]) ||
      update.kind !== "update" ||
      create.kind !== "create" ||
      update.partitionKey !== TOKEN_CUSTODY_PARTITION_KEY ||
      create.partitionKey !== TOKEN_CUSTODY_PARTITION_KEY ||
      typeof update.rowKey !== "string" ||
      !RECORD_ID.test(update.rowKey) ||
      update.mode !== "Replace" ||
      typeof update.etag !== "string" ||
      !update.etag.trim() ||
      update.etag.trim() === "*" ||
      update.etag !== update.etag.trim() ||
      typeof update.snapshotJson !== "string" ||
      typeof create.receiptJson !== "string" ||
      typeof create.rowKey !== "string") {
    return false;
  }

  try {
    const snapshot: unknown = JSON.parse(update.snapshotJson);
    const receipt: unknown = JSON.parse(create.receiptJson);

    if (!exactKeys(snapshot, [
      "recordId", "revision", "rotationRevision",
      "revocationRevision", "state", "accessExpiresAtMs",
    ]) ||
        !exactKeys(receipt, [
          "schemaVersion", "receiptId", "recordId",
          "action", "previousRevision", "nextRevision",
        ]) ||
        typeof snapshot.recordId !== "string" ||
        snapshot.recordId !== update.rowKey ||
        !Number.isSafeInteger(snapshot.revision) ||
        (snapshot.revision as number) < 1 ||
        !Number.isSafeInteger(snapshot.rotationRevision) ||
        !Number.isSafeInteger(snapshot.revocationRevision) ||
        (snapshot.rotationRevision as number) < 0 ||
        (snapshot.revocationRevision as number) < 0 ||
        (snapshot.rotationRevision as number) > (snapshot.revision as number) ||
        (snapshot.revocationRevision as number) > (snapshot.revision as number) ||
        !["active", "revoked"].includes(String(snapshot.state)) ||
        !Number.isSafeInteger(snapshot.accessExpiresAtMs) ||
        (snapshot.accessExpiresAtMs as number) <= 0 ||
        receipt.schemaVersion !== 1 ||
        typeof receipt.receiptId !== "string" ||
        !RECEIPT_ID.test(receipt.receiptId) ||
        create.rowKey !== `audit-${receipt.receiptId}` ||
        receipt.recordId !== snapshot.recordId ||
        !["rotate", "revoke"].includes(String(receipt.action)) ||
        !Number.isSafeInteger(receipt.previousRevision) ||
        (receipt.previousRevision as number) < 0 ||
        receipt.nextRevision !== snapshot.revision ||
        (receipt.previousRevision as number) + 1 !==
          (snapshot.revision as number) ||
        (receipt.action === "revoke" && snapshot.state !== "revoked") ||
        (receipt.action === "rotate" && snapshot.state !== "active")) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function knownConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as {
    statusCode?: unknown;
    status?: unknown;
    code?: unknown;
  };
  const status = Number(value.statusCode ?? value.status ?? 0);
  const code = String(value.code ?? "");
  return status === 404 || status === 409 || status === 412 ||
    code === "ResourceNotFound" ||
    code === "EntityNotFound" ||
    code === "UpdateConditionNotSatisfied" ||
    code === "ConditionNotMet";
}

/**
 * Disabled unless an explicit synthetic-test flag is supplied.
 * The injected fake port may mimic an atomic transaction.
 * This function is NOT a production storage implementation,
 * proof of durable atomicity, or authority to execute OAuth.
 */
export async function submitSyntheticCustodyAtomicReceipt(
  plan: CustodyAtomicReceiptPlan,
  port: SyntheticCustodyTransactionPort,
  syntheticTestEnabled = false,
): Promise<CustodyAtomicCommitResult> {
  if (syntheticTestEnabled !== true ||
      !validPlan(plan) ||
      !port ||
      typeof port.submitTransaction !== "function") {
    return result("denied");
  }

  try {
    await port.submitTransaction(plan.actions);
    return result("committed");
  } catch (error) {
    // No automatic retries. An acknowledgement could be lost
    // after a successful commit; reconciliation is separate.
    return result(knownConflict(error) ? "denied" : "uncertain");
  }
}
