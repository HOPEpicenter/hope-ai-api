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

function assertNonAuthorizing(result: {
  executionPermitted: false;
  retryPermitted: false;
}): void {
  assert.equal(result.executionPermitted, false);
  assert.equal(result.retryPermitted, false);
}

async function verifyOwnershipTransitions(): Promise<void> {
  const table = newTable();
  await table.createTable();

  try {
    await createHead(table);
    const repository = new OAuthStaffSecurityStorageRepository(table);

    const legacyObjectId =
      "88888888-8888-4888-8888-888888888888";
    await table.createEntity({
      partitionKey: STAFF_SECURITY_PROTOTYPE_PARTITION,
      rowKey: `binding-${tenantId}-${legacyObjectId}`,
      staffId: "legacy-active-owner",
      tenantId,
      objectId: legacyObjectId,
      operationId: randomUUID()
    });
    const legacyBindingAttempt = await repository.reserveBinding({
      tenantId,
      objectId: legacyObjectId,
      staffId: "legacy-competitor",
      operationId: randomUUID()
    });
    assert.equal(legacyBindingAttempt.status, "conflict");
    assertNonAuthorizing(legacyBindingAttempt);
    assert.equal(await headRevision(table), 0);

    const initialReservation = {
      tenantId,
      objectId,
      staffId: "owner-one",
      operationId: randomUUID()
    };

    const initial = await repository.reserveBinding(initialReservation);
    assert.equal(initial.status, "committed");
    assert.equal(initial.revision, 1);
    assertNonAuthorizing(initial);

    const replay = await repository.reserveBinding(initialReservation);
    assert.equal(replay.status, "conflict");
    assertNonAuthorizing(replay);
    assert.equal(await headRevision(table), 1);

    const competitor = await repository.reserveBinding({
      ...initialReservation,
      staffId: "owner-two",
      operationId: randomUUID()
    });
    assert.equal(competitor.status, "conflict");
    assertNonAuthorizing(competitor);
    assert.equal(await headRevision(table), 1);

    const releaseOperationId = randomUUID();
    const release = await repository.releaseBindingOwnership({
      tenantId,
      objectId,
      expectedStaffId: "owner-one",
      operationId: releaseOperationId
    });
    assert.equal(release.status, "committed");
    assert.equal(release.revision, 2);
    assertNonAuthorizing(release);

    const releaseReplay =
      await repository.releaseBindingOwnership({
        tenantId,
        objectId,
        expectedStaffId: "owner-one",
        operationId: releaseOperationId
      });
    assert.equal(releaseReplay.status, "conflict");
    assertNonAuthorizing(releaseReplay);
    assert.equal(await headRevision(table), 2);

    const releasedBinding = await table.getEntity<{
      staffId: string;
      ownershipState: string;
      releasedByStaffId: string;
      releaseOperationId: string;
      releaseRevision: number;
    }>(
      STAFF_SECURITY_PROTOTYPE_PARTITION,
      `binding-${tenantId}-${objectId}`
    );
    assert.equal(releasedBinding.staffId, "owner-one");
    assert.equal(releasedBinding.ownershipState, "released");
    assert.equal(releasedBinding.releasedByStaffId, "owner-one");
    assert.equal(releasedBinding.releaseOperationId, releaseOperationId);
    assert.equal(releasedBinding.releaseRevision, 2);

    const releaseReceipt = await table.getEntity<{
      staffId: string;
      kind: string;
      operationId: string;
      revision: number;
    }>(
      STAFF_SECURITY_PROTOTYPE_PARTITION,
      `operation-${releaseOperationId}`
    );
    assert.equal(releaseReceipt.staffId, "owner-one");
    assert.equal(releaseReceipt.kind, "binding.released");
    assert.equal(releaseReceipt.operationId, releaseOperationId);
    assert.equal(releaseReceipt.revision, 2);

    const releasedEvidence =
      await repository.inspectReservation(initialReservation);
    assert.equal(releasedEvidence.status, "observed_historical");
    assertNonAuthorizing(releasedEvidence);

    const successorReservation = {
      tenantId,
      objectId,
      staffId: "owner-two",
      operationId: randomUUID()
    };
    const successor =
      await repository.reserveBinding(successorReservation);
    assert.equal(successor.status, "committed");
    assert.equal(successor.revision, 3);
    assertNonAuthorizing(successor);

    const formerOwnerRelease =
      await repository.releaseBindingOwnership({
        tenantId,
        objectId,
        expectedStaffId: "owner-one",
        operationId: randomUUID()
      });
    assert.equal(formerOwnerRelease.status, "conflict");
    assertNonAuthorizing(formerOwnerRelease);
    assert.equal(await headRevision(table), 3);

    const duplicateReceiptRelease =
      await repository.releaseBindingOwnership({
        tenantId,
        objectId,
        expectedStaffId: "owner-two",
        operationId: successorReservation.operationId
      });
    assert.equal(duplicateReceiptRelease.status, "conflict");
    assertNonAuthorizing(duplicateReceiptRelease);
    assert.equal(await headRevision(table), 3);

    const retainedBinding = await table.getEntity<{
      staffId: string;
      operationId: string;
      ownershipState: string;
    }>(
      STAFF_SECURITY_PROTOTYPE_PARTITION,
      `binding-${tenantId}-${objectId}`
    );
    assert.equal(retainedBinding.staffId, "owner-two");
    assert.equal(retainedBinding.ownershipState, "active");
    assert.equal(
      retainedBinding.operationId,
      successorReservation.operationId
    );

    const retainedReceipt = await table.getEntity<{
      staffId: string;
      kind: string;
    }>(
      STAFF_SECURITY_PROTOTYPE_PARTITION,
      `operation-${successorReservation.operationId}`
    );
    assert.equal(retainedReceipt.staffId, "owner-two");
    assert.equal(retainedReceipt.kind, "binding.reserved");

    const concurrentObjectId =
      "33333333-3333-4333-8333-333333333333";
    const concurrentOwnerReservation = await repository.reserveBinding({
      tenantId,
      objectId: concurrentObjectId,
      staffId: "concurrent-owner",
      operationId: randomUUID()
    });
    assert.equal(concurrentOwnerReservation.status, "committed");
    assertNonAuthorizing(concurrentOwnerReservation);

    const [concurrentRelease, concurrentReservation] =
      await Promise.all([
        repository.releaseBindingOwnership({
          tenantId,
          objectId: concurrentObjectId,
          expectedStaffId: "concurrent-owner",
          operationId: randomUUID()
        }),
        repository.reserveBinding({
          tenantId,
          objectId: concurrentObjectId,
          staffId: "concurrent-successor",
          operationId: randomUUID()
        })
      ]);
    assertNonAuthorizing(concurrentRelease);
    assertNonAuthorizing(concurrentReservation);
    assert.ok(
      concurrentRelease.status === "committed" ||
      concurrentRelease.status === "conflict"
    );
    assert.ok(
      concurrentReservation.status === "committed" ||
      concurrentReservation.status === "conflict"
    );
    if (
      concurrentRelease.status === "committed" &&
      concurrentReservation.status === "committed"
    ) {
      assert.notEqual(
        concurrentRelease.revision,
        concurrentReservation.revision
      );
    }

    let concurrentBinding: {
      staffId: string;
      ownershipState: string;
    } | null = null;
    try {
      concurrentBinding = await table.getEntity<{
        staffId: string;
        ownershipState: string;
      }>(
        STAFF_SECURITY_PROTOTYPE_PARTITION,
        `binding-${tenantId}-${concurrentObjectId}`
      );
    } catch (error) {
      assert.equal(
        (error as { statusCode?: number }).statusCode,
        404
      );
    }
    if (concurrentReservation.status === "committed") {
      assert.equal(
        concurrentBinding?.staffId,
        "concurrent-successor"
      );
      assert.equal(concurrentBinding?.ownershipState, "active");
    } else if (concurrentRelease.status === "committed") {
      assert.equal(concurrentBinding?.ownershipState, "released");
      const reacquired = await repository.reserveBinding({
        tenantId,
        objectId: concurrentObjectId,
        staffId: "concurrent-successor",
        operationId: randomUUID()
      });
      assert.equal(reacquired.status, "committed");
      assertNonAuthorizing(reacquired);
    } else {
      assert.equal(concurrentBinding?.staffId, "concurrent-owner");
    }

    const versionlessGuid = await repository.reserveBinding({
      tenantId: "00000000-0000-0000-0000-000000000000",
      objectId,
      staffId: "invalid-guid-owner",
      operationId: randomUUID()
    });
    assert.equal(versionlessGuid.status, "invalid_input");
    assertNonAuthorizing(versionlessGuid);

    const beforeRevocation = await table.getEntity<{
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
        revision: beforeRevocation.revision + 1,
        state: "revoked"
      },
      "Replace",
      { etag: beforeRevocation.etag }
    );

    const blockedReservation = await repository.reserveBinding({
      tenantId,
      objectId: "44444444-4444-4444-8444-444444444444",
      staffId: "after-revocation",
      operationId: randomUUID()
    });
    assert.equal(blockedReservation.status, "unavailable");
    assertNonAuthorizing(blockedReservation);

    const blockedRelease =
      await repository.releaseBindingOwnership({
        tenantId,
        objectId,
        expectedStaffId: "owner-two",
        operationId: randomUUID()
      });
    assert.equal(blockedRelease.status, "unavailable");
    assertNonAuthorizing(blockedRelease);

    const afterRevocationBinding = await table.getEntity<{
      staffId: string;
      ownershipState: string;
    }>(
      STAFF_SECURITY_PROTOTYPE_PARTITION,
      `binding-${tenantId}-${objectId}`
    );
    assert.equal(afterRevocationBinding.staffId, "owner-two");
    assert.equal(afterRevocationBinding.ownershipState, "active");

    console.log(
      "Ownership transitions, immutable receipts, stale-owner fencing, and concurrent reassignment verified"
    );
  } finally {
    await table.deleteTable();
  }
}

