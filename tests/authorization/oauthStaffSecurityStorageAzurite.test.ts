import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import {
  TableClient,
  type TransactionAction
} from "@azure/data-tables";
import {
  OAuthStaffSecurityStorageRepository,
  STAFF_SECURITY_HEAD_ROW,
  STAFF_SECURITY_PROTOTYPE_PARTITION
} from "../../src/repositories/oauthStaffSecurityStorageRepository";

/**
 * Emulator-only integration of the REAL repository.
 * No staff writer or OAuth execution integration.
 */

if (
  process.env.STORAGE_CONNECTION_STRING !==
  "UseDevelopmentStorage=true"
) {
  throw new Error("Azurite-only storage required");
}

const port =
  process.env.HOPE_OAUTH_AZURITE_TABLE_PORT ?? "10002";

if (port !== "10002" && port !== "11002") {
  throw new Error("Unapproved Azurite Table port");
}

const connectionString = port === "10002"
  ? "UseDevelopmentStorage=true"
  : [
      "DefaultEndpointsProtocol=http",
      "AccountName=devstoreaccount1",
      "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==",
      "TableEndpoint=http://127.0.0.1:11002/devstoreaccount1"
    ].join(";");

const tenantId = "11111111-1111-4111-8111-111111111111";
const objectId = "22222222-2222-4222-8222-222222222222";

function newTable(): TableClient {
  return TableClient.fromConnectionString(
    connectionString,
    "OauthSecurityIT" + randomBytes(10).toString("hex"),
    { allowInsecureConnection: true }
  );
}

async function createHead(table: TableClient): Promise<void> {
  await table.createEntity({
    partitionKey: STAFF_SECURITY_PROTOTYPE_PARTITION,
    rowKey: STAFF_SECURITY_HEAD_ROW,
    revision: 0,
    state: "active"
  });
}

async function headRevision(table: TableClient): Promise<number> {
  const entity = await table.getEntity<{ revision: number }>(
    STAFF_SECURITY_PROTOTYPE_PARTITION,
    STAFF_SECURITY_HEAD_ROW
  );
  return entity.revision;
}

