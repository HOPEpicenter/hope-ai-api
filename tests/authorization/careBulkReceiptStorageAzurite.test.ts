import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { TableClient } from "@azure/data-tables";
import {
  CareBulkReceiptStorageRepository
} from "../../src/repositories/careBulkReceiptStorageRepository";

/**
 * Local Azurite-only test. Never use a cloud connection string.
 * Each run creates and removes its own randomly named table.
 */

const port = process.env.HOPE_ASSIGNMENT_AZURITE_TABLE_PORT;

if (port !== "11002") {
  throw new Error("Explicit local Azurite port 11002 required");
}

const endpoint = "http://127.0.0.1:11002/devstoreaccount1";

const connectionString = [
      "DefaultEndpointsProtocol=http",
      "AccountName=devstoreaccount1",
      "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==",
      "TableEndpoint=http://127.0.0.1:11002/devstoreaccount1"
    ].join(";");
const portConnectionString =
  connectionString;

const client = TableClient.fromConnectionString(
  portConnectionString,
  `CareReceipt${randomUUID().replace(/-/g, "").slice(0, 20)}`,
  { allowInsecureConnection: true }
);
const requestId = `synthetic-${randomUUID()}`;

const membership = {
  requestId,
  kind: "assign" as const,
  assigneeId: "synthetic-staff",
  visitorIds: ["synthetic-visitor-a", "synthetic-visitor-b"]
};

function receipt(
  visitorId: string,
  receiptId: string = `synthetic-receipt-${visitorId}`,
  observation = "observed"
) {
  return {
    receiptId,
    requestId,
    visitorId,
    kind: "assign",
    assigneeId: membership.assigneeId,
    observation
  };
}

function safe(value: {
  advisoryOnly: boolean;
  receiptAuthenticityVerified: boolean;
  writerCoverageVerified: boolean;
  assignmentExecutionVerified: boolean;
  historicalReconciliationVerified: boolean;
  authorizationPermitted: boolean;
  executionPermitted: boolean;
  retryPermitted: boolean;
  automaticRecoveryPermitted: boolean;
  productionRolloutPermitted: boolean;
}) {
  assert.equal(value.advisoryOnly, true);
  assert.equal(value.receiptAuthenticityVerified, false);
  assert.equal(value.writerCoverageVerified, false);
  assert.equal(value.assignmentExecutionVerified, false);
  assert.equal(value.historicalReconciliationVerified, false);
  assert.equal(value.authorizationPermitted, false);
  assert.equal(value.executionPermitted, false);
  assert.equal(value.retryPermitted, false);
  assert.equal(value.automaticRecoveryPermitted, false);
  assert.equal(value.productionRolloutPermitted, false);
}

