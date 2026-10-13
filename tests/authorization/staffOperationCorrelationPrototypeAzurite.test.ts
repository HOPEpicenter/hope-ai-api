import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import {
  TableClient,
  type TransactionAction
} from "@azure/data-tables";
import {
  STAFF_OPERATION_CORRELATION_PROTOTYPE_HEAD_ROW,
  STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
  StaffOperationCorrelationPrototypeRepository,
  type StaffOperationCorrelationPrototypeRequest
} from "../../src/repositories/staffOperationCorrelationPrototypeRepository";

if (process.env.STORAGE_CONNECTION_STRING !== "UseDevelopmentStorage=true") {
  throw new Error("Azurite-only storage required");
}

const port = process.env.HOPE_OAUTH_AZURITE_TABLE_PORT ?? "10002";
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
const bindingIdentity = { entraTenantId: tenantId, entraObjectId: objectId };

function newTable(prefix: string): TableClient {
  return TableClient.fromConnectionString(
    connectionString,
    prefix + randomBytes(10).toString("hex"),
    { allowInsecureConnection: true }
  );
}

function nonAuthorizing(result: {
  authoritative: false;
  executionPermitted: false;
  retryPermitted: false;
}): void {
  assert.equal(result.authoritative, false);
  assert.equal(result.executionPermitted, false);
  assert.equal(result.retryPermitted, false);
}

async function revision(table: TableClient): Promise<number> {
  const head = await table.getEntity<{ revision: number }>(
    STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
    STAFF_OPERATION_CORRELATION_PROTOTYPE_HEAD_ROW
  );
  return head.revision;
}

function op(
  fields: Partial<StaffOperationCorrelationPrototypeRequest> & {
    operationId: string;
    eventId: string;
    staffId: string;
  }
): StaffOperationCorrelationPrototypeRequest {
  return {
    mutationCategory: "identity_creation",
    expectedRevision: 0,
    expectedStaffState: "absent",
    resultingStaffState: "active",
    ...fields
  };
}

