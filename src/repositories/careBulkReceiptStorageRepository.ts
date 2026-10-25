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
export type CareBulkReceiptReadbackStatus =
  | "matching_evidence"
  | "conflict"
  | "uncertain"
  | "invalid_input";

export type CareBulkReceiptReadbackResult = Readonly<
  Omit<CareBulkReceiptStorageResult, "status"> & {
    status: CareBulkReceiptReadbackStatus;
  }
>;

function readbackResult(
  status: CareBulkReceiptReadbackStatus
): CareBulkReceiptReadbackResult {
  return Object.freeze({
    ...result("uncertain"),
    status
  });
}
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

  /**
   * Read back one advisory receipt by request + visitor.
   * Caller-supplied membership and expected receipt are not authenticated.
   * A matching row never proves writer execution or permits replay.
   */
  async compareStoredReceipt(
    membership: unknown,
    expectedReceipt: unknown
  ): Promise<CareBulkReceiptReadbackResult> {
    const expected = assessCareBulkPerVisitorReceipts({
      membership,
      receipts: [expectedReceipt]
    });

    if (expected.inputRejected ||
        expected.receipts.length !== 1 ||
        expected.requestId === null) {
      return readbackResult("invalid_input");
    }

    const receipt = expected.receipts[0];
    let entity: Record<string, unknown>;

    try {
      entity = await this.table.getEntity(
        receipt.requestId,
        receipt.visitorId
      );
    } catch {
      // Includes 404, authorization failures and transport uncertainty.
      return readbackResult("uncertain");
    }

    try {
      if (entity.partitionKey !== receipt.requestId ||
          entity.rowKey !== receipt.visitorId ||
          entity.schemaVersion !== 1 ||
          entity.requestId !== receipt.requestId ||
          entity.visitorId !== receipt.visitorId ||
          entity.receiptId !== receipt.receiptId ||
          typeof entity.receiptJson !== "string" ||
          Buffer.byteLength(entity.receiptJson, "utf8") > 8192) {
        return readbackResult("conflict");
      }

      const stored = JSON.parse(entity.receiptJson);
      const assessment = assessCareBulkPerVisitorReceipts({
        membership,
        receipts: [stored]
      });

      if (assessment.inputRejected ||
          assessment.receipts.length !== 1 ||
          serialize(assessment.receipts[0]) !== entity.receiptJson ||
          serialize(assessment.receipts[0]) !== serialize(receipt)) {
        return readbackResult("conflict");
      }

      return readbackResult("matching_evidence");
    } catch {
      // Malformed persisted evidence is a conflict, not completion.
      return readbackResult("conflict");
    }
  }
}
