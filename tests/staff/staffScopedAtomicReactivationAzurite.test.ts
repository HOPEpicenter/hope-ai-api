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
  submitStaffScopedAtomicReactivation,
  type StaffReactivationAuthorizationPort
} from "../../src/repositories/staffScopedAtomicReactivation";
import {
  StaffEventsRepository,
  STAFF_SECURITY_METADATA_HEAD
} from "../../src/repositories/staffEventsRepository";
import type {
  StaffScopedAtomicPort
} from "../../src/repositories/staffScopedAtomicDeactivation";

if (
  process.env.STORAGE_CONNECTION_STRING !== "UseDevelopmentStorage=true" ||
  process.env.HOPE_OAUTH_AZURITE_TABLE_PORT !== "11002"
) {
  throw new Error("Dedicated local Azurite Table configuration required");
}

const connectionString = [
  "DefaultEndpointsProtocol=http",
  "AccountName=devstoreaccount1",
  "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==",
  "TableEndpoint=http://127.0.0.1:11002/devstoreaccount1"
].join(";");

const staffId = "synthetic-reactivation-azurite";
const headRow = STAFF_SECURITY_METADATA_HEAD;

function activation(eventId: string) {
  return {
    eventId,
    staffId,
    type: "staff.activated" as const,
    occurredAt: "2026-11-09T12:00:00.000Z",
    actorId: "synthetic-admin",
    data: { status: "active" as const }
  };
}

function authorizationPort(): StaffReactivationAuthorizationPort {
  return {
    async authorizeReactivation(input) {
      return {
        authorized: true,
        staffId: input.staffId,
        eventId: input.eventId,
        actorId: input.actorId,
        authorizationRevision: input.authorizationRevision
      };
    }
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

async function seed(
  table: TableClient,
  state: "pending" | "revoked",
  revision = 3
): Promise<void> {
  await table.createEntity({
    partitionKey: staffId,
    rowKey: headRow,
    revision,
    authorizationRevision: revision,
    state
  });
}

async function head(table: TableClient) {
  return table.getEntity<{
    revision: number;
    authorizationRevision: number;
    state: string;
  }>(staffId, headRow);
}

async function scenario(
  label: string,
  test: (table: TableClient) => Promise<void>
): Promise<void> {
  const table = TableClient.fromConnectionString(
    connectionString,
    "StaffReactIT" + randomBytes(8).toString("hex"),
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
  await scenario("Pending heads activate only through the activation transition",
    async table => {
      await seed(table, "pending");
      const result = await submitStaffScopedAtomicMutation(
        activation("synthetic-pending-activation"),
        port(table),
        true
      );
      assert.equal(result.status, "committed");
      const finalHead = await head(table);
      assert.equal(finalHead.state, "active");
      assert.equal(finalHead.revision, 4);
      assert.equal(finalHead.authorizationRevision, 4);
      const events = await new StaffEventsRepository(table).listAll();
      assert.equal(events.length, 1);
      assert.equal(events[0].type, "staff.activated");

      const replay = await submitStaffScopedAtomicReactivation(
        activation("synthetic-reactivation"),
        port(table),
        authorizationPort(),
        true
      );
      assert.equal(replay.status, "denied");
      assert.equal(replay.executionPermitted, false);
      assert.equal((await head(table)).revision, 4);
      assert.equal((await new StaffEventsRepository(table).listAll()).length, 1);
    }
  );

  await scenario("Revoked heads reactivate with authorization and one transaction",
    async table => {
      await seed(table, "revoked");
      const result = await submitStaffScopedAtomicReactivation(
        activation("synthetic-reactivation"),
        port(table),
        authorizationPort(),
        true
      );
      assert.equal(result.status, "committed");
      assert.equal(result.executionPermitted, false);
      const finalHead = await head(table);
      assert.equal(finalHead.state, "active");
      assert.equal(finalHead.revision, 4);
      assert.equal(finalHead.authorizationRevision, 4);
      const events = await new StaffEventsRepository(table).listAll();
      assert.equal(events.length, 1);
      assert.equal(events[0].type, "staff.activated");
    }
  );

  await scenario("Two reactivations cannot commit against one head ETag",
    async table => {
      await seed(table, "revoked");
      let reads = 0;
      let release!: () => void;
      const barrier = new Promise<void>(resolve => { release = resolve; });
      const base = port(table);

      const competingPort: StaffScopedAtomicPort = {
        async getEntity(partitionKey, rowKey) {
          const value = await base.getEntity(partitionKey, rowKey);
          reads++;
          if (reads === 2) release();
          await barrier;
          return value;
        },
        submitTransaction: actions => base.submitTransaction(actions)
      };

      const [first, second] = await Promise.all([
        submitStaffScopedAtomicReactivation(
          activation("synthetic-reactivation-first"),
          competingPort,
          authorizationPort(),
          true
        ),
        submitStaffScopedAtomicReactivation(
          activation("synthetic-reactivation-second"),
          competingPort,
          authorizationPort(),
          true
        )
      ]);

      assert.equal(reads, 2);
      assert.equal(
        [first, second].filter(value => value.status === "committed").length,
        1
      );
      const events = await new StaffEventsRepository(table).listAll();
      assert.equal(events.length, 1);
      assert.equal((await head(table)).revision, 4);
    }
  );

  await scenario("Authorization denial does not mutate revoked head",
    async table => {
      await seed(table, "revoked");
      const deniedAuthorization: StaffReactivationAuthorizationPort = {
        async authorizeReactivation() { return null; }
      };
      const result = await submitStaffScopedAtomicReactivation(
        activation("synthetic-denied-reactivation"),
        port(table),
        deniedAuthorization,
        true
      );
      assert.equal(result.status, "denied");
      assert.equal((await head(table)).state, "revoked");
      assert.equal((await new StaffEventsRepository(table).listAll()).length, 0);
    }
  );

  await scenario("Lost acknowledgement remains uncertain after commit",
    async table => {
      await seed(table, "revoked");
      const underlying = port(table);
      const lostAckPort: StaffScopedAtomicPort = {
        getEntity: underlying.getEntity,
        async submitTransaction(actions) {
          await underlying.submitTransaction(actions);
          throw new Error("synthetic acknowledgement lost");
        }
      };
      const result = await submitStaffScopedAtomicReactivation(
        activation("synthetic-lost-ack-reactivation"),
        lostAckPort,
        authorizationPort(),
        true
      );
      assert.equal(result.status, "uncertain");
      assert.equal(result.executionPermitted, false);
      assert.equal(result.retryPermitted, false);
      assert.equal((await head(table)).state, "active");
      assert.equal((await new StaffEventsRepository(table).listAll()).length, 1);
    }
  );
}

main().catch(() => {
  console.error("[FAIL] Staff reactivation Azurite regression");
  process.exitCode = 1;
});