async function verifyStaleReleaseRollback(): Promise<void> {
  const table = newTable();
  await table.createTable();

  try {
    await createHead(table);
    const repository = new OAuthStaffSecurityStorageRepository(table);
    const objectIdForTest =
      "55555555-5555-4555-8555-555555555555";
    const reserved = await repository.reserveBinding({
      tenantId,
      objectId: objectIdForTest,
      staffId: "stale-owner",
      operationId: randomUUID()
    });
    assert.equal(reserved.status, "committed");

    const operationId = randomUUID();
    const staleEtagTable = new Proxy(table, {
      get(target, property) {
        if (property === "submitTransaction") {
          return async (actions: TransactionAction[]) => {
            const currentHead = await target.getEntity<{
              revision: number;
              state: string;
            }>(
              STAFF_SECURITY_PROTOTYPE_PARTITION,
              STAFF_SECURITY_HEAD_ROW
            );
            await target.updateEntity(
              {
                partitionKey: STAFF_SECURITY_PROTOTYPE_PARTITION,
                rowKey: STAFF_SECURITY_HEAD_ROW,
                revision: currentHead.revision + 1,
                state: currentHead.state
              },
              "Replace",
              { etag: currentHead.etag }
            );
            return target.submitTransaction(actions);
          };
        }

        const value = Reflect.get(target, property, target);
        return typeof value === "function"
          ? value.bind(target)
          : value;
      }
    });

    const staleRepository =
      new OAuthStaffSecurityStorageRepository(staleEtagTable);
    const staleRelease =
      await staleRepository.releaseBindingOwnership({
        tenantId,
        objectId: objectIdForTest,
        expectedStaffId: "stale-owner",
        operationId
      });
    assert.equal(staleRelease.status, "conflict");
    assertNonAuthorizing(staleRelease);
    assert.equal(await headRevision(table), 2);

    const survivingBinding = await table.getEntity<{
      staffId: string;
    }>(
      STAFF_SECURITY_PROTOTYPE_PARTITION,
      `binding-${tenantId}-${objectIdForTest}`
    );
    assert.equal(survivingBinding.staffId, "stale-owner");

    await assert.rejects(
      table.getEntity(
        STAFF_SECURITY_PROTOTYPE_PARTITION,
        `operation-${operationId}`
      ),
      (error: unknown) =>
        (error as { statusCode?: number }).statusCode === 404
    );
    console.log("Stale release ETag atomically preserves binding and receipt");
  } finally {
    await table.deleteTable();
  }
}

