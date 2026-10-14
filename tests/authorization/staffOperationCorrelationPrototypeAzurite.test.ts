import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import {
  TableClient,
  type TransactionAction
} from "@azure/data-tables";
import {
  STAFF_EVENT_APPEND_INTENT_SCHEMA_VERSION,
  STAFF_EVENT_APPEND_INTENT_SOURCE
} from "../../src/contracts/staffEventAppendIntent.v1";
import {
  STAFF_EVENT_CORRELATION_EVIDENCE_SCHEMA_VERSION,
  STAFF_EVENT_CORRELATION_EVIDENCE_SOURCE
} from "../../src/contracts/staffEventCorrelationEvidence.v1";
import {
  STAFF_EVENT_APPEND_INTENT_RECORD_MAX_JSON_CHARS,
  STAFF_EVENT_APPEND_INTENT_RECORD_SCHEMA_VERSION,
  STAFF_EVENT_APPEND_INTENT_RECORD_SOURCE,
  staffEventAppendIntentRowKey,
  STAFF_OPERATION_CORRELATION_PROTOTYPE_HEAD_ROW,
  STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
  STAFF_EVENTS_APPEND_OBLIGATION_SCHEMA_VERSION,
  STAFF_EVENTS_APPEND_OBLIGATION_SOURCE,
  StaffOperationCorrelationPrototypeRepository,
  staffEventsAppendObligationRowKey,
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
    let creationBatch: TransactionAction[] = [];
    const repository = new StaffOperationCorrelationPrototypeRepository(
      transactionProxy(table, async (actions, submit) => {
        if (creationBatch.length === 0) creationBatch = actions;
        return submit(actions);
      })
    );
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
    assert.ok(creationBatch.some(action =>
      action[0] === "create" &&
      action[1].rowKey === staffEventsAppendObligationRowKey(createA.operationId)
    ));
    assert.ok(creationBatch.every(action =>
      action[1].partitionKey === STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION
    ));
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
    const createObligation =
      await table.getEntity<{
        schemaVersion: number;
        source: string;
        operationId: string;
        eventId: string;
        staffId: string;
        mutationCategory: string;
        resultingSecurityRevision: number;
        status: string;
      }>(
        STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
        staffEventsAppendObligationRowKey(createA.operationId)
      );
    assert.equal(createObligation.schemaVersion,
      STAFF_EVENTS_APPEND_OBLIGATION_SCHEMA_VERSION);
    assert.equal(createObligation.source, STAFF_EVENTS_APPEND_OBLIGATION_SOURCE);
    assert.equal(createObligation.operationId, createA.operationId);
    assert.equal(createObligation.eventId, createA.eventId);
    assert.equal(createObligation.staffId, staffA);
    assert.equal(createObligation.mutationCategory, "identity_creation");
    assert.equal(createObligation.resultingSecurityRevision, 1);
    assert.equal(createObligation.status, "pending");

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
    assert.equal(
      (await table.getEntity<{ eventId: string }>(
        STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
        staffEventsAppendObligationRowKey(createA.operationId)
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
    await assert.rejects(table.getEntity(
      STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
      staffEventsAppendObligationRowKey("stale-operation")
    ));
    nonAuthorizing(stale);

    const duplicateObligationOperation = "duplicate-obligation-operation";
    const duplicateObligationEvent = "duplicate-obligation-event";
    const duplicateObligationStaff = "synthetic-duplicate-obligation";
    await table.createEntity({
      partitionKey: STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
      rowKey: staffEventsAppendObligationRowKey(
        duplicateObligationOperation
      ),
      schemaVersion: STAFF_EVENTS_APPEND_OBLIGATION_SCHEMA_VERSION,
      source: STAFF_EVENTS_APPEND_OBLIGATION_SOURCE,
      operationId: duplicateObligationOperation,
      eventId: duplicateObligationEvent,
      staffId: duplicateObligationStaff,
      mutationCategory: "identity_creation",
      resultingSecurityRevision: 2,
      status: "pending"
    });
    const beforeDuplicateObligation = await revision(table);
    const duplicateObligation = await repository.commitOperation(op({
      operationId: duplicateObligationOperation,
      eventId: duplicateObligationEvent,
      staffId: duplicateObligationStaff,
      expectedRevision: beforeDuplicateObligation
    }));
    assert.equal(duplicateObligation.status, "conflict");
    assert.equal(await revision(table), beforeDuplicateObligation);
    await assert.rejects(table.getEntity(
      STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
      `staff-${duplicateObligationStaff}`
    ));
    await assert.rejects(table.getEntity(
      STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
      `operation-${duplicateObligationOperation}`
    ));
    assert.equal(
      (await table.getEntity<{ status: string }>(
        STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
        staffEventsAppendObligationRowKey(duplicateObligationOperation)
      )).status,
      "pending"
    );
    nonAuthorizing(duplicateObligation);

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
    for (const [index, operationId] of [
      "concurrent-acquire-c",
      "concurrent-acquire-d"
    ].entries()) {
      if (concurrent[index].status === "committed") {
        assert.equal(
          (await table.getEntity<{ status: string }>(
            STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
            staffEventsAppendObligationRowKey(operationId)
          )).status,
          "pending"
        );
      } else {
        await assert.rejects(table.getEntity(
          STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
          staffEventsAppendObligationRowKey(operationId)
        ));
      }
    }
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
    await assert.rejects(table.getEntity(
      STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
      staffEventsAppendObligationRowKey("etag-rollback-operation")
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

    await table.deleteEntity(
      STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
      staffEventsAppendObligationRowKey("binding-acquire-a")
    );
    const releasedEvidence = await repository.inspectOperation({
      operationId: "binding-acquire-a",
      eventId: "binding-acquire-event-a",
      staffId: staffA
    });
    assert.equal(releasedEvidence.status, "historical");
    assert.equal(releasedEvidence.appendObligationEvidence, "missing");
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
    assert.equal(successorEvidence.appendObligationEvidence, "pending");
    assert.equal(successorEvidence.currentBindingEvidence, "current");
    assert.equal(successorEvidence.staffEventEvidence, "not_independently_read");
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
    assert.equal(lostAckInspection.appendObligationEvidence, "pending");
    assert.equal(lostAckInspection.staffEventEvidence, "not_independently_read");
    nonAuthorizing(lostAckInspection);

    const malformedObligation =
      await table.getEntity<{
        partitionKey: string;
        rowKey: string;
        schemaVersion: number;
        source: string;
        operationId: string;
        eventId: string;
        staffId: string;
        mutationCategory: string;
        resultingSecurityRevision: number;
        status: string;
        etag?: string;
      }>(
        STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
        staffEventsAppendObligationRowKey("lost-ack-operation")
      );
    await table.updateEntity(
      {
        partitionKey: malformedObligation.partitionKey,
        rowKey: malformedObligation.rowKey,
        schemaVersion: malformedObligation.schemaVersion,
        source: malformedObligation.source,
        operationId: malformedObligation.operationId,
        eventId: malformedObligation.eventId,
        staffId: malformedObligation.staffId,
        mutationCategory: malformedObligation.mutationCategory,
        resultingSecurityRevision:
          malformedObligation.resultingSecurityRevision,
        status: "appended"
      },
      "Replace",
      { etag: malformedObligation.etag }
    );
    const malformedEvidence = await repository.inspectOperation({
      operationId: "lost-ack-operation",
      eventId: "lost-ack-event",
      staffId: "synthetic-staff-b"
    });
    assert.equal(malformedEvidence.status, "contradictory");
    assert.equal(malformedEvidence.appendObligationEvidence, "contradictory");
    assert.equal(
      malformedEvidence.staffEventEvidence,
      "not_independently_read"
    );
    nonAuthorizing(malformedEvidence);

    await intentScenarios();
  } finally {
    await eventsTable.deleteTable();
    await table.deleteTable();
  }
}

function intentFor(
  operationId: string,
  staffId: string,
  expectedRevision: number,
  overrides: Record<string, unknown> = {},
  correlationOverrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    schemaVersion: STAFF_EVENT_APPEND_INTENT_SCHEMA_VERSION,
    sourceIdentity: STAFF_EVENT_APPEND_INTENT_SOURCE,
    event: {
      eventId: `event-${operationId}`,
      staffId,
      type: "staff.created",
      occurredAt: "2026-10-15T12:00:00.000Z",
      actorId: "synthetic-actor",
      data: { displayName: "Synthetic Staff" }
    },
    correlation: {
      schemaVersion: STAFF_EVENT_CORRELATION_EVIDENCE_SCHEMA_VERSION,
      sourceIdentity: STAFF_EVENT_CORRELATION_EVIDENCE_SOURCE,
      evidenceProvenance: "writer_supplied_metadata",
      operationId,
      eventId: `event-${operationId}`,
      staffId,
      mutationCategory: "identity_creation",
      expectedSecurityRevision: expectedRevision,
      resultingSecurityRevision: expectedRevision + 1,
      previousStaffState: "absent",
      resultingStaffState: "active",
      ...correlationOverrides
    },
    ...overrides
  };
}

async function intentScenarios(): Promise<void> {
  const t = newTable("StaffCorrIntentIT");
  await t.createTable();
  try {
    let submits = 0;
    let lastBatch: TransactionAction[] = [];
    let beforeSubmit: (() => Promise<void>) | null = null;
    const repo = new StaffOperationCorrelationPrototypeRepository(
      transactionProxy(t, async (actions, submit) => {
        submits++;
        lastBatch = actions;
        if (beforeSubmit) await beforeSubmit();
        return submit(actions);
      })
    );
    const plain = new StaffOperationCorrelationPrototypeRepository(t);
    assert.equal(await repo.initializeAuthorityHead(), "initialized");
    const missing = async (rk: string): Promise<boolean> => {
      try {
        await t.getEntity(STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION, rk);
        return false;
      } catch (error) {
        return (error as { statusCode?: number }).statusCode === 404;
      }
    };
    const noRows = async (operationId: string): Promise<void> => {
      assert.ok(await missing(`operation-${operationId}`));
      assert.ok(await missing(staffEventsAppendObligationRowKey(operationId)));
      assert.ok(await missing(staffEventAppendIntentRowKey(operationId)));
    };
    const intentOp = (
      operationId: string,
      staffId: string,
      expected: number,
      intent: unknown
    ) => op({
      operationId,
      eventId: `event-${operationId}`,
      staffId,
      expectedRevision: expected,
      appendIntent: intent
    });

    // Atomic creation of receipt, obligation, and immutable intent.
    const rev0 = await revision(t);
    const okIntent = intentFor("intent-ok", "synthetic-intent-a", rev0);
    const ok = await repo.commitOperation(
      intentOp("intent-ok", "synthetic-intent-a", rev0, okIntent)
    );
    assert.equal(ok.status, "committed");
    nonAuthorizing(ok);
    assert.equal(submits, 1);
    assert.ok(lastBatch.length <= 100);
    assert.ok(lastBatch.every(a =>
      a[1].partitionKey === STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION));
    assert.equal(lastBatch.filter(a =>
      a[0] === "create" && a[1].rowKey === staffEventAppendIntentRowKey("intent-ok")
    ).length, 1);
    const stored = await t.getEntity<Record<string, unknown>>(
      STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
      staffEventAppendIntentRowKey("intent-ok")
    );
    assert.equal(stored.operationId, "intent-ok");
    assert.equal(stored.eventId, "event-intent-ok");
    assert.equal(stored.staffId, "synthetic-intent-a");
    assert.equal(stored.mutationCategory, "identity_creation");
    assert.equal(stored.resultingSecurityRevision, rev0 + 1);
    assert.equal(stored.schemaVersion, STAFF_EVENT_APPEND_INTENT_RECORD_SCHEMA_VERSION);
    assert.equal(stored.source, STAFF_EVENT_APPEND_INTENT_RECORD_SOURCE);
    assert.equal("status" in stored, false);
    const storedIntent = JSON.parse(String(stored.intentJson)) as {
      event: unknown;
      correlation: { operationId: string };
    };
    assert.deepEqual(storedIntent.event, (okIntent as { event: unknown }).event);
    assert.equal(storedIntent.correlation.operationId, "intent-ok");
    assert.ok(String(stored.intentJson).length <=
      STAFF_EVENT_APPEND_INTENT_RECORD_MAX_JSON_CHARS);

    const okInspection = await plain.inspectOperation({ operationId: "intent-ok" });
    assert.equal(okInspection.appendIntentEvidence, "recorded");
    assert.equal(okInspection.receipt?.appendIntentRequirement, "required");
    assert.equal(okInspection.appendObligationEvidence, "pending");
    assert.equal(okInspection.status, "incomplete");
    assert.equal(okInspection.staffEventEvidence, "not_independently_read");
    nonAuthorizing(okInspection);

    // Synthetic receipt tampering: only the expectation marker changes.
    const rewriteReceiptRequirement = async (
      operationId: string,
      requirement: string | null
    ): Promise<void> => {
      const row = await t.getEntity<Record<string, unknown> & { etag: string }>(
        STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
        `operation-${operationId}`
      );
      const {
        etag,
        timestamp: _timestamp,
        appendIntentRequirement: _previousRequirement,
        ...fields
      } = row;
      await t.updateEntity(
        {
          ...fields,
          ...(requirement === null
            ? {}
            : { appendIntentRequirement: requirement })
        } as never,
        "Replace",
        { etag }
      );
    };

    // A stored intent contradicts an explicit not-required receipt.
    await rewriteReceiptRequirement("intent-ok", "not_required");
    const unexpectedIntent = await plain.inspectOperation({
      operationId: "intent-ok"
    });
    assert.equal(unexpectedIntent.status, "contradictory");
    assert.equal(unexpectedIntent.appendIntentEvidence, "contradictory");
    nonAuthorizing(unexpectedIntent);

    // Unknown markers are rejected, never interpreted as legacy.
    await rewriteReceiptRequirement("intent-ok", "unsupported-marker");
    const malformedRequirement = await plain.inspectOperation({
      operationId: "intent-ok"
    });
    assert.equal(malformedRequirement.status, "contradictory");
    nonAuthorizing(malformedRequirement);

    // Restore the genuine receipt expectation for subsequent scenarios.
    await rewriteReceiptRequirement("intent-ok", "required");
    const restoredRequirement = await plain.inspectOperation({
      operationId: "intent-ok"
    });
    assert.equal(restoredRequirement.appendIntentEvidence, "recorded");
    nonAuthorizing(restoredRequirement);

    // An explicit undefined intent cannot silently become a legacy operation.
    const beforeUndefined = submits;
    const rejectedUndefined = await repo.commitOperation(op({
      operationId: "intent-explicit-undefined",
      eventId: "event-intent-explicit-undefined",
      staffId: "synthetic-intent-undefined",
      expectedRevision: await revision(t),
      appendIntent: undefined
    }));
    assert.equal(rejectedUndefined.status, "invalid_input");
    assert.equal(submits, beforeUndefined);
    await noRows("intent-explicit-undefined");

    // Legacy metadata-only operation stays recognizable; absence is not success.
    const legacy = await plain.commitOperation(op({
      operationId: "intent-legacy",
      eventId: "event-intent-legacy",
      staffId: "synthetic-intent-legacy",
      expectedRevision: await revision(t)
    }));
    assert.equal(legacy.status, "committed");
    assert.ok(await missing(staffEventAppendIntentRowKey("intent-legacy")));
    const legacyInspection = await plain.inspectOperation({ operationId: "intent-legacy" });
    assert.equal(legacyInspection.appendIntentEvidence, "not_required");
    assert.equal(legacyInspection.receipt?.appendIntentRequirement, "not_required");
    assert.equal(legacyInspection.appendObligationEvidence, "pending");
    assert.equal(legacyInspection.staffEventEvidence, "not_independently_read");

    // Simulate a historical receipt that predates the expectation marker.
    await rewriteReceiptRequirement("intent-legacy", null);
    const historical = await plain.inspectOperation({
      operationId: "intent-legacy"
    });
    assert.equal(historical.receipt?.appendIntentRequirement, undefined);
    assert.equal(historical.appendIntentEvidence, "legacy_unclassified");
    assert.equal(historical.staffEventEvidence, "not_independently_read");
    nonAuthorizing(historical);

    // Invalid, mismatched, oversized, and hostile intents never reach storage.
    const base = await revision(t);
    const submitsBefore = submits;
    const bad: Array<[string, unknown]> = [
      ["bad-event", intentFor("bad-event", "synthetic-bad", base, {
        event: { ...(intentFor("bad-event", "synthetic-bad", base).event as object), eventId: "other-event" }
      })],
      ["bad-staff", intentFor("bad-staff", "other-staff", base)],
      ["bad-rev", intentFor("bad-rev", "synthetic-bad", base + 5, {}, {
        expectedSecurityRevision: base + 5, resultingSecurityRevision: base + 6
      })],
      ["bad-state", intentFor("bad-state", "synthetic-bad", base, {}, { previousStaffState: "active" })],
      ["bad-binding", intentFor("bad-binding", "synthetic-bad", base, {}, {
        binding: { identity: bindingIdentity, transition: "acquire" }
      })],
      ["bad-category", intentFor("bad-category", "synthetic-bad", base, {}, { mutationCategory: "profile_update" })],
      ["bad-schema", intentFor("bad-schema", "synthetic-bad", base, { schemaVersion: 2 })],
      ["bad-oversized", intentFor("bad-oversized", "synthetic-bad", base, {
        event: {
          ...(intentFor("bad-oversized", "synthetic-bad", base).event as object),
          data: { displayName: "x".repeat(20000) }
        }
      })],
      ["bad-null", null],
      ["bad-getter", Object.defineProperty({}, "schemaVersion", {
        enumerable: true, get() { throw new Error("boom"); }
      })]
    ];
    for (const [id, intent] of bad) {
      const r = await repo.commitOperation(intentOp(id, "synthetic-bad", base, intent));
      assert.equal(r.status, "invalid_input", id);
      assert.equal(r.reason, "invalid_input", id);
      nonAuthorizing(r);
      await noRows(id);
    }
    assert.equal(submits, submitsBefore);
    assert.equal(await revision(t), base);

    // Stale ETag: the whole batch, including the intent, rolls back.
    beforeSubmit = async () => {
      const head = await t.getEntity<{ etag: string }>(
        STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
        STAFF_OPERATION_CORRELATION_PROTOTYPE_HEAD_ROW
      );
      await t.updateEntity({
        partitionKey: STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
        rowKey: STAFF_OPERATION_CORRELATION_PROTOTYPE_HEAD_ROW,
        revision: base,
        state: "active"
      }, "Replace", { etag: head.etag });
    };
    const stale = await repo.commitOperation(
      intentOp("intent-stale", "synthetic-stale", base, intentFor("intent-stale", "synthetic-stale", base))
    );
    beforeSubmit = null;
    assert.equal(stale.status, "conflict");
    assert.equal(stale.reason, "transaction_conflict");
    await noRows("intent-stale");
    assert.ok(await missing("staff-synthetic-stale"));

    // Duplicate intent key rejects the complete transaction.
    await t.createEntity({
      partitionKey: STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
      rowKey: staffEventAppendIntentRowKey("intent-dup"),
      marker: "preexisting"
    });
    const dupBase = await revision(t);
    const dup = await repo.commitOperation(
      intentOp("intent-dup", "synthetic-dup", dupBase, intentFor("intent-dup", "synthetic-dup", dupBase))
    );
    assert.equal(dup.status, "conflict");
    assert.ok(await missing("operation-intent-dup"));
    assert.ok(await missing(staffEventsAppendObligationRowKey("intent-dup")));
    assert.ok(await missing("staff-synthetic-dup"));
    assert.equal(await revision(t), dupBase);
    assert.equal(
      (await t.getEntity<{ marker: string }>(
        STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
        staffEventAppendIntentRowKey("intent-dup")
      )).marker,
      "preexisting"
    );

    // Replay of an operation ID with a different intent cannot alter the original.
    const replayBase = await revision(t);
    const replay = await repo.commitOperation(intentOp(
      "intent-ok", "synthetic-intent-a2", replayBase,
      intentFor("intent-ok", "synthetic-intent-a2", replayBase, {
        event: {
          ...(intentFor("intent-ok", "synthetic-intent-a2", replayBase).event as object),
          data: { displayName: "Changed" }
        }
      })
    ));
    assert.equal(replay.status, "conflict");
    assert.equal(await revision(t), replayBase);
    const afterReplay = await t.getEntity<Record<string, unknown>>(
      STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
      staffEventAppendIntentRowKey("intent-ok")
    );
    assert.equal(afterReplay.intentJson, stored.intentJson);
    // No public update/delete path for intents exists on the repository.
    const methods = Object.getOwnPropertyNames(
      StaffOperationCorrelationPrototypeRepository.prototype
    );
    assert.ok(!methods.some(m => /update|delete|complete|dispatch|retry/i.test(m)));

    // Lost acknowledgement: exactly one submit, no retry, still non-authorizing.
    const lostRepo = new StaffOperationCorrelationPrototypeRepository(
      transactionProxy(t, async (actions, submit) => {
        submits++;
        await submit(actions);
        throw new Error("simulated lost acknowledgement");
      })
    );
    const lostBase = await revision(t);
    const submitsBeforeLost = submits;
    const lost = await lostRepo.commitOperation(
      intentOp("intent-lost", "synthetic-lost", lostBase, intentFor("intent-lost", "synthetic-lost", lostBase))
    );
    assert.equal(lost.status, "uncertain");
    assert.equal(lost.retryPermitted, false);
    assert.equal(submits, submitsBeforeLost + 1);
    assert.equal(
      (await plain.inspectOperation({ operationId: "intent-lost" })).appendIntentEvidence,
      "recorded"
    );

    // Missing rows and read failures never read as persisted events.
    await t.deleteEntity(
      STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
      staffEventAppendIntentRowKey("intent-lost")
    );
    const removed = await plain.inspectOperation({ operationId: "intent-lost" });
    assert.equal(removed.appendIntentEvidence, "contradictory");
    assert.equal(removed.status, "contradictory");
    assert.equal(removed.staffEventEvidence, "not_independently_read");

    const failing = new StaffOperationCorrelationPrototypeRepository(
      new Proxy(t, {
        get(target, property) {
          if (property === "getEntity") {
            return async (pk: string, rk: string) => {
              if (rk === staffEventAppendIntentRowKey("intent-ok")) {
                throw Object.assign(new Error("outage"), { statusCode: 500 });
              }
              return target.getEntity(pk, rk);
            };
          }
          const value = Reflect.get(target, property, target) as unknown;
          return typeof value === "function" ? value.bind(target) : value;
        }
      })
    );
    const failed = await failing.inspectOperation({ operationId: "intent-ok" });
    assert.equal(failed.status, "unavailable");
    assert.equal(failed.appendIntentEvidence, "unavailable");

    // Tampered or non-conforming intent rows are contradictory, not recorded.
    const tamper = async (
      changes: Record<string, unknown>
    ): Promise<string> => {
      const row = await t.getEntity<Record<string, unknown> & { etag: string }>(
        STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
        staffEventAppendIntentRowKey("intent-ok")
      );
      const { etag, timestamp: _ts, ...rest } = row as Record<string, unknown> & { etag: string; timestamp?: unknown };
      await t.updateEntity({ ...rest, ...changes } as never, "Replace", { etag });
      return (await plain.inspectOperation({ operationId: "intent-ok" })).appendIntentEvidence;
    };
    assert.equal(await tamper({ eventId: "tampered" }), "contradictory");
    assert.equal(await tamper({ eventId: "event-intent-ok", intentJson: "{not json" }), "contradictory");
    assert.equal(await tamper({ intentJson: String(stored.intentJson), source: "other" }), "contradictory");
    const originalIntent = JSON.parse(String(stored.intentJson)) as Record<string, unknown>;
    const alteredStates = JSON.parse(JSON.stringify(originalIntent)) as { correlation: Record<string, unknown> };
    alteredStates.correlation.previousStaffState = "active";
    assert.equal(await tamper({ intentJson: JSON.stringify(alteredStates) }), "contradictory");
    const alteredResult = JSON.parse(JSON.stringify(originalIntent)) as { correlation: Record<string, unknown> };
    alteredResult.correlation.resultingStaffState = "revoked";
    assert.equal(await tamper({ intentJson: JSON.stringify(alteredResult) }), "contradictory");
    assert.equal(await tamper({ source: STAFF_EVENT_APPEND_INTENT_RECORD_SOURCE, intentJson: String(stored.intentJson) }), "recorded");

    // An intent without its pending obligation is inconsistent.
    await t.deleteEntity(
      STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
      staffEventsAppendObligationRowKey("intent-ok")
    );
    const orphan = await plain.inspectOperation({ operationId: "intent-ok" });
    assert.equal(orphan.status, "contradictory");
    assert.equal(orphan.appendIntentEvidence, "contradictory");
    nonAuthorizing(orphan);
  } finally {
    await t.deleteTable();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
