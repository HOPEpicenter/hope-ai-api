import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  TableClient,
  type TransactionAction
} from "@azure/data-tables";

import {
  submitStaffScopedAtomicDeactivation
} from "../../src/repositories/staffScopedAtomicDeactivation";

import {
  StaffEventsRepository,
  STAFF_SECURITY_METADATA_HEAD,
  STAFF_SECURITY_METADATA_RECEIPT_PREFIX
} from "../../src/repositories/staffEventsRepository";

if (
  process.env.STORAGE_CONNECTION_STRING !==
    "UseDevelopmentStorage=true" ||
  process.env.HOPE_OAUTH_AZURITE_TABLE_PORT !== "11002"
) {
  throw new Error("Dedicated local Azurite required");
}

const connectionString = [
  "DefaultEndpointsProtocol=http",
  "AccountName=devstoreaccount1",
  "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==",
  "TableEndpoint=http://127.0.0.1:11002/devstoreaccount1"
].join(";");

function event(id: string, staffId = "synthetic-staff-a") {
  return {
    eventId: id,
    staffId,
    type: "staff.deactivated" as const,
    occurredAt: "2026-11-09T12:00:00.000Z",
    actorId: "synthetic-admin",
    data: { status: "inactive" as const }
  };
}

function port(table: TableClient) {
  return {
    getEntity: (partitionKey: string, rowKey: string) =>
      table.getEntity(partitionKey, rowKey),
    submitTransaction: (actions: TransactionAction[]) =>
      table.submitTransaction(actions)
  };
}

async function seedHead(
  table: TableClient,
  staffId: string
): Promise<void> {
  await table.createEntity({
    partitionKey: staffId,
    rowKey: STAFF_SECURITY_METADATA_HEAD,
    revision: 0,
    authorizationRevision: 0,
    state: "active"
  });
}

async function rows(table: TableClient) {
  const output: Array<{
    partitionKey: string;
    rowKey: string;
    eventId?: string;
  }> = [];

  for await (const row of table.listEntities<{
    eventId?: string;
  }>()) {
    if (
      typeof row.partitionKey !== "string" ||
      typeof row.rowKey !== "string"
    ) {
      throw new Error("Azurite returned a row without storage keys");
    }

    output.push({
      partitionKey: row.partitionKey,
      rowKey: row.rowKey,
      eventId: row.eventId
    });
  }
  return output;
}

async function scenario(
  description: string,
  test: (table: TableClient) => Promise<void>
): Promise<void> {
  const table = TableClient.fromConnectionString(
    connectionString,
    "StaffScopedIT" + randomBytes(8).toString("hex"),
    { allowInsecureConnection: true }
  );

  await table.createTable();
  try {
    await test(table);
    console.log("[PASS] " + description);
  } finally {
    await table.deleteTable();
  }
}

async function main(): Promise<void> {
  await scenario("Disabled path has no storage writes", async table => {
    await seedHead(table, "synthetic-staff-a");

    const result = await submitStaffScopedAtomicDeactivation(
      event("disabled"),
      port(table)
    );

    assert.equal(result.status, "denied");
    assert.equal(result.executionPermitted, false);
    assert.equal((await rows(table)).length, 1);
  });

  await scenario("Concurrent writers have one winner", async table => {
    await seedHead(table, "synthetic-staff-a");

    const candidates = Array.from(
      { length: 20 },
      (_, index) => event(`race-${index}`)
    );

    const results = await Promise.all(
      candidates.map(candidate =>
        submitStaffScopedAtomicDeactivation(
          candidate,
          port(table),
          true
        )
      )
    );

    assert.equal(
      results.filter(result => result.status === "committed").length,
      1
    );

    assert.ok(results.every(result =>
      result.executionPermitted === false &&
      result.retryPermitted === false &&
      result.productionWriterFenced === false
    ));

    const stored = await rows(table);
    assert.equal(stored.length, 3);

    const head = await table.getEntity<{
      revision: number;
      state: string;
    }>(
      "synthetic-staff-a",
      STAFF_SECURITY_METADATA_HEAD
    );

    assert.equal(head.revision, 1);
    assert.equal(head.state, "revoked");

    const receipt = stored.filter(row =>
      row.rowKey.startsWith(STAFF_SECURITY_METADATA_RECEIPT_PREFIX)
    );
    assert.equal(receipt.length, 1);

    const events = await new StaffEventsRepository(table).listAll();

    assert.equal(events.length, 1);
    assert.equal(events[0].staffId, "synthetic-staff-a");
    assert.equal(events[0].type, "staff.deactivated");
    assert.equal(events[0].eventId, receipt[0].eventId);

    console.log("[PASS] Canonical reader sees exactly one event");
  });

  await scenario("Receipt collision rolls back all actions", async table => {
    await seedHead(table, "synthetic-staff-a");

    await table.createEntity({
      partitionKey: "synthetic-staff-a",
      rowKey: STAFF_SECURITY_METADATA_RECEIPT_PREFIX + "duplicate",
      eventId: "existing-receipt"
    });

    const decision = await submitStaffScopedAtomicDeactivation(
      event("duplicate"),
      port(table),
      true
    );

    assert.equal(decision.status, "denied");
    assert.equal(decision.retryPermitted, false);

    const head = await table.getEntity<{
      revision: number;
      state: string;
    }>(
      "synthetic-staff-a",
      STAFF_SECURITY_METADATA_HEAD
    );

    assert.equal(head.revision, 0);
    assert.equal(head.state, "active");
    assert.equal((await rows(table)).length, 2);
    assert.equal(
      (await new StaffEventsRepository(table).listAll()).length,
      0
    );
  });

  await scenario("Lost acknowledgement is uncertain", async table => {
    await seedHead(table, "synthetic-staff-a");

    const original = port(table);
    const lostAckPort = {
      getEntity: original.getEntity,
      async submitTransaction(actions: TransactionAction[]) {
        await original.submitTransaction(actions);
        throw new Error("synthetic acknowledgement lost");
      }
    };

    const decision = await submitStaffScopedAtomicDeactivation(
      event("lost-ack"),
      lostAckPort,
      true
    );

    assert.equal(decision.status, "uncertain");
    assert.equal(decision.executionPermitted, false);
    assert.equal(decision.retryPermitted, false);
    assert.equal((await rows(table)).length, 3);

    const events = await new StaffEventsRepository(table).listAll();
    assert.equal(events.length, 1);
    assert.equal(events[0].eventId, "lost-ack");
  });

  await scenario("Separate staff partitions are independent", async table => {
    await seedHead(table, "synthetic-staff-a");
    await seedHead(table, "synthetic-staff-b");

    const [first, second] = await Promise.all([
      submitStaffScopedAtomicDeactivation(
        event("event-a", "synthetic-staff-a"),
        port(table),
        true
      ),
      submitStaffScopedAtomicDeactivation(
        event("event-b", "synthetic-staff-b"),
        port(table),
        true
      )
    ]);

    assert.equal(first.status, "committed");
    assert.equal(second.status, "committed");

    const events = await new StaffEventsRepository(table).listAll();
    assert.equal(events.length, 2);

    // This proves per-staff atomicity only. It is not a
    // global credential/session execution fence.
    assert.equal(first.productionWriterFenced, false);
    assert.equal(second.productionWriterFenced, false);
  });

  console.log("[PASS] All Staff-scoped storage scenarios");
  console.log("[SAFE] No OAuth execution or production writer migration");
}

main().catch(() => {
  console.error("[FAIL] Staff-scoped Azurite regression");
  process.exitCode = 1;
});