import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  TableClient,
  type TransactionAction
} from "@azure/data-tables";

import {
  submitStaffScopedAtomicMutation
} from "../../src/repositories/staffScopedAtomicMutation";

import {
  submitStaffScopedAtomicDeactivation,
  type StaffScopedAtomicPort
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

const staffId = "synthetic-staff-concurrency";

function mutation(id: string) {
  return {
    eventId: id,
    staffId,
    type: "staff.updated" as const,
    occurredAt: "2026-11-09T12:00:00.000Z",
    actorId: "synthetic-admin",
    data: { displayName: "Updated Synthetic Staff" }
  };
}

function deactivation(id: string) {
  return {
    eventId: id,
    staffId,
    type: "staff.deactivated" as const,
    occurredAt: "2026-11-09T12:01:00.000Z",
    actorId: "synthetic-admin",
    data: { status: "inactive" as const }
  };
}

function port(table: TableClient): StaffScopedAtomicPort {
  return {
    getEntity: (partitionKey, rowKey) =>
      table.getEntity(partitionKey, rowKey),
    submitTransaction: (actions: TransactionAction[]) =>
      table.submitTransaction(actions)
  };
}

async function seed(table: TableClient): Promise<void> {
  await table.createEntity({
    partitionKey: staffId,
    rowKey: STAFF_SECURITY_METADATA_HEAD,
    revision: 0,
    state: "active"
  });
}

async function head(table: TableClient) {
  return table.getEntity<{ revision: number; state: string }>(
    staffId,
    STAFF_SECURITY_METADATA_HEAD
  );
}

async function countRows(table: TableClient): Promise<number> {
  let count = 0;
  for await (const _ of table.listEntities()) count++;
  return count;
}

async function assertCanonical(
  table: TableClient,
  expected: string[]
): Promise<void> {
  const events = await new StaffEventsRepository(table).listAll();
  assert.deepEqual(
    events.map(item => item.eventId).sort(),
    [...expected].sort()
  );
}

async function scenario(
  label: string,
  test: (table: TableClient) => Promise<void>
): Promise<void> {
  const table = TableClient.fromConnectionString(
    connectionString,
    "StaffMutIT" + randomBytes(8).toString("hex"),
    { allowInsecureConnection: true }
  );

  await table.createTable();
  try {
    await test(table);
    console.log("[PASS] " + label);
  } finally {
    await table.deleteTable();
  }
}

async function main(): Promise<void> {
  await scenario("Mutation then deactivation advances shared head",
    async table => {
      await seed(table);

      const first = await submitStaffScopedAtomicMutation(
        mutation("update-first"), port(table), true
      );

      assert.equal(first.status, "committed");
      assert.equal((await head(table)).revision, 1);

      const second = await submitStaffScopedAtomicDeactivation(
        deactivation("revoke-second"), port(table), true
      );

      assert.equal(second.status, "committed");

      const final = await head(table);
      assert.equal(final.revision, 2);
      assert.equal(final.state, "revoked");

      await assertCanonical(
        table, ["update-first", "revoke-second"]
      );

      assert.equal(await countRows(table), 5);
    }
  );

  await scenario("Deactivation permanently blocks later mutation",
    async table => {
      await seed(table);

      const first = await submitStaffScopedAtomicDeactivation(
        deactivation("revoke-first"), port(table), true
      );

      assert.equal(first.status, "committed");

      const second = await submitStaffScopedAtomicMutation(
        mutation("update-after-revoke"), port(table), true
      );

      assert.equal(second.status, "denied");

      const final = await head(table);
      assert.equal(final.revision, 1);
      assert.equal(final.state, "revoked");

      await assertCanonical(table, ["revoke-first"]);
      assert.equal(await countRows(table), 3);
    }
  );

  await scenario("Same-revision mutation/deactivation has one winner",
    async table => {
      await seed(table);

      // Both operations must read the SAME head revision
      // before either is permitted to submit a batch.
      let reads = 0;
      let release!: () => void;
      const barrier = new Promise<void>(resolve => {
        release = resolve;
      });

      const original = port(table);

      const competingPort: StaffScopedAtomicPort = {
        async getEntity(partitionKey, rowKey) {
          const snapshot = await original.getEntity(
            partitionKey, rowKey
          );

          reads++;

          if (reads === 2) release();

          await barrier;
          return snapshot;
        },

        submitTransaction: actions =>
          original.submitTransaction(actions)
      };

      const [updateResult, revokeResult] = await Promise.all([
        submitStaffScopedAtomicMutation(
          mutation("race-update"), competingPort, true
        ),
        submitStaffScopedAtomicDeactivation(
          deactivation("race-revoke"), competingPort, true
        )
      ]);

      assert.equal(reads, 2);

      const committed = [updateResult, revokeResult]
        .filter(item => item.status === "committed");

      assert.equal(committed.length, 1);

      assert.ok([updateResult, revokeResult].every(item =>
        item.executionPermitted === false &&
        item.retryPermitted === false &&
        item.productionWriterFenced === false
      ));

      const final = await head(table);
      assert.equal(final.revision, 1);

      const events = await new StaffEventsRepository(table)
        .listAll();

      assert.equal(events.length, 1);
      assert.equal(await countRows(table), 3);

      if (revokeResult.status === "committed") {
        assert.equal(final.state, "revoked");
        assert.equal(events[0].eventId, "race-revoke");
      } else {
        assert.equal(updateResult.status, "committed");
        assert.equal(final.state, "active");
        assert.equal(events[0].eventId, "race-update");

        const laterRevoke = await
          submitStaffScopedAtomicDeactivation(
            deactivation("race-later-revoke"),
            port(table),
            true
          );

        assert.equal(laterRevoke.status, "committed");
        assert.equal((await head(table)).state, "revoked");
      }
    }
  );

  await scenario("Mutation receipt collision rolls back head and event",
    async table => {
      await seed(table);

      await table.createEntity({
        partitionKey: staffId,
        rowKey:
          STAFF_SECURITY_METADATA_RECEIPT_PREFIX + "collision",
        eventId: "existing-operation"
      });

      const result = await submitStaffScopedAtomicMutation(
        mutation("collision"), port(table), true
      );

      assert.equal(result.status, "denied");
      assert.equal((await head(table)).revision, 0);
      assert.equal((await head(table)).state, "active");

      await assertCanonical(table, []);
      assert.equal(await countRows(table), 2);
    }
  );

  await scenario("Mutation lost acknowledgment remains uncertain",
    async table => {
      await seed(table);
      const underlying = port(table);

      const lostAckPort: StaffScopedAtomicPort = {
        getEntity: underlying.getEntity,
        async submitTransaction(actions) {
          await underlying.submitTransaction(actions);
          throw new Error("synthetic acknowledgement lost");
        }
      };

      const result = await submitStaffScopedAtomicMutation(
        mutation("lost-ack"), lostAckPort, true
      );

      assert.equal(result.status, "uncertain");
      assert.equal(result.executionPermitted, false);
      assert.equal(result.retryPermitted, false);
      assert.equal((await head(table)).revision, 1);

      await assertCanonical(table, ["lost-ack"]);
      assert.equal(await countRows(table), 3);
    }
  );

  console.log("[PASS] Shared Staff-head Azurite concurrency proof");
  console.log("[SAFE] Not a production OAuth execution fence");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});