async function main(): Promise<void> {
  const table = newTable();
  await table.createTable();

  try {
    const repository =
      new OAuthStaffSecurityStorageRepository(table);

    // No implicit head initialization is permitted.
    const absent = await repository.reserveBinding({
      tenantId,
      objectId,
      staffId: "staff-one",
      operationId: randomUUID()
    });

    assert.equal(absent.status, "unavailable");
    assert.equal(absent.executionPermitted, false);
    assert.equal(absent.retryPermitted, false);

    console.log("Missing authority fails closed");

    await createHead(table);

    const invalid = await repository.reserveBinding({
      tenantId: "invalid",
      objectId,
      staffId: "staff-one",
      operationId: randomUUID()
    });

    assert.equal(invalid.status, "invalid_input");
    assert.equal(await headRevision(table), 0);

    console.log("Invalid identity rejected before storage write");

    const contenders = Array.from(
      { length: 12 },
      (_, index) => ({
        tenantId,
        objectId,
        staffId: `staff-${index}`,
        operationId: randomUUID()
      })
    );

    const results = await Promise.all(
      contenders.map(request => repository.reserveBinding(request))
    );

    const winners = results
      .map((result, index) => ({ result, index }))
      .filter(item => item.result.status === "committed");

    assert.equal(winners.length, 1);
    assert.equal(await headRevision(table), 1);

    for (const result of results) {
      assert.equal(result.executionPermitted, false);
      assert.equal(result.retryPermitted, false);
    }

    const winner = contenders[winners[0].index];

    const binding = await table.getEntity<{ staffId: string }>(
      STAFF_SECURITY_PROTOTYPE_PARTITION,
      `binding-${tenantId}-${objectId}`
    );

    assert.equal(binding.staffId, winner.staffId);

    const receipt = await table.getEntity<{
      staffId: string;
      kind: string;
      revision: number;
    }>(
      STAFF_SECURITY_PROTOTYPE_PARTITION,
      `operation-${winner.operationId}`
    );

    assert.equal(receipt.staffId, winner.staffId);
    assert.equal(receipt.kind, "binding.reserved");
    assert.equal(receipt.revision, 1);

    console.log(
      "Concurrent repository reservations have one winner"
    );

    const competingOwner = await repository.reserveBinding({
      tenantId,
      objectId,
      staffId: "competing-owner",
      operationId: randomUUID()
    });

    assert.equal(competingOwner.status, "conflict");
    assert.equal(await headRevision(table), 1);

    console.log("Duplicate binding reservation rejected");

    const replay = await repository.reserveBinding(winner);

    assert.equal(replay.status, "conflict");
    assert.equal(replay.executionPermitted, false);
    assert.equal(replay.retryPermitted, false);
    assert.equal(await headRevision(table), 1);

    console.log(
      "Operation replay is not misclassified as authorized"
    );

    // Simulate transport failure AFTER a durable commit.
    // This is NOT a real network failure injection.
    // Only the method response is intentionally lost.
    const anotherTable = newTable();
    await anotherTable.createTable();

    try {
      await createHead(anotherTable);

      const simulatedAckLoss = new Proxy(anotherTable, {
        get(target, property) {
          if (property === "submitTransaction") {
            return async (actions: TransactionAction[]) => {
              await target.submitTransaction(actions);
              throw new Error("simulated acknowledgement loss");
            };
          }

          const value = Reflect.get(target, property, target);

          return typeof value === "function"
            ? value.bind(target)
            : value;
        }
      });

      const uncertainRepository =
        new OAuthStaffSecurityStorageRepository(
          simulatedAckLoss
        );

      const operationId = randomUUID();

      const uncertain = await uncertainRepository.reserveBinding({
        tenantId,
        objectId,
        staffId: "staff-uncertain",
        operationId
      });

      assert.equal(uncertain.status, "uncertain");
      assert.equal(uncertain.executionPermitted, false);
      assert.equal(uncertain.retryPermitted, false);

      const durableReceipt = await anotherTable.getEntity<{
        operationId: string;
        staffId: string;
      }>(
        STAFF_SECURITY_PROTOTYPE_PARTITION,
        `operation-${operationId}`
      );

      assert.equal(durableReceipt.operationId, operationId);
      assert.equal(durableReceipt.staffId, "staff-uncertain");
      assert.equal(await headRevision(anotherTable), 1);

      console.log(
        "Lost acknowledgement stays uncertain despite durable commit"
      );
    } finally {
      await anotherTable.deleteTable();
    }

    // Read-only evidence must never grant authorization.
    const winnerEvidence =
      await repository.inspectReservation(winner);

    assert.equal(
      winnerEvidence.status,
      "observed_consistent"
    );
    assert.equal(winnerEvidence.executionPermitted, false);
    assert.equal(winnerEvidence.retryPermitted, false);

    const unknownEvidence =
      await repository.inspectReservation({
        tenantId,
        objectId,
        staffId: "staff-unknown",
        operationId: randomUUID()
      });

    assert.equal(
      unknownEvidence.status,
      "absent_or_unavailable"
    );

    console.log("Read-only reservation evidence verified");

    // Revocation is checked as a property of the head.
    // Even a fresh ETag cannot permit reservation once
    // the prototype head state is no longer active.
    const beforeRevoke = await table.getEntity<{
      revision: number;
      state: string;
    }>(
      STAFF_SECURITY_PROTOTYPE_PARTITION,
      STAFF_SECURITY_HEAD_ROW
    );

    await table.updateEntity(
      {
        partitionKey: STAFF_SECURITY_PROTOTYPE_PARTITION,
        rowKey: STAFF_SECURITY_HEAD_ROW,
        revision: beforeRevoke.revision + 1,
        state: "revoked"
      },
      "Replace",
      { etag: beforeRevoke.etag }
    );

    const revokedHeadRevision = await headRevision(table);

    const revokedRequest = await repository.reserveBinding({
      tenantId,
      objectId: "33333333-3333-4333-8333-333333333333",
      staffId: "staff-after-revoke",
      operationId: randomUUID()
    });

    assert.equal(revokedRequest.status, "unavailable");
    assert.equal(await headRevision(table), revokedHeadRevision);

    console.log("Revoked head prevents fresh reservation");

    const afterRevokeEvidence =
      await repository.inspectReservation(winner);

    // Historical receipt evidence remains observable.
    // It cannot be interpreted as current authorization.
    assert.equal(
      afterRevokeEvidence.status,
      "observed_consistent"
    );
    assert.equal(
      afterRevokeEvidence.executionPermitted,
      false
    );

    console.log("Historical evidence remains non-authorizing");

    // Transaction rollback proof: an old head ETag cannot
    // create either a reservation or an operation receipt.
    const rollbackTable = newTable();
    await rollbackTable.createTable();

    try {
      await createHead(rollbackTable);

      const staleHead = await rollbackTable.getEntity<{
        revision: number;
        state: string;
      }>(
        STAFF_SECURITY_PROTOTYPE_PARTITION,
        STAFF_SECURITY_HEAD_ROW
      );

      await rollbackTable.updateEntity(
        {
          partitionKey: STAFF_SECURITY_PROTOTYPE_PARTITION,
          rowKey: STAFF_SECURITY_HEAD_ROW,
          revision: 1,
          state: "active"
        },
        "Replace",
        { etag: staleHead.etag }
      );

      const currentHead = await rollbackTable.getEntity<{
        revision: number;
        state: string;
      }>(
        STAFF_SECURITY_PROTOTYPE_PARTITION,
        STAFF_SECURITY_HEAD_ROW
      );

      const staleObjectId =
        "44444444-4444-4444-8444-444444444444";
      const staleOperationId = randomUUID();
      let staleRejected = false;

      try {
        await rollbackTable.submitTransaction([
          [
            "update",
            {
              partitionKey: STAFF_SECURITY_PROTOTYPE_PARTITION,
              rowKey: STAFF_SECURITY_HEAD_ROW,
              revision: 2,
              state: "active"
            },
            "Replace",
            { etag: staleHead.etag }
          ],
          [
            "create",
            {
              partitionKey: STAFF_SECURITY_PROTOTYPE_PARTITION,
              rowKey: `binding-${tenantId}-${staleObjectId}`,
              staffId: "staff-stale"
            }
          ],
          [
            "create",
            {
              partitionKey: STAFF_SECURITY_PROTOTYPE_PARTITION,
              rowKey: `operation-${staleOperationId}`,
              operationId: staleOperationId,
              staffId: "staff-stale"
            }
          ]
        ]);
      } catch {
        staleRejected = true;
      }

      assert.equal(staleRejected, true);
      assert.equal(await headRevision(rollbackTable), 1);

      await assert.rejects(
        rollbackTable.getEntity(
          STAFF_SECURITY_PROTOTYPE_PARTITION,
          `binding-${tenantId}-${staleObjectId}`
        ),
        (error: unknown) =>
          (error as { statusCode?: number }).statusCode === 404
      );

      await assert.rejects(
        rollbackTable.getEntity(
          STAFF_SECURITY_PROTOTYPE_PARTITION,
          `operation-${staleOperationId}`
        ),
        (error: unknown) =>
          (error as { statusCode?: number }).statusCode === 404
      );

      console.log("Stale ETag atomic rollback verified");

      // A duplicate operation receipt must roll back the
      // head update AND any proposed new binding.
      const duplicateOperationId = randomUUID();

      await rollbackTable.createEntity({
        partitionKey: STAFF_SECURITY_PROTOTYPE_PARTITION,
        rowKey: `operation-${duplicateOperationId}`,
        operationId: duplicateOperationId,
        staffId: "existing-staff",
        kind: "binding.reserved",
        revision: 1
      });

      const duplicateObjectId =
        "55555555-5555-4555-8555-555555555555";

      let duplicateRejected = false;

      try {
        await rollbackTable.submitTransaction([
          [
            "update",
            {
              partitionKey: STAFF_SECURITY_PROTOTYPE_PARTITION,
              rowKey: STAFF_SECURITY_HEAD_ROW,
              revision: currentHead.revision + 1,
              state: "active"
            },
            "Replace",
            { etag: currentHead.etag }
          ],
          [
            "create",
            {
              partitionKey: STAFF_SECURITY_PROTOTYPE_PARTITION,
              rowKey: `binding-${tenantId}-${duplicateObjectId}`,
              staffId: "staff-duplicate"
            }
          ],
          [
            "create",
            {
              partitionKey: STAFF_SECURITY_PROTOTYPE_PARTITION,
              rowKey: `operation-${duplicateOperationId}`,
              operationId: duplicateOperationId,
              staffId: "staff-duplicate"
            }
          ]
        ]);
      } catch {
        duplicateRejected = true;
      }

      assert.equal(duplicateRejected, true);
      assert.equal(await headRevision(rollbackTable), 1);

      await assert.rejects(
        rollbackTable.getEntity(
          STAFF_SECURITY_PROTOTYPE_PARTITION,
          `binding-${tenantId}-${duplicateObjectId}`
        ),
        (error: unknown) =>
          (error as { statusCode?: number }).statusCode === 404
      );

      const existingReceipt =
        await rollbackTable.getEntity<{ staffId: string }>(
          STAFF_SECURITY_PROTOTYPE_PARTITION,
          `operation-${duplicateOperationId}`
        );

      assert.equal(existingReceipt.staffId, "existing-staff");

      console.log("Duplicate operation atomic rollback verified");
    } finally {
      await rollbackTable.deleteTable();
    }

    console.log(
      "Actual staff security repository Azurite tests passed"
    );
  } finally {
    await table.deleteTable();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
