import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  TableClient,
  type TransactionAction
} from "@azure/data-tables";
import {
  ENTRA_STAFF_ACCEPTANCE_OPERATION
} from "../../src/repositories/entraStaffAcceptanceHandoffReceiptStorageRepository";
import {
  consumeStaffAcceptanceReceiptAtomically
} from "../../src/repositories/staffAcceptanceRevocationAtomicityProof";
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

const staffId = "synthetic-staff-e125";
const receiptId = "d".repeat(64);
const identityDigest = "e".repeat(64);
const issuedAtMs = 2_000_000_000_000;
const expiresAtMs = issuedAtMs + 30_000;

function receiptRequest(authorizationRevision = 0) {
  return {
    staffId,
    receiptId,
    operation: ENTRA_STAFF_ACCEPTANCE_OPERATION,
    identityDigest,
    authorizationRevision
  } as const;
}

function deactivation(eventId: string) {
  return {
    eventId,
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

async function seed(
  table: TableClient,
  options: { state?: string; authorizationRevision?: number } = {}
): Promise<void> {
  const authorizationRevision = options.authorizationRevision ?? 0;
  await table.createEntity({
    partitionKey: staffId,
    rowKey: STAFF_SECURITY_METADATA_HEAD,
    revision: authorizationRevision,
    authorizationRevision,
    state: options.state ?? "active"
  });
  await table.createEntity({
    partitionKey: staffId,
    rowKey: STAFF_SECURITY_METADATA_RECEIPT_PREFIX + receiptId,
    schemaVersion: 1,
    operation: ENTRA_STAFF_ACCEPTANCE_OPERATION,
    identityDigest,
    authorizationRevision,
    issuedAtMs,
    expiresAtMs,
    state: "issued",
    revision: 0
  });
}

async function head(table: TableClient) {
  return table.getEntity<{
    revision: number;
    authorizationRevision: number;
    state: string;
  }>(staffId, STAFF_SECURITY_METADATA_HEAD);
}

async function storedReceipt(table: TableClient) {
  return table.getEntity<{
    state: string;
    revision: number;
    identityDigest: string;
  }>(
    staffId,
    STAFF_SECURITY_METADATA_RECEIPT_PREFIX + receiptId
  );
}

async function runScenario(
  test: (table: TableClient) => Promise<void>
): Promise<void> {
  const table = TableClient.fromConnectionString(
    connectionString,
    "StaffRevIT" + randomBytes(8).toString("hex"),
    { allowInsecureConnection: true }
  );
  await table.createTable();
  try {
    await test(table);
  } finally {
    await table.deleteTable();
  }
}

async function consumptionWinsFirst(): Promise<void> {
  await runScenario(async table => {
    await seed(table);
    const consumed = await consumeStaffAcceptanceReceiptAtomically(
      receiptRequest(),
      port(table),
      true,
      () => issuedAtMs + 1_000
    );
    assert.equal(consumed.status, "committed");
    assert.equal(consumed.executionPermitted, false);

    const revoked = await submitStaffScopedAtomicDeactivation(
      deactivation("synthetic-revoke-after-consume"),
      port(table),
      true
    );
    assert.equal(revoked.status, "committed");
    const finalHead = await head(table);
    assert.equal(finalHead.revision, 2);
    assert.equal(finalHead.authorizationRevision, 2);
    assert.equal(finalHead.state, "revoked");
    assert.equal((await storedReceipt(table)).state, "consumed");
    assert.equal((await new StaffEventsRepository(table).listAll()).length, 1);
  });
}

async function revocationWinsFirst(): Promise<void> {
  await runScenario(async table => {
    await seed(table);
    const revoked = await submitStaffScopedAtomicDeactivation(
      deactivation("synthetic-revoke-first"),
      port(table),
      true
    );
    assert.equal(revoked.status, "committed");

    const consumed = await consumeStaffAcceptanceReceiptAtomically(
      receiptRequest(),
      port(table),
      true,
      () => issuedAtMs + 1_000
    );
    assert.equal(consumed.status, "denied");
    const finalHead = await head(table);
    assert.equal(finalHead.revision, 1);
    assert.equal(finalHead.authorizationRevision, 1);
    assert.equal(finalHead.state, "revoked");
    assert.equal((await storedReceipt(table)).state, "issued");
    assert.equal((await new StaffEventsRepository(table).listAll()).length, 1);
  });
}

async function concurrentRaceHasSingleWinner(): Promise<void> {
  await runScenario(async table => {
    await seed(table);
    let headReads = 0;
    let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });

    function competingPort(): StaffScopedAtomicPort {
      const underlying = port(table);
      return {
        async getEntity(partitionKey, rowKey) {
          const entity = await underlying.getEntity(partitionKey, rowKey);
          if (rowKey === STAFF_SECURITY_METADATA_HEAD) {
            headReads++;
            if (headReads === 2) release();
            await barrier;
          }
          return entity;
        },
        submitTransaction: actions =>
          underlying.submitTransaction(actions)
      };
    }

    const [consumeResult, revokeResult] = await Promise.all([
      consumeStaffAcceptanceReceiptAtomically(
        receiptRequest(),
        competingPort(),
        true,
        () => issuedAtMs + 1_000
      ),
      submitStaffScopedAtomicDeactivation(
        deactivation("synthetic-racing-revoke"),
        competingPort(),
        true
      )
    ]);

    assert.equal(headReads, 2);
    assert.equal(
      [consumeResult, revokeResult].filter(
        result => result.status === "committed"
      ).length,
      1
    );

    const finalHead = await head(table);
    const events = await new StaffEventsRepository(table).listAll();
    if (consumeResult.status === "committed") {
      assert.equal(revokeResult.status, "denied");
      assert.equal(finalHead.state, "active");
      assert.equal(finalHead.authorizationRevision, 1);
      assert.equal((await storedReceipt(table)).state, "consumed");
      assert.equal(events.length, 0);
      assert.equal(
        (await submitStaffScopedAtomicDeactivation(
          deactivation("synthetic-revoke-after-race"),
          port(table),
          true
        )).status,
        "committed"
      );
      assert.equal((await head(table)).state, "revoked");
      assert.equal((await head(table)).authorizationRevision, 2);
      assert.equal((await new StaffEventsRepository(table).listAll()).length, 1);
    } else {
      assert.equal(consumeResult.status, "denied");
      assert.equal(finalHead.state, "revoked");
      assert.equal(finalHead.authorizationRevision, 1);
      assert.equal((await storedReceipt(table)).state, "issued");
      assert.equal(events.length, 1);
      assert.equal(
        (await consumeStaffAcceptanceReceiptAtomically(
          receiptRequest(),
          port(table),
          true,
          () => issuedAtMs + 1_000
        )).status,
        "denied"
      );
    }

    assert.equal(consumeResult.executionPermitted, false);
    assert.equal(revokeResult.executionPermitted, false);
    assert.equal(consumeResult.retryPermitted, false);
    assert.equal(revokeResult.retryPermitted, false);
  });
}

