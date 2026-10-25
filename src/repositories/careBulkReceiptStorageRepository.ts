import type { TableClient } from "@azure/data-tables";
import {
  assessCareBulkPerVisitorReceipts,
  type CareBulkPerVisitorReceipt
} from "../services/authorization/careBulkPerVisitorReceiptContract";

/**
 * Create-only storage prototype for caller-supplied Bulk Care receipts.
 *
 * Not connected to live Care writers. The caller injects a TableClient
 * and owns table creation and lifecycle.
 *
 * Persistence is NOT proof of writer execution or assignment success.
 * No authorization, automatic retry, replay, or recovery is permitted.
 */

export type CareBulkReceiptStorageStatus =
  | "recorded_unverified"
  | "conflict"
  | "invalid_input"
  | "uncertain";

export type CareBulkReceiptStorageResult = Readonly<{
  status: CareBulkReceiptStorageStatus;
  advisoryOnly: true;
  receiptAuthenticityVerified: false;
  writerCoverageVerified: false;
  assignmentExecutionVerified: false;
  historicalReconciliationVerified: false;
  authorizationPermitted: false;
  executionPermitted: false;
  retryPermitted: false;
  automaticRecoveryPermitted: false;
  productionRolloutPermitted: false;
}>;

function result(
  status: CareBulkReceiptStorageStatus
): CareBulkReceiptStorageResult {
  return Object.freeze({
    status,
    advisoryOnly: true,
    receiptAuthenticityVerified: false,
    writerCoverageVerified: false,
    assignmentExecutionVerified: false,
    historicalReconciliationVerified: false,
    authorizationPermitted: false,
    executionPermitted: false,
    retryPermitted: false,
    automaticRecoveryPermitted: false,
    productionRolloutPermitted: false
  });
}

function storageStatus(error: unknown): number | null {
  try {
    if (error === null || typeof error !== "object") {
      return null;
    }
    const value = Reflect.get(error, "statusCode");
    return typeof value === "number" ? value : null;
  } catch {
    return null;
  }
}

function serialize(receipt: CareBulkPerVisitorReceipt): string {
  return JSON.stringify({
    receiptId: receipt.receiptId,
    requestId: receipt.requestId,
    visitorId: receipt.visitorId,
    kind: receipt.kind,
    assigneeId: receipt.assigneeId,
    observation: receipt.observation
  });
}

/**
 * Writes one immutable-looking evidence row by request + visitor.
 * This operation provides create-only semantics, not a cross-storage
 * transaction with Care profiles or membership storage.
 *
 * A 409 is a conflict even if existing content might match.
 * An ambiguous storage failure remains uncertain; never retry here.
 */
export class CareBulkReceiptStorageRepository {
  constructor(private readonly table: TableClient) {}

  async recordReceipt(
    membership: unknown,
    receipt: unknown
  ): Promise<CareBulkReceiptStorageResult> {
    const assessment = assessCareBulkPerVisitorReceipts({
      membership,
      receipts: [receipt]
    });

    if (assessment.inputRejected ||
        assessment.receipts.length !== 1 ||
        assessment.requestId === null) {
      return result("invalid_input");
    }

    const accepted = assessment.receipts[0];

    try {
      await this.table.createEntity({
        partitionKey: accepted.requestId,
        rowKey: accepted.visitorId,
        schemaVersion: 1,
        requestId: accepted.requestId,
        visitorId: accepted.visitorId,
        receiptId: accepted.receiptId,
        receiptJson: serialize(accepted)
      });

      return result("recorded_unverified");
    } catch (error) {
      if (storageStatus(error) === 409) {
        return result("conflict");
      }
      return result("uncertain");
    }
  }
}