async function main() {
  let created = false;

  try {
    await client.createTable();
    created = true;

    const repository = new CareBulkReceiptStorageRepository(client);

    // First create records evidence, but verifies no execution.
    const first = await repository.recordReceipt(
      membership,
      receipt("synthetic-visitor-a")
    );
    assert.equal(first.status, "recorded_unverified");
    safe(first);
    console.log("[PASS] First create is unverified evidence");

    // Same receipt must not be treated as successful idempotent replay.
    const duplicate = await repository.recordReceipt(
      membership,
      receipt("synthetic-visitor-a")
    );
    assert.equal(duplicate.status, "conflict");
    safe(duplicate);

    // A different receipt ID for the same request/visitor is a conflict.
    const changed = await repository.recordReceipt(
      membership,
      receipt("synthetic-visitor-a", "different-receipt")
    );
    assert.equal(changed.status, "conflict");
    safe(changed);

    const stored = await client.getEntity(
      requestId,
      "synthetic-visitor-a"
    );

    assert.equal(
      stored.receiptId,
      "synthetic-receipt-synthetic-visitor-a"
    );
    assert.equal(stored.schemaVersion, 1);
    console.log("[PASS] Duplicate and changed receipt cannot overwrite");

    // A request/visitor mismatch fails validation before createEntity.
    const invalid = await repository.recordReceipt(
      membership,
      receipt("visitor-outside")
    );
    assert.equal(invalid.status, "invalid_input");
    safe(invalid);
    console.log("[PASS] Unlisted visitor rejected");

    // Reject invalid receipt evidence before invoking the storage client.
    let unexpectedWrites = 0;

    const forbiddenClient = {
      createEntity: async (_entity: unknown) => {
        unexpectedWrites++;
        throw new Error("invalid_input_reached_storage");
      }
    } as unknown as TableClient;

    const validationRepository =
      new CareBulkReceiptStorageRepository(forbiddenClient);

    const mismatchedRequest = await validationRepository.recordReceipt(
      membership,
      {
        ...receipt("synthetic-visitor-a"),
        requestId: "different-request"
      }
    );
    assert.equal(mismatchedRequest.status, "invalid_input");
    safe(mismatchedRequest);

    const mismatchedAssignee = await validationRepository.recordReceipt(
      membership,
      {
        ...receipt("synthetic-visitor-a"),
        assigneeId: "different-staff"
      }
    );
    assert.equal(mismatchedAssignee.status, "invalid_input");
    safe(mismatchedAssignee);

    const mismatchedKind = await validationRepository.recordReceipt(
      membership,
      {
        ...receipt("synthetic-visitor-a"),
        kind: "unassign"
      }
    );
    assert.equal(mismatchedKind.status, "invalid_input");
    safe(mismatchedKind);

    const accessorReceipt = {
      ...receipt("synthetic-visitor-a")
    };

    Object.defineProperty(accessorReceipt, "receiptId", {
      enumerable: true,
      get: () => "accessor-receipt"
    });

    const accessorResult = await validationRepository.recordReceipt(
      membership,
      accessorReceipt
    );
    assert.equal(accessorResult.status, "invalid_input");
    safe(accessorResult);

    assert.equal(
      unexpectedWrites,
      0,
      "Invalid evidence must never reach createEntity"
    );

    console.log("[PASS] Invalid evidence never reaches storage");

    // Two writers racing for the same row: one create at most.
    const competing = await Promise.all([
      repository.recordReceipt(
        membership,
        receipt("synthetic-visitor-b", "concurrent-one")
      ),
      repository.recordReceipt(
        membership,
        receipt("synthetic-visitor-b", "concurrent-two")
      )
    ]);

    assert.deepEqual(
      competing.map(value => value.status).sort(),
      ["conflict", "recorded_unverified"]
    );
    competing.forEach(safe);
    console.log("[PASS] Concurrent create collision is fail-closed");

    // Simulate acknowledgement loss after the durable write.
    const ambiguousRequest = {
      ...membership,
      requestId: `lost-ack-${randomUUID()}`,
      visitorIds: ["synthetic-lost-ack"]
    };

    const delegated = {
      createEntity: async (entity: unknown) => {
        await client.createEntity(entity as any);
        throw new Error("synthetic_lost_acknowledgement");
      }
    } as unknown as TableClient;

    const uncertainRepository =
      new CareBulkReceiptStorageRepository(delegated);

    const ambiguous = await uncertainRepository.recordReceipt(
      ambiguousRequest,
      {
        receiptId: "lost-ack-receipt",
        requestId: ambiguousRequest.requestId,
        visitorId: "synthetic-lost-ack",
        kind: "assign",
        assigneeId: ambiguousRequest.assigneeId,
        observation: "uncertain"
      }
    );

    assert.equal(ambiguous.status, "uncertain");
    safe(ambiguous);

    const persisted = await client.getEntity(
      ambiguousRequest.requestId,
      "synthetic-lost-ack"
    );
    assert.equal(persisted.receiptId, "lost-ack-receipt");
    console.log("[PASS] Lost acknowledgment never authorizes replay");

    // Readback scenarios are advisory and read-only.
    const readbackRequestId = `readback-${randomUUID()}`;
    const readbackMembership = {
      requestId: readbackRequestId,
      kind: "assign" as const,
      assigneeId: "synthetic-readback-staff",
      visitorIds: ["synthetic-readback-visitor"]
    };
    const expectedReadback = {
      receiptId: "synthetic-readback-receipt",
      requestId: readbackRequestId,
      visitorId: "synthetic-readback-visitor",
      kind: "assign" as const,
      assigneeId: "synthetic-readback-staff",
      observation: "observed"
    };

    const createdReadback = await repository.recordReceipt(
      readbackMembership,
      expectedReadback
    );
    assert.equal(createdReadback.status, "recorded_unverified");
    safe(createdReadback);

    const matching = await repository.compareStoredReceipt(
      readbackMembership,
      expectedReadback
    );
    assert.equal(matching.status, "matching_evidence");
    safe(matching);
    console.log("[PASS] Matching receipt is advisory only");

    const changedObservation = await repository.compareStoredReceipt(
      readbackMembership,
      { ...expectedReadback, observation: "failed" }
    );
    assert.equal(changedObservation.status, "conflict");
    safe(changedObservation);
    console.log("[PASS] Changed expected observation is conflict");

    const absentMembership = {
      ...readbackMembership,
      requestId: `absent-${randomUUID()}`
    };
    const absent = await repository.compareStoredReceipt(
      absentMembership,
      {
        ...expectedReadback,
        requestId: absentMembership.requestId
      }
    );
    assert.equal(absent.status, "uncertain");
    safe(absent);
    console.log("[PASS] Missing receipt remains uncertain");

    const badMembership = {
      ...readbackMembership,
      visitorIds: ["synthetic-different-visitor"]
    };
    const invalidReadback = await repository.compareStoredReceipt(
      badMembership,
      expectedReadback
    );
    assert.equal(invalidReadback.status, "invalid_input");
    safe(invalidReadback);
    console.log("[PASS] Invalid expected evidence rejected");

    const malformedRequestId = `malformed-${randomUUID()}`;
    await client.createEntity({
      partitionKey: malformedRequestId,
      rowKey: "synthetic-readback-visitor",
      requestId: malformedRequestId,
      visitorId: "synthetic-readback-visitor",
      receiptId: expectedReadback.receiptId,
      schemaVersion: 1,
      receiptJson: "{not-valid-json"
    });
    const malformedMembership = {
      ...readbackMembership,
      requestId: malformedRequestId
    };
    const malformed = await repository.compareStoredReceipt(
      malformedMembership,
      {
        ...expectedReadback,
        requestId: malformedRequestId
      }
    );
    assert.equal(malformed.status, "conflict");
    safe(malformed);
    console.log("[PASS] Malformed stored JSON is conflict");

    const mismatchedRequestId = `mismatch-${randomUUID()}`;
    const mismatchedExpected = {
      ...expectedReadback,
      requestId: mismatchedRequestId
    };
    await client.createEntity({
      partitionKey: mismatchedRequestId,
      rowKey: mismatchedExpected.visitorId,
      requestId: mismatchedRequestId,
      visitorId: mismatchedExpected.visitorId,
      receiptId: "unexpected-receipt-id",
      schemaVersion: 1,
      receiptJson: JSON.stringify(mismatchedExpected)
    });
    const mismatchedStored = await repository.compareStoredReceipt(
      {
        ...readbackMembership,
        requestId: mismatchedRequestId
      },
      mismatchedExpected
    );
    assert.equal(mismatchedStored.status, "conflict");
    safe(mismatchedStored);
    console.log("[PASS] Stored identity mismatch is conflict");

    let unexpectedReadbackWrites = 0;
    const readOnlyClient = {
      getEntity: async () => {
        throw new Error("synthetic_read_failure");
      },
      createEntity: async () => {
        unexpectedReadbackWrites++;
        throw new Error("readback_must_never_write");
      }
    } as unknown as TableClient;
    const readOnlyRepository =
      new CareBulkReceiptStorageRepository(readOnlyClient);

    const unreadable = await readOnlyRepository.compareStoredReceipt(
      readbackMembership,
      expectedReadback
    );
    assert.equal(unreadable.status, "uncertain");
    safe(unreadable);
    assert.equal(unexpectedReadbackWrites, 0);
    console.log("[PASS] Read failure is uncertain with zero writes");

    console.log("[PASS] All readback scenarios are advisory and read-only");

    console.log("[PASS] All create-only receipt storage proofs passed");
  } finally {
    if (created) {
      await client.deleteTable();
    }
  }
}

main().catch(error => {
  console.error("[FAIL] Isolated Azurite receipt proof", error);
  process.exitCode = 1;
});