function transactionProxy(
  table: TableClient,
  intercept: (
    actions: TransactionAction[],
    submit: (actions: TransactionAction[]) => Promise<unknown>
  ) => Promise<unknown>
): TableClient {
  return new Proxy(table, {
    get(target, property) {
      if (property === "submitTransaction") {
        const submit = target.submitTransaction.bind(target) as (
          actions: TransactionAction[]
        ) => Promise<unknown>;
        return (actions: TransactionAction[]) => intercept(actions, submit);
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}

async function main(): Promise<void> {
  const table = newTable("StaffCorrIT");
  const eventsTable = newTable("StaffCorrEventsIT");
  await table.createTable();
  await eventsTable.createTable();
  try {
    const repository = new StaffOperationCorrelationPrototypeRepository(table);
    assert.equal(await repository.initializeAuthorityHead(), "initialized");
    assert.equal(await repository.initializeAuthorityHead(), "conflict");

    const staffA = "synthetic-staff-a";
    const createA = op({
      operationId: "operation-create-a",
      eventId: "event-create-a",
      staffId: staffA
    });
    const created = await repository.commitOperation(createA);
    assert.equal(created.status, "committed");
    assert.equal(created.revision, 1);
    nonAuthorizing(created);
    const createReceipt = await table.getEntity<{
      eventId: string;
      operationId: string;
      source: string;
      schemaVersion: number;
      staffId: string;
      resultingRevision: number;
    }>(
      STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
      "operation-operation-create-a"
    );
    assert.equal(createReceipt.operationId, createA.operationId);
    assert.equal(createReceipt.eventId, createA.eventId);
    assert.equal(createReceipt.staffId, staffA);
    assert.equal(createReceipt.resultingRevision, 1);
    assert.equal(createReceipt.schemaVersion, 1);
    assert.equal(createReceipt.source, "staff-operation-correlation-prototype-v1");

    const missingHeadTable = newTable("StaffCorrMissingIT");
    await missingHeadTable.createTable();
    try {
      const missingHead = await new StaffOperationCorrelationPrototypeRepository(
        missingHeadTable
      ).commitOperation(op({
        operationId: "missing-head-operation",
        eventId: "missing-head-event",
        staffId: "synthetic-missing-head"
      }));
      assert.equal(missingHead.status, "unavailable");
      nonAuthorizing(missingHead);
    } finally {
      await missingHeadTable.deleteTable();
    }

    const duplicateReceipt = await repository.commitOperation(op({
      operationId: createA.operationId,
      eventId: "event-attempted-replay",
      staffId: staffA,
      mutationCategory: "profile_update",
      expectedRevision: 1,
      expectedStaffState: "active",
      resultingStaffState: "active"
    }));
    assert.equal(duplicateReceipt.status, "conflict");
    assert.equal(await revision(table), 1);
    assert.equal(
      (await table.getEntity<{ eventId: string }>(
        STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
        "operation-operation-create-a"
      )).eventId,
      createA.eventId
    );
    nonAuthorizing(duplicateReceipt);

    const stale = await repository.commitOperation(op({
      operationId: "stale-operation",
      eventId: "stale-event",
      staffId: staffA,
      mutationCategory: "profile_update",
      expectedRevision: 0,
      expectedStaffState: "active",
      resultingStaffState: "active"
    }));
    assert.equal(stale.status, "rejected");
    assert.equal(stale.reason, "stale_revision");
    assert.equal(await revision(table), 1);
    await assert.rejects(table.getEntity(
      STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
      "operation-stale-operation"
    ));
    nonAuthorizing(stale);

    const invalidGuid = await repository.commitOperation(op({
      operationId: "invalid-guid-operation",
      eventId: "invalid-guid-event",
      staffId: "synthetic-staff-invalid-guid",
      mutationCategory: "binding_change",
      expectedRevision: 1,
      expectedStaffState: "absent",
      resultingStaffState: "absent",
      bindingIdentity: {
        entraTenantId: "not-a-guid",
        entraObjectId: objectId
      },
      bindingTransition: { kind: "acquire" }
    }));
    assert.equal(invalidGuid.status, "invalid_input");
    assert.equal(await revision(table), 1);
    nonAuthorizing(invalidGuid);

    const acquired = await repository.commitOperation(op({
      operationId: "binding-acquire-a",
      eventId: "binding-acquire-event-a",
      staffId: staffA,
      mutationCategory: "binding_change",
      expectedRevision: 1,
      expectedStaffState: "active",
      resultingStaffState: "active",
      bindingIdentity,
      bindingTransition: { kind: "acquire" }
    }));
    assert.equal(acquired.status, "committed");
    assert.equal(acquired.revision, 2);
    nonAuthorizing(acquired);

    const competitor = await repository.commitOperation(op({
      operationId: "binding-acquire-b",
      eventId: "binding-acquire-event-b",
      staffId: "synthetic-staff-b",
      expectedRevision: 2,
      bindingIdentity,
      bindingTransition: { kind: "acquire" }
    }));
    assert.equal(competitor.status, "rejected");
    assert.equal(competitor.reason, "binding_conflict");
    assert.equal(await revision(table), 2);
    await assert.rejects(table.getEntity(
      STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
      "operation-binding-acquire-b"
    ));
    nonAuthorizing(competitor);

    const concurrentRevision = await revision(table);
    const competingBinding = {
      entraTenantId: "33333333-3333-4333-8333-333333333333",
      entraObjectId: "44444444-4444-4444-8444-444444444444"
    };
    const concurrent = await Promise.all([
      repository.commitOperation(op({
        operationId: "concurrent-acquire-c",
        eventId: "concurrent-acquire-event-c",
        staffId: "synthetic-staff-c",
        expectedRevision: concurrentRevision,
        bindingIdentity: competingBinding,
        bindingTransition: { kind: "acquire" }
      })),
      repository.commitOperation(op({
        operationId: "concurrent-acquire-d",
        eventId: "concurrent-acquire-event-d",
        staffId: "synthetic-staff-d",
        expectedRevision: concurrentRevision,
        bindingIdentity: competingBinding,
        bindingTransition: { kind: "acquire" }
      }))
    ]);
    assert.equal(
      concurrent.filter(item => item.status === "committed").length,
      1,
      JSON.stringify(concurrent)
    );
    assert.equal(
      concurrent.filter(item =>
        item.status === "conflict" || item.status === "rejected"
      ).length,
      1,
      JSON.stringify(concurrent)
    );
    concurrent.forEach(nonAuthorizing);
    assert.equal(await revision(table), concurrentRevision + 1);
    const competingOwner = await table.getEntity<{ staffId: string }>(
      STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
      "binding-33333333-3333-4333-8333-333333333333-44444444-4444-4444-8444-444444444444"
    );
    assert.ok(
      competingOwner.staffId === "synthetic-staff-c" ||
        competingOwner.staffId === "synthetic-staff-d"
    );

    const beforeStaleBatch = await revision(table);
    const staleRaceRepo = new StaffOperationCorrelationPrototypeRepository(
      transactionProxy(table, async (actions, submit) => {
        const head = await table.getEntity<{ revision: number }>(
          STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
          STAFF_OPERATION_CORRELATION_PROTOTYPE_HEAD_ROW
        );
        await table.updateEntity(
          {
            partitionKey: STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
            rowKey: STAFF_OPERATION_CORRELATION_PROTOTYPE_HEAD_ROW,
            revision: head.revision + 1,
            state: "active"
          },
          "Replace",
          { etag: head.etag }
        );
        return submit(actions);
      })
    );
    const staleBatch = await staleRaceRepo.commitOperation(op({
      operationId: "etag-rollback-operation",
      eventId: "etag-rollback-event",
      staffId: staffA,
      mutationCategory: "profile_update",
      expectedRevision: beforeStaleBatch,
      expectedStaffState: "active",
      resultingStaffState: "active"
    }));
    assert.equal(staleBatch.status, "conflict");
    assert.equal(await revision(table), beforeStaleBatch + 1);
    await assert.rejects(table.getEntity(
      STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
      "operation-etag-rollback-operation"
    ));
    nonAuthorizing(staleBatch);

    const releaseRevision = await revision(table);
    const release = await repository.commitOperation(op({
      operationId: "binding-release-a",
      eventId: "binding-release-event-a",
      staffId: staffA,
      mutationCategory: "binding_change",
      expectedRevision: releaseRevision,
      expectedStaffState: "active",
      resultingStaffState: "active",
      bindingIdentity,
      bindingTransition: {
        kind: "release",
        expectedOwnerStaffId: staffA
      }
    }));
    assert.equal(release.status, "committed");
    nonAuthorizing(release);

    const releasedEvidence = await repository.inspectOperation({
      operationId: "binding-acquire-a",
      eventId: "binding-acquire-event-a",
      staffId: staffA
    });
    assert.equal(releasedEvidence.status, "historical");
    assert.equal(releasedEvidence.currentBindingEvidence, "released");
    nonAuthorizing(releasedEvidence);

    const releaseEvidence = await repository.inspectOperation({
      operationId: "binding-release-a",
      eventId: "binding-release-event-a",
      staffId: staffA
    });
    assert.equal(releaseEvidence.status, "historical");
    assert.equal(releaseEvidence.receipt?.expectedOwnerStaffId, staffA);
    nonAuthorizing(releaseEvidence);

    const successorRevision = await revision(table);
    const successor = await repository.commitOperation(op({
      operationId: "binding-acquire-successor",
      eventId: "binding-acquire-successor-event",
      staffId: "synthetic-staff-b",
      expectedRevision: successorRevision,
      bindingIdentity,
      bindingTransition: { kind: "acquire" }
    }));
    assert.equal(successor.status, "committed");
    nonAuthorizing(successor);

    const oldOwnerRelease = await repository.commitOperation(op({
      operationId: "former-owner-release-attempt",
      eventId: "former-owner-release-event",
      staffId: staffA,
      mutationCategory: "binding_change",
      expectedRevision: await revision(table),
      expectedStaffState: "active",
      resultingStaffState: "active",
      bindingIdentity,
      bindingTransition: {
        kind: "release",
        expectedOwnerStaffId: staffA
      }
    }));
    assert.equal(oldOwnerRelease.status, "rejected");
    assert.equal(oldOwnerRelease.reason, "binding_conflict");
    nonAuthorizing(oldOwnerRelease);

    const oldEvidence = await repository.inspectOperation({
      operationId: "binding-acquire-a",
      eventId: "binding-acquire-event-a",
      staffId: staffA
    });
    assert.equal(oldEvidence.status, "historical");
    assert.equal(oldEvidence.currentBindingEvidence, "reassigned");
    assert.equal(oldEvidence.staffEventEvidence, "not_independently_read");
    assert.equal(oldEvidence.projectionEvidence, "not_persisted");
    nonAuthorizing(oldEvidence);

    const mismatch = await repository.inspectOperation({
      operationId: "binding-acquire-successor",
      eventId: "mismatched-event-id",
      staffId: "synthetic-staff-b"
    });
    assert.equal(mismatch.status, "contradictory");
    nonAuthorizing(mismatch);

    const staffMismatch = await repository.inspectOperation({
      operationId: "binding-acquire-successor",
      eventId: "binding-acquire-successor-event",
      staffId: "synthetic-staff-c"
    });
    assert.equal(staffMismatch.status, "contradictory");
    nonAuthorizing(staffMismatch);

    const operationMismatch = await repository.inspectOperation({
      operationId: "unrelated-operation-id",
      eventId: "binding-acquire-successor-event",
      staffId: "synthetic-staff-b"
    });
    assert.equal(operationMismatch.status, "missing");
    nonAuthorizing(operationMismatch);

    const successorEvidence = await repository.inspectOperation({
      operationId: "binding-acquire-successor",
      eventId: "binding-acquire-successor-event",
      staffId: "synthetic-staff-b"
    });
    assert.equal(successorEvidence.status, "incomplete");
    assert.equal(successorEvidence.operationEvidence, "verified");
    assert.equal(successorEvidence.currentBindingEvidence, "current");
    nonAuthorizing(successorEvidence);

    const eventId = "separately-persisted-event";
    await eventsTable.createEntity({
      partitionKey: "synthetic-staff-b",
      rowKey: `2025-01-01T00:00:00.000Z__${eventId}`,
      eventId,
      staffId: "synthetic-staff-b",
      type: "staff.created"
    });
    const eventWithoutOperation = await repository.inspectOperation({
      operationId: "binding-acquire-successor",
      eventId,
      staffId: "synthetic-staff-b"
    });
    assert.equal(eventWithoutOperation.status, "contradictory");
    assert.equal(eventWithoutOperation.staffEventEvidence, "not_independently_read");
    nonAuthorizing(eventWithoutOperation);

    const eventOnlyTable = await eventsTable.getEntity<{ eventId: string }>(
      "synthetic-staff-b",
      `2025-01-01T00:00:00.000Z__${eventId}`
    );
    assert.equal(eventOnlyTable.eventId, eventId);
    assert.equal(
      await table.getEntity(
        STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
        `2025-01-01T00:00:00.000Z__${eventId}`
      ).then(() => true, () => false),
      false
    );

    const partitionRollbackRevision = await revision(table);
    const partitionActions: TransactionAction[] = [
      [
        "update",
        {
          partitionKey: STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
          rowKey: STAFF_OPERATION_CORRELATION_PROTOTYPE_HEAD_ROW,
          revision: partitionRollbackRevision + 1,
          state: "active"
        },
        "Replace",
        {
          etag: (await table.getEntity<{ etag?: string }>(
            STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
            STAFF_OPERATION_CORRELATION_PROTOTYPE_HEAD_ROW
          )).etag
        }
      ],
      [
        "create",
        {
          partitionKey: "not-the-prototype-partition",
          rowKey: "synthetic-event",
          eventId: "cross-partition-event"
        }
      ]
    ];
    await assert.rejects(table.submitTransaction(partitionActions));
    assert.equal(await revision(table), partitionRollbackRevision);
    nonAuthorizing(oldEvidence);

    const revokedTable = newTable("StaffCorrRevokedIT");
    await revokedTable.createTable();
    try {
      await revokedTable.createEntity({
        partitionKey: STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
        rowKey: STAFF_OPERATION_CORRELATION_PROTOTYPE_HEAD_ROW,
        revision: 0,
        state: "revoked"
      });
      const revoked = await new StaffOperationCorrelationPrototypeRepository(
        revokedTable
      ).commitOperation(op({
        operationId: "revoked-head-operation",
        eventId: "revoked-head-event",
        staffId: "synthetic-revoked-head"
      }));
      assert.equal(revoked.status, "rejected");
      assert.equal(revoked.reason, "authority_revoked");
      nonAuthorizing(revoked);
    } finally {
      await revokedTable.deleteTable();
    }

    let submitCount = 0;
    const lostAckRepository = new StaffOperationCorrelationPrototypeRepository(
      transactionProxy(table, async (actions, submit) => {
        submitCount++;
        await submit(actions);
        throw new Error("simulated lost acknowledgement");
      })
    );
    const beforeLostAck = await revision(table);
    const lostAck = await lostAckRepository.commitOperation(op({
      operationId: "lost-ack-operation",
      eventId: "lost-ack-event",
      staffId: "synthetic-staff-b",
      mutationCategory: "profile_update",
      expectedRevision: beforeLostAck,
      expectedStaffState: "active",
      resultingStaffState: "active"
    }));
    assert.equal(lostAck.status, "uncertain");
    assert.equal(lostAck.reason, "uncertain_acknowledgement");
    assert.equal(submitCount, 1);
    assert.equal(await revision(table), beforeLostAck + 1);
    nonAuthorizing(lostAck);

    const lostAckInspection = await repository.inspectOperation({
      operationId: "lost-ack-operation",
      eventId: "lost-ack-event",
      staffId: "synthetic-staff-b"
    });
    assert.equal(lostAckInspection.status, "incomplete");
    assert.equal(lostAckInspection.operationEvidence, "verified");
    nonAuthorizing(lostAckInspection);
  } finally {
    await eventsTable.deleteTable();
    await table.deleteTable();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