async function concurrentMutationHasSingleWinner(): Promise<void> {
  await runScenario(async table => {
    await seed(table);
    let headReads = 0;
    let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });

    function competingPort(): StaffScopedAtomicPort {
      const underlying = port(table);
      return {
        async getEntity(partitionKey, rowKey) {
          const entity = await underlying.getEntity(partitionKey, rowKey);
          if (rowKey === STAFF_SECURITY_METADATA_HEAD) {
            headReads++;
            if (headReads === 2) release();
            await barrier;
          }
          return entity;
        },
        submitTransaction: actions =>
          underlying.submitTransaction(actions)
      };
    }

    const [consumeResult, mutationResult] = await Promise.all([
      consumeStaffAcceptanceReceiptAtomically(
        receiptRequest(),
        competingPort(),
        true,
        () => issuedAtMs + 1_000
      ),
      submitStaffScopedAtomicMutation(
        {
          eventId: "synthetic-racing-mutation",
          staffId,
          type: "staff.updated",
          occurredAt: "2026-11-09T12:02:00.000Z",
          actorId: "synthetic-admin",
          data: { displayName: "Updated Synthetic Staff" }
        },
        competingPort(),
        true
      )
    ]);

    assert.equal(headReads, 2);
    assert.equal(
      [consumeResult, mutationResult].filter(
        result => result.status === "committed"
      ).length,
      1
    );
    const finalHead = await head(table);
    assert.equal(finalHead.revision, 1);
    assert.equal(finalHead.authorizationRevision, 1);
    assert.equal(finalHead.state, "active");

    const events = await new StaffEventsRepository(table).listAll();
    if (consumeResult.status === "committed") {
      assert.equal(mutationResult.status, "denied");
      assert.equal((await storedReceipt(table)).state, "consumed");
      assert.equal(events.length, 0);
    } else {
      assert.equal(consumeResult.status, "denied");
      assert.equal(mutationResult.status, "committed");
      assert.equal((await storedReceipt(table)).state, "issued");
      assert.equal(events.length, 1);
      assert.equal(events[0].eventId, "synthetic-racing-mutation");
      assert.equal(
        (await consumeStaffAcceptanceReceiptAtomically(
          receiptRequest(),
          port(table),
          true,
          () => issuedAtMs + 1_000
        )).status,
        "denied"
      );
    }

    assert.equal(consumeResult.executionPermitted, false);
    assert.equal(mutationResult.executionPermitted, false);
    assert.equal(consumeResult.retryPermitted, false);
    assert.equal(mutationResult.retryPermitted, false);
  });
}