async function verifyReleaseAcknowledgementLoss(): Promise<void> {
  const table = newTable();
  await table.createTable();

  try {
    await createHead(table);
    const repository = new OAuthStaffSecurityStorageRepository(table);
    const reservation = {
      tenantId,
      objectId,
      staffId: "ack-loss-owner",
      operationId: randomUUID()
    };
    const acquired = await repository.reserveBinding(reservation);
    assert.equal(acquired.status, "committed");

    const operationId = randomUUID();
    const lostAcknowledgementTable = new Proxy(table, {
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
        lostAcknowledgementTable
      );

    const uncertain =
      await uncertainRepository.releaseBindingOwnership({
        tenantId,
        objectId,
        expectedStaffId: reservation.staffId,
        operationId
      });
    assert.equal(uncertain.status, "uncertain");
    assertNonAuthorizing(uncertain);
    assert.equal(await headRevision(table), 2);

    const durableReceipt = await table.getEntity<{
      operationId: string;
      staffId: string;
      kind: string;
    }>(
      STAFF_SECURITY_PROTOTYPE_PARTITION,
      `operation-${operationId}`
    );
    assert.equal(durableReceipt.operationId, operationId);
    assert.equal(durableReceipt.staffId, reservation.staffId);
    assert.equal(durableReceipt.kind, "binding.released");

    const releasedBinding = await table.getEntity<{
      ownershipState: string;
      releaseOperationId: string;
    }>(
      STAFF_SECURITY_PROTOTYPE_PARTITION,
      `binding-${tenantId}-${objectId}`
    );
    assert.equal(releasedBinding.ownershipState, "released");
    assert.equal(releasedBinding.releaseOperationId, operationId);
    console.log("Lost release acknowledgement remains uncertain without retry");
  } finally {
    await table.deleteTable();
  }
}

async function verifyOutOfBandBindingModificationRollback(): Promise<void> {
  const table = newTable();
  await table.createTable();

  try {
    await createHead(table);
    const repository = new OAuthStaffSecurityStorageRepository(table);
    const releaseObjectId =
      "66666666-6666-4666-8666-666666666666";
    const initialReservation = {
      tenantId,
      objectId: releaseObjectId,
      staffId: "out-of-band-owner",
      operationId: randomUUID()
    };
    const initial = await repository.reserveBinding(initialReservation);
    assert.equal(initial.status, "committed");

    const staleReleaseOperationId = randomUUID();
    const releaseTable = new Proxy(table, {
      get(target, property) {
        if (property === "submitTransaction") {
          return async (actions: TransactionAction[]) => {
            await target.updateEntity(
              {
                partitionKey: STAFF_SECURITY_PROTOTYPE_PARTITION,
                rowKey: `binding-${tenantId}-${releaseObjectId}`,
                staffId: "out-of-band-modification",
                tenantId,
                objectId: releaseObjectId,
                operationId: initialReservation.operationId,
                ownershipState: "active"
              },
              "Replace"
            );
            return target.submitTransaction(actions);
          };
        }

        const value = Reflect.get(target, property, target);
        return typeof value === "function"
          ? value.bind(target)
          : value;
      }
    });
    const staleReleaseRepository =
      new OAuthStaffSecurityStorageRepository(releaseTable);
    const staleRelease =
      await staleReleaseRepository.releaseBindingOwnership({
        tenantId,
        objectId: releaseObjectId,
        expectedStaffId: "out-of-band-owner",
        operationId: staleReleaseOperationId
      });
    assert.equal(staleRelease.status, "conflict");
    assertNonAuthorizing(staleRelease);
    assert.equal(await headRevision(table), 1);

    const changedOwnerBinding = await table.getEntity<{
      staffId: string;
      ownershipState: string;
    }>(
      STAFF_SECURITY_PROTOTYPE_PARTITION,
      `binding-${tenantId}-${releaseObjectId}`
    );
    assert.equal(changedOwnerBinding.staffId, "out-of-band-modification");
    assert.equal(changedOwnerBinding.ownershipState, "active");
    await assert.rejects(
      table.getEntity(
        STAFF_SECURITY_PROTOTYPE_PARTITION,
        `operation-${staleReleaseOperationId}`
      ),
      (error: unknown) =>
        (error as { statusCode?: number }).statusCode === 404
    );

    const acquisitionObjectId =
      "77777777-7777-4777-8777-777777777777";
    const acquisitionOwner = {
      tenantId,
      objectId: acquisitionObjectId,
      staffId: "released-owner",
      operationId: randomUUID()
    };
    const acquired = await repository.reserveBinding(acquisitionOwner);
    assert.equal(acquired.status, "committed");
    const releaseOperationId = randomUUID();
    const released = await repository.releaseBindingOwnership({
      tenantId,
      objectId: acquisitionObjectId,
      expectedStaffId: acquisitionOwner.staffId,
      operationId: releaseOperationId
    });
    assert.equal(released.status, "committed");

    const acquisitionOperationId = randomUUID();
    const acquisitionTable = new Proxy(table, {
      get(target, property) {
        if (property === "submitTransaction") {
          return async (actions: TransactionAction[]) => {
            await target.updateEntity(
              {
                partitionKey: STAFF_SECURITY_PROTOTYPE_PARTITION,
                rowKey: `binding-${tenantId}-${acquisitionObjectId}`,
                staffId: acquisitionOwner.staffId,
                tenantId,
                objectId: acquisitionObjectId,
                operationId: acquisitionOwner.operationId,
                ownershipState: "released",
                releasedByStaffId: acquisitionOwner.staffId,
                releaseOperationId: randomUUID(),
                releaseRevision: released.revision
              },
              "Replace"
            );
            return target.submitTransaction(actions);
          };
        }

        const value = Reflect.get(target, property, target);
        return typeof value === "function"
          ? value.bind(target)
          : value;
      }
    });
    const staleAcquisitionRepository =
      new OAuthStaffSecurityStorageRepository(acquisitionTable);
    const staleAcquisition =
      await staleAcquisitionRepository.reserveBinding({
        tenantId,
        objectId: acquisitionObjectId,
        staffId: "successor-owner",
        operationId: acquisitionOperationId
      });
    assert.equal(staleAcquisition.status, "conflict");
    assertNonAuthorizing(staleAcquisition);
    assert.equal(await headRevision(table), 3);

    const changedReleasedBinding = await table.getEntity<{
      staffId: string;
      ownershipState: string;
      releaseOperationId: string;
    }>(
      STAFF_SECURITY_PROTOTYPE_PARTITION,
      `binding-${tenantId}-${acquisitionObjectId}`
    );
    assert.equal(changedReleasedBinding.staffId, "released-owner");
    assert.equal(changedReleasedBinding.ownershipState, "released");
    assert.notEqual(changedReleasedBinding.releaseOperationId, releaseOperationId);
    await assert.rejects(
      table.getEntity(
        STAFF_SECURITY_PROTOTYPE_PARTITION,
        `operation-${acquisitionOperationId}`
      ),
      (error: unknown) =>
        (error as { statusCode?: number }).statusCode === 404
    );

    console.log(
      "Out-of-band binding modifications cause atomic stale release and acquisition rollback"
    );
  } finally {
    await table.deleteTable();
  }
}

async function main(): Promise<void> {
  await verifyOwnershipTransitions();
  await verifyStaleReleaseRollback();
  await verifyReleaseAcknowledgementLoss();
  await verifyOutOfBandBindingModificationRollback();

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
