import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  TableClient,
  type TransactionAction
} from "@azure/data-tables";
import {
  coordinateStaffLifecycleEvent
} from "../../src/services/staff/coordinateStaffLifecycleEvent";
import type {
  StaffScopedAtomicPort
} from "../../src/repositories/staffScopedAtomicDeactivation";
import type {
  StaffReactivationAuthorizationPort
} from "../../src/repositories/staffScopedAtomicReactivation";
import {
  StaffEventsRepository,
  STAFF_SECURITY_METADATA_HEAD,
  STAFF_SECURITY_METADATA_RECEIPT_PREFIX
} from "../../src/repositories/staffEventsRepository";

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

const staffId = "synthetic-lifecycle-coordinator";
const occurredAt = "2026-11-09T12:00:00.000Z";

function event(
  type: string = "staff.updated",
  data: Record<string, unknown> = { displayName: "Coordinator Update" },
  eventId = "coordinator-event"
) {
  return {
    eventId,
    staffId,
    type,
    occurredAt,
    actorId: "synthetic-admin",
    data
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
  state: "active" | "pending" | "revoked" = "active"
): Promise<void> {
  await table.createEntity({
    partitionKey: staffId,
    rowKey: STAFF_SECURITY_METADATA_HEAD,
    revision: 0,
    authorizationRevision: 0,
    state
  });
}

async function readHead(table: TableClient) {
  return table.getEntity<{
    revision: number;
    authorizationRevision: number;
    state: string;
  }>(staffId, STAFF_SECURITY_METADATA_HEAD);
}

async function events(table: TableClient) {
  return new StaffEventsRepository(table).listAll();
}

async function scenario(
  name: string,
  test: (table: TableClient) => Promise<void>
): Promise<void> {
  const table = TableClient.fromConnectionString(
    connectionString,
    "StaffLifeCoord" + randomBytes(8).toString("hex"),
    { allowInsecureConnection: true }
  );
  await table.createTable();
  try {
    await test(table);
    console.log("[PASS] " + name);
  } finally {
    await table.deleteTable();
  }
}

function trustedReactivationPort(): StaffReactivationAuthorizationPort {
  return {
    async authorizeReactivation(input) {
      return { authorized: true, ...input };
    }
  };
}

async function main(): Promise<void> {
  await scenario("Default-disabled and unsupported binding stay write-free",
    async table => {
      await seed(table);
      const storage = port(table);

      const disabled = await coordinateStaffLifecycleEvent(
        event(), { storage }
      );
      assert.equal(disabled.status, "denied");
      assert.equal(disabled.legacyFallbackPermitted, false);

      const bindingChange = await coordinateStaffLifecycleEvent(
        event("staff.updated", {
          entraTenantId: "11111111-1111-4111-8111-111111111111",
          entraObjectId: "22222222-2222-4222-8222-222222222222"
        }),
        { storage },
        { enabled: true }
      );
      assert.equal(bindingChange.status, "denied");
      assert.equal((await readHead(table)).revision, 0);
      assert.equal((await events(table)).length, 0);
    }
  );

  await scenario("Supported profile update routes atomically and replay is denied",
    async table => {
      await seed(table);
      const input = event(
        "staff.updated",
        { displayName: "Coordinator Update" },
        "coordinator-replay"
      );
      const storage = port(table);

      const first = await coordinateStaffLifecycleEvent(
        input, { storage }, { enabled: true }
      );
      assert.equal(first.status, "committed");
      assert.equal(first.operation, "profile_update");
      assert.equal(first.legacyFallbackPermitted, false);
      assert.equal((await readHead(table)).authorizationRevision, 1);
      assert.equal((await events(table)).length, 1);

      const replay = await coordinateStaffLifecycleEvent(
        input, { storage }, { enabled: true }
      );
      assert.equal(replay.status, "denied");
      assert.equal(replay.legacyFallbackPermitted, false);
      assert.equal((await readHead(table)).authorizationRevision, 1);
      assert.equal((await events(table)).length, 1);
    }
  );

  await scenario("Pending activation routes through the guarded mutation primitive",
    async table => {
      await seed(table, "pending");
      const result = await coordinateStaffLifecycleEvent(
        event("staff.activated", { status: "active" }),
        { storage: port(table) },
        { enabled: true, activationTransition: "pending" }
      );
      assert.equal(result.status, "committed");
      assert.equal(result.operation, "pending_activation");
      assert.equal((await readHead(table)).state, "active");
      assert.equal((await events(table)).length, 1);
    }
  );

  await scenario("Deactivation routes through the atomic revocation primitive",
    async table => {
      await seed(table);
      const result = await coordinateStaffLifecycleEvent(
        event("staff.deactivated", { status: "inactive" }),
        { storage: port(table) },
        { enabled: true }
      );
      assert.equal(result.status, "committed");
      assert.equal(result.operation, "deactivation");
      assert.equal((await readHead(table)).state, "revoked");
      assert.equal((await events(table)).length, 1);
    }
  );

  await scenario("Reactivation requires the trusted port and same-partition transaction",
    async table => {
      await seed(table, "revoked");
      const result = await coordinateStaffLifecycleEvent(
        event("staff.activated", { status: "active" }, "coordinator-reactivation"),
        {
          storage: port(table),
          reactivationAuthorization: trustedReactivationPort()
        },
        { enabled: true, activationTransition: "reactivation" }
      );
      assert.equal(result.status, "committed");
      assert.equal(result.operation, "reactivation");
      assert.equal(result.executionPermitted, false);
      assert.equal((await readHead(table)).state, "active");
      assert.equal((await events(table)).length, 1);
    }
  );

  await scenario("Receipt collision fails closed without a legacy event append",
    async table => {
      await seed(table);
      await table.createEntity({
        partitionKey: staffId,
        rowKey: STAFF_SECURITY_METADATA_RECEIPT_PREFIX + "coordinator-conflict"
      });

      const result = await coordinateStaffLifecycleEvent(
        event("staff.updated", { displayName: "Blocked Update" },
          "coordinator-conflict"),
        { storage: port(table) },
        { enabled: true }
      );
      assert.equal(result.status, "denied");
      assert.equal(result.legacyFallbackPermitted, false);
      assert.equal((await readHead(table)).revision, 0);
      assert.equal((await events(table)).length, 0);
    }
  );

  await scenario("Lost acknowledgment remains uncertain with one atomic event",
    async table => {
      await seed(table);
      const storage = port(table);
      const uncertainPort: StaffScopedAtomicPort = {
        getEntity: storage.getEntity,
        async submitTransaction(actions) {
          await storage.submitTransaction(actions);
          throw new Error("synthetic acknowledgment lost");
        }
      };

      const result = await coordinateStaffLifecycleEvent(
        event("staff.updated", { displayName: "Acknowledgment Lost" },
          "coordinator-lost-ack"),
        { storage: uncertainPort },
        { enabled: true }
      );
      assert.equal(result.status, "uncertain");
      assert.equal(result.legacyFallbackPermitted, false);
      assert.equal((await readHead(table)).revision, 1);
      assert.equal((await events(table)).length, 1);
    }
  );
}

main().catch(() => {
  console.error("[FAIL] Staff lifecycle coordinator Azurite regression");
  process.exitCode = 1;
});