async function failedClosedScenarios(): Promise<void> {
  await runScenario(async table => {
    await seed(table);
    assert.equal(
      (await consumeStaffAcceptanceReceiptAtomically(
        receiptRequest(1), port(table), true, () => issuedAtMs + 1
      )).status,
      "denied"
    );
    assert.equal(
      (await consumeStaffAcceptanceReceiptAtomically(
        { ...receiptRequest(), identityDigest: "f".repeat(64) },
        port(table), true, () => issuedAtMs + 1
      )).status,
      "denied"
    );
    assert.equal(
      (await consumeStaffAcceptanceReceiptAtomically(
        receiptRequest(), port(table), true, () => expiresAtMs
      )).status,
      "denied"
    );
    assert.equal((await head(table)).authorizationRevision, 0);
    assert.equal((await storedReceipt(table)).state, "issued");
  });

  await runScenario(async table => {
    await seed(table, { state: "revoked" });
    assert.equal(
      (await consumeStaffAcceptanceReceiptAtomically(
        receiptRequest(), port(table), true, () => issuedAtMs + 1
      )).status,
      "denied"
    );
  });

  await runScenario(async table => {
    await table.createEntity({
      partitionKey: staffId,
      rowKey: STAFF_SECURITY_METADATA_RECEIPT_PREFIX + receiptId,
      schemaVersion: 1,
      operation: ENTRA_STAFF_ACCEPTANCE_OPERATION,
      identityDigest,
      authorizationRevision: 0,
      issuedAtMs,
      expiresAtMs,
      state: "issued",
      revision: 0
    });
    assert.equal(
      (await consumeStaffAcceptanceReceiptAtomically(
        receiptRequest(), port(table), true, () => issuedAtMs + 1
      )).status,
      "denied"
    );
    assert.equal((await storedReceipt(table)).state, "issued");
  });
}

async function rollbackAndAmbiguousAcknowledgement(): Promise<void> {
  await runScenario(async table => {
    await seed(table);
    const underlying = port(table);
    const rollbackPort: StaffScopedAtomicPort = {
      async getEntity(partitionKey, rowKey) {
        return underlying.getEntity(partitionKey, rowKey);
      },
      async submitTransaction(actions) {
        const current = await storedReceipt(table);
        await table.updateEntity(
          {
            partitionKey: staffId,
            rowKey: STAFF_SECURITY_METADATA_RECEIPT_PREFIX + receiptId,
            schemaVersion: 1,
            operation: ENTRA_STAFF_ACCEPTANCE_OPERATION,
            identityDigest,
            authorizationRevision: 0,
            issuedAtMs,
            expiresAtMs,
            state: "consumed",
            revision: 1,
            consumedAtMs: issuedAtMs + 1
          },
          "Replace",
          { etag: current.etag }
        );
        await underlying.submitTransaction(actions);
      }
    };
    const rolledBack = await consumeStaffAcceptanceReceiptAtomically(
      receiptRequest(),
      rollbackPort,
      true,
      () => issuedAtMs + 2
    );
    assert.equal(rolledBack.status, "denied");
    assert.equal((await head(table)).authorizationRevision, 0);
    assert.equal((await storedReceipt(table)).revision, 1);
    assert.equal((await new StaffEventsRepository(table).listAll()).length, 0);
  });

  await runScenario(async table => {
    await seed(table);
    const underlying = port(table);
    const lostAckPort: StaffScopedAtomicPort = {
      getEntity: underlying.getEntity,
      async submitTransaction(actions) {
        await underlying.submitTransaction(actions);
        throw new Error("synthetic acknowledgement lost");
      }
    };
    const uncertain = await consumeStaffAcceptanceReceiptAtomically(
      receiptRequest(),
      lostAckPort,
      true,
      () => issuedAtMs + 1
    );
    assert.equal(uncertain.status, "uncertain");
    assert.equal(uncertain.executionPermitted, false);
    assert.equal(uncertain.retryPermitted, false);
    assert.equal((await head(table)).authorizationRevision, 1);
    assert.equal((await storedReceipt(table)).state, "consumed");

    const replay = await consumeStaffAcceptanceReceiptAtomically(
      receiptRequest(),
      port(table),
      true,
      () => issuedAtMs + 2
    );
    assert.equal(replay.status, "denied");
  });
}

async function main(): Promise<void> {
  await consumptionWinsFirst();
  await revocationWinsFirst();
  await concurrentRaceHasSingleWinner();
  await concurrentMutationHasSingleWinner();
  await failedClosedScenarios();
  await rollbackAndAmbiguousAcknowledgement();
  console.log("[PASS] Staff revocation and receipt atomicity Azurite regressions");
  console.log("[SAFE] Synthetic local storage only; no live authorization");
}

main().catch(error => {
  const detail = error && typeof error === "object"
    ? [
      Reflect.get(error, "name"),
      Reflect.get(error, "statusCode"),
      Reflect.get(error, "code")
    ].filter(value => typeof value === "string" ||
      typeof value === "number").join("/")
    : typeof error;
  const assertion = error instanceof Error &&
      error.name === "AssertionError"
    ? error.message.split("\n")[0]
    : undefined;
  const locations = error instanceof Error
    ? error.stack?.split("\n").filter(line =>
      line.includes("staffAcceptanceRevocationAtomicityAzurite.test.ts")
    ).map(line => line.trim()).join("; ")
    : undefined;
  console.error(
    "[FAIL] Staff revocation and receipt atomicity Azurite regressions" +
      (detail ? ` [${detail}]` : "") +
      (assertion ? ` (${assertion})` : "") +
      (locations ? ` (${locations})` : "")
  );
  process.exitCode = 1;
});
