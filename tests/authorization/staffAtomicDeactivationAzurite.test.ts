import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { TableClient } from "@azure/data-tables";

import {
  submitStaffAtomicDeactivationPrototype
} from "../../src/repositories/staffAtomicDeactivationPrototype";

import {
  STAFF_SECURITY_PROTOTYPE_PARTITION,
  STAFF_SECURITY_HEAD_ROW
} from "../../src/repositories/oauthStaffSecurityStorageRepository";

if (
  process.env.STORAGE_CONNECTION_STRING !==
  "UseDevelopmentStorage=true" ||
  process.env.HOPE_OAUTH_AZURITE_TABLE_PORT !== "11002"
) {
  throw new Error("Isolated Azurite configuration required");
}

const connectionString = [
  "DefaultEndpointsProtocol=http",
  "AccountName=devstoreaccount1",
  "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==",
  "TableEndpoint=http://127.0.0.1:11002/devstoreaccount1"
].join(";");

type Stored = {
  partitionKey: string;
  rowKey: string;
  revision?: number;
  state?: string;
  eventId?: string;
};

function staffEvent(id: string) {
  return {
    eventId: id,
    staffId: "synthetic-staff-a",
    actorId: "synthetic-admin",
    type: "staff.deactivated" as const,
    occurredAt: "2026-11-09T12:00:00.000Z",
    data: {
      status: "inactive" as const,
      reason: "Synthetic concurrency proof"
    }
  };
}

async function scenario(
  name: string,
  test: (table: TableClient) => Promise<void>
): Promise<void> {
  const tableName =
    "StaffAtomicIT" + randomBytes(8).toString("hex");

  const table = TableClient.fromConnectionString(
    connectionString,
    tableName,
    { allowInsecureConnection: true }
  );

  await table.createTable();

  try {
    await table.createEntity({
      partitionKey: STAFF_SECURITY_PROTOTYPE_PARTITION,
      rowKey: STAFF_SECURITY_HEAD_ROW,
      revision: 0,
      state: "active"
    });

    await test(table);
    console.log("[PASS] " + name);
  } finally {
    await table.deleteTable();
  }
}

function port(table: TableClient) {
  return {
    getEntity: (partitionKey: string, rowKey: string) =>
      table.getEntity(partitionKey, rowKey),

    submitTransaction: (
      actions: Parameters<TableClient["submitTransaction"]>[0]
    ) => table.submitTransaction(actions)
  };
}

async function rows(table: TableClient): Promise<Stored[]> {
  const result: Stored[] = [];

  for await (const row of table.listEntities<Stored>()) {
    result.push(row);
  }

  return result;
}

async function main(): Promise<void> {
  await scenario("Disabled prototype makes no writes", async table => {
    const decision = await submitStaffAtomicDeactivationPrototype(
      staffEvent("disabled-attempt"),
      port(table)
    );

    assert.equal(decision.outcome, "denied");
    assert.equal(decision.executionPermitted, false);

    const stored = await rows(table);
    assert.equal(stored.length, 1);
    assert.equal(stored[0].revision, 0);
  });

  await scenario("Concurrent deactivation has one winner", async table => {
    const candidates = Array.from(
      { length: 20 },
      (_, index) => staffEvent(`concurrent-${index}`)
    );

    const decisions = await Promise.all(
      candidates.map(candidate =>
        submitStaffAtomicDeactivationPrototype(
          candidate,
          port(table),
          true
        )
      )
    );

    const committed = decisions.filter(
      decision => decision.outcome === "committed"
    );

    assert.equal(committed.length, 1);
    assert.ok(decisions.every(
      decision =>
        decision.executionPermitted === false &&
        decision.retryPermitted === false &&
        decision.productionWriterFenced === false
    ));

    const stored = await rows(table);

    assert.equal(stored.length, 3);

    const head = await table.getEntity<Stored>(
      STAFF_SECURITY_PROTOTYPE_PARTITION,
      STAFF_SECURITY_HEAD_ROW
    );

    assert.equal(head.revision, 1);
    assert.equal(head.state, "revoked");

    const events = stored.filter(
      row => row.rowKey.startsWith("event-")
    );

    const receipts = stored.filter(
      row => row.rowKey.startsWith("operation-")
    );

    assert.equal(events.length, 1);
    assert.equal(receipts.length, 1);

    assert.equal(events[0].eventId, receipts[0].eventId);
  });

  await scenario("Conflicting receipt rolls back all actions", async table => {
    const attempt = staffEvent("duplicate-receipt");

    await table.createEntity({
      partitionKey: STAFF_SECURITY_PROTOTYPE_PARTITION,
      rowKey: "operation-duplicate-receipt",
      eventId: "existing-operation"
    });

    const decision = await submitStaffAtomicDeactivationPrototype(
      attempt,
      port(table),
      true
    );

    assert.equal(decision.outcome, "denied");
    assert.equal(decision.retryPermitted, false);

    const head = await table.getEntity<Stored>(
      STAFF_SECURITY_PROTOTYPE_PARTITION,
      STAFF_SECURITY_HEAD_ROW
    );

    assert.equal(head.revision, 0);
    assert.equal(head.state, "active");

    const stored = await rows(table);

    assert.equal(stored.length, 2);
    assert.equal(
      stored.some(row => row.rowKey.startsWith("event-")),
      false
    );
  });

  await scenario("Lost acknowledgement remains uncertain", async table => {
    const underlying = port(table);

    const lostAckPort = {
      getEntity: underlying.getEntity,
      async submitTransaction(
        actions: Parameters<TableClient["submitTransaction"]>[0]
      ) {
        await underlying.submitTransaction(actions);

        throw new Error("synthetic_lost_acknowledgement");
      }
    };

    const decision = await submitStaffAtomicDeactivationPrototype(
      staffEvent("lost-acknowledgement"),
      lostAckPort,
      true
    );

    assert.equal(decision.outcome, "uncertain");
    assert.equal(decision.executionPermitted, false);
    assert.equal(decision.retryPermitted, false);

    const stored = await rows(table);
    assert.equal(stored.length, 3);

    const head = await table.getEntity<Stored>(
      STAFF_SECURITY_PROTOTYPE_PARTITION,
      STAFF_SECURITY_HEAD_ROW
    );

    assert.equal(head.revision, 1);
    assert.equal(head.state, "revoked");
  });

  console.log(
    "[PASS] All isolated Staff atomicity scenarios"
  );
  console.log(
    "[SAFE] No production writer or OAuth execution"
  );
}

main().catch(() => {
  console.error(
    "[FAIL] Isolated Staff atomicity proof failed"
  );
  process.exitCode = 1;
});