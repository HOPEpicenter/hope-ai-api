import * as assert from "node:assert/strict";
import type { TableClient } from "@azure/data-tables";
import {
  CareBulkReceiptStorageRepository
} from "../../src/repositories/careBulkReceiptStorageRepository";

async function main(): Promise<void> {
  const membership = {
    requestId: "snapshot-request",
    kind: "assign",
    assigneeId: "staff-a",
    visitorIds: ["visitor-a", "visitor-b"]
  };

  const expectedReceipt = {
    receiptId: "snapshot-receipt",
    requestId: "snapshot-request",
    visitorId: "visitor-a",
    kind: "assign",
    assigneeId: "staff-a",
    observation: "observed"
  };

  let readCount = 0;
  let writeCount = 0;

  const storedReceipt = JSON.stringify(expectedReceipt);

  const client = {
    async getEntity(partitionKey: string, rowKey: string) {
      readCount++;

      assert.equal(partitionKey, "snapshot-request");
      assert.equal(rowKey, "visitor-a");

      // Simulate caller mutation while an asynchronous storage read
      // is in progress. The request's intended membership changes.
      membership.visitorIds = ["visitor-a"];

      return {
        partitionKey,
        rowKey,
        schemaVersion: 1,
        requestId: "snapshot-request",
        visitorId: "visitor-a",
        receiptId: "snapshot-receipt",
        receiptJson: storedReceipt
      };
    },
    async createEntity() {
      writeCount++;
      throw new Error("unexpected_storage_write");
    }
  } as unknown as TableClient;

  const repository = new CareBulkReceiptStorageRepository(client);

  const result = await repository.compareStoredReceipt(
    membership,
    expectedReceipt
  );

  assert.equal(readCount, 1);
  assert.equal(writeCount, 0);

  assert.equal(result.advisoryOnly, true);
  assert.equal(result.receiptAuthenticityVerified, false);
  assert.equal(result.writerCoverageVerified, false);
  assert.equal(result.assignmentExecutionVerified, false);
  assert.equal(result.historicalReconciliationVerified, false);
  assert.equal(result.authorizationPermitted, false);
  assert.equal(result.executionPermitted, false);
  assert.equal(result.retryPermitted, false);
  assert.equal(result.automaticRecoveryPermitted, false);
  assert.equal(result.productionRolloutPermitted, false);

  // Caller mutation during awaited I/O cannot change the captured
  // membership snapshot used for both validation passes.
  assert.deepEqual(membership.visitorIds, ["visitor-a"]);
  assert.equal(result.status, "matching_evidence");

  // Matching evidence remains advisory and never permits execution.
  console.log("[PASS] Readback uses captured membership snapshot");

  // Stateful membership evidence must be captured exactly once.
  let membershipReads = 0;
  let statefulReadCount = 0;

  const statefulMembership = new Proxy({
    requestId: "snapshot-request",
    kind: "assign",
    assigneeId: "staff-a",
    visitorIds: ["visitor-a", "visitor-b"]
  }, {
    getOwnPropertyDescriptor(target, key) {
      if (key === "visitorIds") {
        membershipReads++;
        return {
          configurable: true,
          enumerable: true,
          writable: true,
          value: membershipReads === 1
            ? ["visitor-a", "visitor-b"]
            : ["visitor-b"]
        };
      }
      return Reflect.getOwnPropertyDescriptor(target, key);
    }
  });

  const statefulClient = {
    async getEntity(partitionKey: string, rowKey: string) {
      statefulReadCount++;
      assert.equal(partitionKey, "snapshot-request");
      assert.equal(rowKey, "visitor-a");
      return {
        partitionKey,
        rowKey,
        schemaVersion: 1,
        requestId: "snapshot-request",
        visitorId: "visitor-a",
        receiptId: "snapshot-receipt",
        receiptJson: storedReceipt
      };
    },
    async createEntity() {
      throw new Error("unexpected_storage_write");
    }
  } as unknown as TableClient;

  const statefulRepository =
    new CareBulkReceiptStorageRepository(statefulClient);

  const statefulResult = await statefulRepository.compareStoredReceipt(
    statefulMembership,
    expectedReceipt
  );

  assert.equal(membershipReads, 1);
  assert.equal(statefulReadCount, 1);
  assert.equal(statefulResult.status, "matching_evidence");
  assert.equal(statefulResult.authorizationPermitted, false);
  assert.equal(statefulResult.executionPermitted, false);
  assert.equal(statefulResult.retryPermitted, false);
  assert.equal(statefulResult.automaticRecoveryPermitted, false);

  console.log("[PASS] Stateful membership captured once");

  // Malformed accessor-backed membership is rejected before storage.
  let hostileReadCount = 0;
  const hostileMembership = {
    requestId: "snapshot-request",
    kind: "assign",
    assigneeId: "staff-a",
    visitorIds: ["visitor-a"]
  };

  Object.defineProperty(hostileMembership, "visitorIds", {
    enumerable: true,
    get() { throw new Error("synthetic_accessor"); }
  });

  const hostileClient = {
    async getEntity() {
      hostileReadCount++;
      throw new Error("unexpected_storage_read");
    }
  } as unknown as TableClient;

  const hostileRepository =
    new CareBulkReceiptStorageRepository(hostileClient);

  const hostileResult = await hostileRepository.compareStoredReceipt(
    hostileMembership,
    expectedReceipt
  );

  assert.equal(hostileResult.status, "invalid_input");
  assert.equal(hostileReadCount, 0);
  assert.equal(hostileResult.authorizationPermitted, false);
  assert.equal(hostileResult.executionPermitted, false);

  console.log("[PASS] Hostile membership rejected before storage");

  console.log("[PASS] No writes and no execution authority");
}

main().catch(error => {
  console.error("[EXPECTED-FAILURE-CHECK]", error.message);
  process.exitCode = 1;
});
