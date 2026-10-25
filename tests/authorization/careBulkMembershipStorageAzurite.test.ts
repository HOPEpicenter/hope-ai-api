import assert from "node:assert/strict";
import { TableClient } from "@azure/data-tables";
import {
  CARE_BULK_MEMBERSHIP_PARTITION,
  CareBulkMembershipStorageRepository
} from "../../src/repositories/careBulkMembershipStorageRepository";

/**
 * Isolated synthetic Azurite-only evidence tests.
 * Never connect this test to real Azure storage.
 */
if (process.env.STORAGE_CONNECTION_STRING !== "UseDevelopmentStorage=true") {
  throw new Error("Azurite-only storage required");
}

const port = process.env.HOPE_ASSIGNMENT_AZURITE_TABLE_PORT ?? "10002";

if (port !== "10002" && port !== "11002") {
  throw new Error("Unapproved local Azurite Table port");
}

const connectionString = port === "10002"
  ? "UseDevelopmentStorage=true"
  : [
      "DefaultEndpointsProtocol=http",
      "AccountName=devstoreaccount1",
      "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==",
      "TableEndpoint=http://127.0.0.1:11002/devstoreaccount1"
    ].join(";");



const name = `carebulk${Date.now().toString(36)}`;
const table = TableClient.fromConnectionString(
  connectionString,
  name,
  { allowInsecureConnection: true }
);

const repository = new CareBulkMembershipStorageRepository(table);

function intent(
  requestId: string,
  visitorIds: string[] = ["visitor-a", "visitor-b"]
) {
  return {
    requestId,
    kind: "assign",
    assigneeId: "staff-a",
    visitorIds
  };
}

function safe(result: {
  durableMembershipVerified: boolean;
  authorizationPermitted: boolean;
  executionPermitted: boolean;
  retryPermitted: boolean;
  automaticRecoveryPermitted: boolean;
  productionRolloutPermitted: boolean;
}): void {
  assert.equal(result.durableMembershipVerified, false);
  assert.equal(result.authorizationPermitted, false);
  assert.equal(result.executionPermitted, false);
  assert.equal(result.retryPermitted, false);
  assert.equal(result.automaticRecoveryPermitted, false);
  assert.equal(result.productionRolloutPermitted, false);
}

async function run(): Promise<void> {
  await table.createTable();

  try {
    const original = intent("first-request");

    const committed = await repository.recordIntent(original);
    assert.equal(committed.status, "committed");
    safe(committed);

    const stored = await table.getEntity(
      CARE_BULK_MEMBERSHIP_PARTITION,
      "first-request"
    );

    assert.equal(stored.requestId, "first-request");
    assert.deepEqual(
      JSON.parse(stored.membershipJson as string).visitorIds,
      ["visitor-a", "visitor-b"]
    );

    const observed = await repository.inspectIntent("first-request");
    assert.equal(observed.status, "already_present");
    safe(observed);

    const duplicate = await repository.recordIntent(original);
    assert.equal(duplicate.status, "conflict");
    safe(duplicate);

    const conflicting = await repository.recordIntent(
      intent("first-request", ["visitor-c"])
    );
    assert.equal(conflicting.status, "conflict");
    safe(conflicting);

    const afterCollision = await table.getEntity(
      CARE_BULK_MEMBERSHIP_PARTITION,
      "first-request"
    );
    assert.equal(
      afterCollision.membershipJson,
      stored.membershipJson
    );

    console.log("[PASS] Committed membership is create-only");

    const competing = await Promise.all([
      repository.recordIntent(intent("concurrent-request", ["visitor-a"])),
      repository.recordIntent(intent("concurrent-request", ["visitor-b"]))
    ]);

    assert.deepEqual(
      competing.map(entry => entry.status).sort(),
      ["committed", "conflict"]
    );
    competing.forEach(safe);

    const concurrentStored = await table.getEntity(
      CARE_BULK_MEMBERSHIP_PARTITION,
      "concurrent-request"
    );

    const winner = JSON.parse(
      concurrentStored.membershipJson as string
    ).visitorIds;

    assert.ok(
      JSON.stringify(winner) === JSON.stringify(["visitor-a"]) ||
      JSON.stringify(winner) === JSON.stringify(["visitor-b"])
    );

    console.log("[PASS] Concurrent same-ID creates admit one winner");

    const oversized = await repository.recordIntent(
      intent(
        "oversized-request",
        Array.from(
          { length: 1000 },
          (_, i) => `visitor-${String(i).padStart(5, "0")}-${"x".repeat(90)}`
        )
      )
    );

    assert.equal(oversized.status, "oversized");
    safe(oversized);

    const absent = await repository.inspectIntent("oversized-request");
    assert.equal(absent.status, "uncertain");
    safe(absent);

    console.log("[PASS] Oversized records rejected");

    const invalid = await repository.recordIntent(
      intent("invalid/request")
    );
    assert.equal(invalid.status, "invalid_input");
    safe(invalid);

    // Simulated acknowledgment loss occurs AFTER the actual table create.
    const lostAckClient = {
      createEntity: async (entity: unknown) => {
        await table.createEntity(entity as any);
        throw new Error("synthetic_lost_acknowledgement");
      }
    } as unknown as TableClient;

    const lostAckRepo = new CareBulkMembershipStorageRepository(
      lostAckClient
    );

    const ambiguous = await lostAckRepo.recordIntent(
      intent("lost-ack-request")
    );
    assert.equal(ambiguous.status, "uncertain");
    safe(ambiguous);

    const evidence = await repository.inspectIntent("lost-ack-request");
    assert.equal(evidence.status, "already_present");
    safe(evidence);

    console.log("[PASS] Lost acknowledgment remains non-authorizing");

    await table.createEntity({
      partitionKey: CARE_BULK_MEMBERSHIP_PARTITION,
      rowKey: "malformed-request",
      requestId: "malformed-request",
      schemaVersion: 1,
      membershipJson: '{"requestId":"wrong-request"}'
    });

    const malformed = await repository.inspectIntent("malformed-request");
    assert.equal(malformed.status, "conflict");
    safe(malformed);

    console.log("[PASS] Malformed evidence rejected");
    console.log("[PASS] All Bulk Care membership storage proofs passed");
  } finally {
    await table.deleteTable();
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
