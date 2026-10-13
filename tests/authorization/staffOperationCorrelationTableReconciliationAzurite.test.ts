import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  TableClient,
  type TransactionAction
} from "@azure/data-tables";
import {
  type StaffEvent
} from "../../src/domain/staff/projectStaffDirectory";
import {
  type StaffWriterCoordinationRequest
} from "../../src/domain/staff/staffWriterCoordinationContract";
import {
  STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
  StaffOperationCorrelationPrototypeRepository
} from "../../src/repositories/staffOperationCorrelationPrototypeRepository";
import {
  inspectStaffOperationCorrelationFromTables
} from "../../src/services/staff/inspectStaffOperationCorrelationFromTables";

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

const staffId = "synthetic-staff-1342";
const tenantId = "11111111-1111-4111-8111-111111111111";
const objectId = "22222222-2222-4222-8222-222222222222";
const bindingIdentity = {
  entraTenantId: tenantId,
  entraObjectId: objectId
};
const createOperationId = "synthetic-create-operation";
const createEventId = "synthetic-create-event";
const bindingOperationId = "synthetic-binding-operation";
const bindingEventId = "synthetic-binding-event";

type Fixture = {
  securityTable: TableClient;
  staffEventsTable: TableClient;
  repository: StaffOperationCorrelationPrototypeRepository;
  request: StaffWriterCoordinationRequest;
};

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
  correlation?: {
    authoritative: false;
    executionPermitted: false;
    retryPermitted: false;
  };
}): void {
  assert.equal(result.authoritative, false);
  assert.equal(result.executionPermitted, false);
  assert.equal(result.retryPermitted, false);
  if (result.correlation) {
    assert.equal(result.correlation.authoritative, false);
    assert.equal(result.correlation.executionPermitted, false);
    assert.equal(result.correlation.retryPermitted, false);
  }
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

function eventEntity(event: StaffEvent): {
  partitionKey: string;
  rowKey: string;
  [key: string]: unknown;
} {
  return {
    partitionKey: event.staffId,
    rowKey: `${event.occurredAt}__${event.eventId}`,
    eventId: event.eventId,
    staffId: event.staffId,
    type: event.type,
    occurredAt: event.occurredAt,
    actorId: event.actorId,
    dataJson: JSON.stringify(event.data)
  };
}

function baseEvents(): [StaffEvent, StaffEvent] {
  return [
    {
      eventId: createEventId,
      staffId,
      type: "staff.created",
      occurredAt: "2026-10-01T00:00:00.000Z",
      actorId: "synthetic-admin",
      data: { displayName: "Synthetic Staff", status: "active" }
    },
    {
      eventId: bindingEventId,
      staffId,
      type: "staff.updated",
      occurredAt: "2026-10-01T00:01:00.000Z",
      actorId: "synthetic-admin",
      data: {
        entraTenantId: tenantId,
        entraObjectId: objectId
      }
    }
  ];
}

async function createFixture(options: {
  appendBindingEvent?: boolean;
  lostBindingAck?: boolean;
} = {}): Promise<Fixture> {
  const securityTable = newTable("StaffReconSecurityIT");
  const staffEventsTable = newTable("StaffReconEventsIT");
  await securityTable.createTable();
  await staffEventsTable.createTable();

  const repository = new StaffOperationCorrelationPrototypeRepository(
    securityTable
  );
  assert.equal(await repository.initializeAuthorityHead(), "initialized");
  const initial = await repository.commitOperation({
    operationId: createOperationId,
    eventId: createEventId,
    staffId,
    mutationCategory: "identity_creation",
    expectedRevision: 0,
    expectedStaffState: "absent",
    resultingStaffState: "active"
  });
  assert.equal(initial.status, "committed");

  const bindingRequest = {
    operationId: bindingOperationId,
    eventId: bindingEventId,
    staffId,
    mutationCategory: "binding_change",
    expectedRevision: 1,
    expectedStaffState: "active" as const,
    resultingStaffState: "active" as const,
    bindingIdentity,
    bindingTransition: { kind: "acquire" as const }
  };
  const bindingRepository = options.lostBindingAck
    ? new StaffOperationCorrelationPrototypeRepository(
        transactionProxy(securityTable, async (actions, submit) => {
          await submit(actions);
          throw new Error("simulated lost acknowledgement");
        })
      )
    : repository;
  const bindingCommit = await bindingRepository.commitOperation(
    bindingRequest
  );
  assert.equal(
    bindingCommit.status,
    options.lostBindingAck ? "uncertain" : "committed"
  );

  await staffEventsTable.createEntity(eventEntity(baseEvents()[0]));
  if (options.appendBindingEvent !== false) {
    await staffEventsTable.createEntity(eventEntity(baseEvents()[1]));
  }

  return {
    securityTable,
    staffEventsTable,
    repository,
    request: {
      mutationCategory: "binding_change",
      operationId: bindingOperationId,
      eventId: bindingEventId,
      expectedSecurityRevision: 1,
      expectedStaffId: staffId,
      expectedStaffState: "active",
      targetStaffState: "active",
      bindingIdentity
    }
  };
}

async function withFixture(
  action: (fixture: Fixture) => Promise<void>,
  options: Parameters<typeof createFixture>[0] = {}
): Promise<void> {
  const fixture = await createFixture(options);
  try {
    await action(fixture);
  } finally {
    await fixture.staffEventsTable.deleteTable();
    await fixture.securityTable.deleteTable();
  }
}

async function main(): Promise<void> {
  await withFixture(async fixture => {
    const result = await inspectStaffOperationCorrelationFromTables(
      fixture.request,
      fixture.securityTable,
      fixture.staffEventsTable
    );
    assert.equal(result.status, "incomplete");
    assert.equal(result.sources.securityReceipt, "observed");
    assert.equal(result.sources.staffEvents, "observed");
    assert.equal(result.sources.projection, "derived");
    assert.equal(result.projectionLastEventId, bindingEventId);
    assert.ok(result.observedEventIds.includes(bindingEventId));
    assert.equal(result.securityReceiptRecordId, `operation-${bindingOperationId}`);
    assert.ok(result.correlation.missingEvidence.includes("staffEvent.operationId"));
    assert.ok(result.correlation.missingEvidence.includes(
      "staffEvent.expectedSecurityRevision"
    ));
    assert.ok(
      result.correlation.missingEvidence.includes("projection.record"),
      JSON.stringify(result.correlation)
    );
    assert.equal(result.correlation.persistenceEvidence, "incomplete");
    assert.notEqual(result.correlation.status, "complete");
    nonAuthorizing(result);
  });

  await withFixture(async fixture => {
    const noEvent = await inspectStaffOperationCorrelationFromTables(
      fixture.request,
      fixture.securityTable,
      fixture.staffEventsTable
    );
    assert.equal(noEvent.status, "incomplete");
    assert.equal(noEvent.sources.securityReceipt, "observed");
    assert.equal(noEvent.sources.staffEvents, "observed");
    assert.equal(noEvent.sources.projection, "derived");
    assert.ok(noEvent.correlation.missingEvidence.includes("staffEvent.record"));
    assert.equal(noEvent.correlation.persistenceEvidence, "incomplete");
    nonAuthorizing(noEvent);
  }, { appendBindingEvent: false });

  await withFixture(async fixture => {
    const missingReceiptRequest = {
      ...fixture.request,
      operationId: "operation-receipt-not-present"
    };
    const result = await inspectStaffOperationCorrelationFromTables(
      missingReceiptRequest,
      fixture.securityTable,
      fixture.staffEventsTable
    );
    assert.equal(result.status, "stale_historical");
    assert.equal(result.sources.securityReceipt, "missing");
    assert.equal(result.sources.staffEvents, "observed");
    assert.equal(result.correlation.persistenceEvidence, "incomplete");
    nonAuthorizing(result);
  });

  await withFixture(async fixture => {
    const eventMismatch = await inspectStaffOperationCorrelationFromTables(
      { ...fixture.request, eventId: "different-request-event" },
      fixture.securityTable,
      fixture.staffEventsTable
    );
    assert.equal(eventMismatch.status, "contradictory");
    assert.ok(eventMismatch.correlation.missingEvidence.includes(
      "securityOperation.eventId_mismatch"
    ));
    nonAuthorizing(eventMismatch);

    const staffMismatch = await inspectStaffOperationCorrelationFromTables(
      { ...fixture.request, expectedStaffId: "synthetic-other-staff" },
      fixture.securityTable,
      fixture.staffEventsTable
    );
    assert.equal(staffMismatch.status, "contradictory");
    assert.ok(staffMismatch.correlation.missingEvidence.includes(
      "securityOperation.staffId_mismatch"
    ));
    nonAuthorizing(staffMismatch);
  });

  await withFixture(async fixture => {
    const categoryMismatch = await inspectStaffOperationCorrelationFromTables(
      {
        ...fixture.request,
        mutationCategory: "profile_update",
        bindingIdentity: null
      },
      fixture.securityTable,
      fixture.staffEventsTable
    );
    assert.equal(categoryMismatch.status, "contradictory");
    assert.ok(categoryMismatch.correlation.missingEvidence.includes(
      "securityOperation.mutationCategory_mismatch"
    ));
    assert.ok(categoryMismatch.correlation.missingEvidence.includes(
      "staffEvent.mutationCategory_conflicts_with_event"
    ));
    nonAuthorizing(categoryMismatch);
  });

  await withFixture(async fixture => {
    const staleRevision = await inspectStaffOperationCorrelationFromTables(
      {
        ...fixture.request,
        expectedSecurityRevision: 0
      },
      fixture.securityTable,
      fixture.staffEventsTable
    );
    assert.equal(staleRevision.status, "stale_historical");
    assert.ok(staleRevision.correlation.missingEvidence.includes(
      "securityOperation.expectedSecurityRevision_stale"
    ));
    nonAuthorizing(staleRevision);
  });

  await withFixture(async fixture => {
    const laterEvent: StaffEvent = {
      eventId: "synthetic-later-profile-event",
      staffId,
      type: "staff.updated",
      occurredAt: "2026-10-01T00:02:00.000Z",
      actorId: "synthetic-admin",
      data: { displayName: "Synthetic Staff Updated" }
    };
    await fixture.staffEventsTable.createEntity(eventEntity(laterEvent));
    const result = await inspectStaffOperationCorrelationFromTables(
      fixture.request,
      fixture.securityTable,
      fixture.staffEventsTable
    );
    assert.equal(result.projectionLastEventId, laterEvent.eventId);
    assert.equal(result.status, "stale_historical");
    assert.equal(result.correlation.status, "incomplete");
    assert.equal(result.correlation.persistenceEvidence, "incomplete");
    nonAuthorizing(result);
  });

  await withFixture(async fixture => {
    const release = await fixture.repository.commitOperation({
      operationId: "synthetic-release-operation",
      eventId: "synthetic-release-event",
      staffId,
      mutationCategory: "binding_change",
      expectedRevision: 2,
      expectedStaffState: "active",
      resultingStaffState: "active",
      bindingIdentity,
      bindingTransition: {
        kind: "release",
        expectedOwnerStaffId: staffId
      }
    });
    assert.equal(release.status, "committed");
    const result = await inspectStaffOperationCorrelationFromTables(
      fixture.request,
      fixture.securityTable,
      fixture.staffEventsTable
    );
    assert.equal(result.status, "stale_historical");
    assert.ok(result.correlation.missingEvidence.includes("bindingOwnership.released"));
    nonAuthorizing(result);
  });

  await withFixture(async fixture => {
    const release = await fixture.repository.commitOperation({
      operationId: "synthetic-release-malformed-owner",
      eventId: "synthetic-release-malformed-owner-event",
      staffId,
      mutationCategory: "binding_change",
      expectedRevision: 2,
      expectedStaffState: "active",
      resultingStaffState: "active",
      bindingIdentity,
      bindingTransition: {
        kind: "release",
        expectedOwnerStaffId: staffId
      }
    });
    assert.equal(release.status, "committed");
    const bindingRowKey = `binding-${tenantId}-${objectId}`;
    await fixture.securityTable.updateEntity(
      {
        partitionKey: STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
        rowKey: bindingRowKey,
        releasedByStaffId: "malformed owner!"
      },
      "Merge"
    );
    const result = await inspectStaffOperationCorrelationFromTables(
      fixture.request,
      fixture.securityTable,
      fixture.staffEventsTable
    );
    assert.equal(result.status, "contradictory");
    assert.equal(result.sources.bindingOwnership, "malformed");
    nonAuthorizing(result);
  });

  await withFixture(async fixture => {
    await fixture.repository.commitOperation({
      operationId: "synthetic-release-before-reassign",
      eventId: "synthetic-release-before-reassign-event",
      staffId,
      mutationCategory: "binding_change",
      expectedRevision: 2,
      expectedStaffState: "active",
      resultingStaffState: "active",
      bindingIdentity,
      bindingTransition: {
        kind: "release",
        expectedOwnerStaffId: staffId
      }
    });
    await fixture.repository.commitOperation({
      operationId: "synthetic-successor-create",
      eventId: "synthetic-successor-create-event",
      staffId: "synthetic-successor-staff",
      mutationCategory: "identity_creation",
      expectedRevision: 3,
      expectedStaffState: "absent",
      resultingStaffState: "active"
    });
    await fixture.repository.commitOperation({
      operationId: "synthetic-successor-binding",
      eventId: "synthetic-successor-binding-event",
      staffId: "synthetic-successor-staff",
      mutationCategory: "binding_change",
      expectedRevision: 4,
      expectedStaffState: "active",
      resultingStaffState: "active",
      bindingIdentity,
      bindingTransition: { kind: "acquire" }
    });
    const result = await inspectStaffOperationCorrelationFromTables(
      fixture.request,
      fixture.securityTable,
      fixture.staffEventsTable
    );
    assert.notEqual(result.status, "complete");
    assert.ok(result.correlation.missingEvidence.includes(
      "bindingOwnership.staffId_mismatch"
    ));
    nonAuthorizing(result);
  });

  await withFixture(async fixture => {
    const unavailableSecurity = new Proxy(fixture.securityTable, {
      get(target, property) {
        if (property === "getEntity") {
          return async () => {
            const error = new Error("synthetic security source unavailable");
            Object.assign(error, { statusCode: 503 });
            throw error;
          };
        }
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
    const securityResult = await inspectStaffOperationCorrelationFromTables(
      fixture.request,
      unavailableSecurity,
      fixture.staffEventsTable
    );
    assert.equal(securityResult.status, "unavailable");
    assert.equal(securityResult.sources.securityReceipt, "unavailable");
    nonAuthorizing(securityResult);

    const unavailableEvents = new Proxy(fixture.staffEventsTable, {
      get(target, property) {
        if (property === "listEntities") {
          return () => {
            const error = new Error("synthetic StaffEvents source unavailable");
            Object.assign(error, { statusCode: 503 });
            throw error;
          };
        }
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
    const eventsResult = await inspectStaffOperationCorrelationFromTables(
      fixture.request,
      fixture.securityTable,
      unavailableEvents
    );
    assert.equal(eventsResult.status, "unavailable");
    assert.equal(eventsResult.sources.staffEvents, "unavailable");
    assert.equal(eventsResult.sources.projection, "unavailable");
    nonAuthorizing(eventsResult);
  });

  await withFixture(async fixture => {
    const result = await inspectStaffOperationCorrelationFromTables(
      fixture.request,
      fixture.securityTable,
      fixture.staffEventsTable
    );
    assert.equal(result.sources.securityReceipt, "observed");
    assert.equal(result.status, "incomplete");
    assert.ok(result.correlation.missingEvidence.includes("staffEvent.operationId"));
    nonAuthorizing(result);
  }, { lostBindingAck: true });

  await withFixture(async fixture => {
    const malformed = await fixture.securityTable.getEntity<{
      operationId: string;
      partitionKey: string;
      rowKey: string;
    }>(
      STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
      `operation-${bindingOperationId}`
    );
    await fixture.securityTable.updateEntity(
      { ...malformed, operationId: "different-stored-operation" },
      "Merge"
    );
    const result = await inspectStaffOperationCorrelationFromTables(
      fixture.request,
      fixture.securityTable,
      fixture.staffEventsTable
    );
    assert.equal(result.status, "contradictory");
    assert.equal(result.sources.securityReceipt, "malformed");
    assert.equal(result.correlation.status, "contradictory");
    nonAuthorizing(result);
  });

  await withFixture(async fixture => {
    await fixture.staffEventsTable.createEntity({
      partitionKey: staffId,
      rowKey: `2026-10-01T00:01:30.000Z__${bindingEventId}-malformed`,
      eventId: `${bindingEventId}-malformed`,
      staffId,
      type: "staff.updated",
      occurredAt: "2026-10-01T00:01:30.000Z",
      actorId: "synthetic-admin",
      dataJson: "{"
    });
    const result = await inspectStaffOperationCorrelationFromTables(
      fixture.request,
      fixture.securityTable,
      fixture.staffEventsTable
    );
    assert.equal(result.status, "contradictory");
    assert.equal(result.sources.staffEvents, "malformed");
    assert.equal(result.sources.projection, "malformed");
    nonAuthorizing(result);
  });

  const malformedReceiptCases: Array<{
    name: string;
    changes: Record<string, unknown>;
  }> = [
    { name: "non-committed", changes: { outcome: "rejected" } },
    {
      name: "negative expected revision",
      changes: { expectedRevision: -1, resultingRevision: 0 }
    },
    { name: "negative resulting revision", changes: { resultingRevision: -1 } },
    { name: "revision gap", changes: { resultingRevision: 3 } },
    {
      name: "operation row identity mismatch",
      changes: { operationId: "different-operation" }
    },
    { name: "unsupported mutation", changes: { mutationCategory: "unknown" } },
    {
      name: "invalid state transition",
      changes: {
        mutationCategory: "profile_update",
        previousStaffState: "revoked",
        resultingStaffState: "active",
        tenantId: undefined,
        objectId: undefined,
        bindingTransition: undefined
      }
    },
    { name: "malformed binding identity", changes: { tenantId: "not-a-guid" } },
    { name: "unsupported binding transition", changes: { bindingTransition: "transfer" } },
    {
      name: "release owner mismatch",
      changes: {
        bindingTransition: "release",
        expectedOwnerStaffId: "synthetic-different-owner"
      }
    }
  ];

  for (const malformedCase of malformedReceiptCases) {
    await withFixture(async fixture => {
      const rowKey = `operation-${bindingOperationId}`;
      await fixture.securityTable.updateEntity(
        {
          partitionKey: STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
          rowKey,
          ...malformedCase.changes
        },
        "Merge"
      );
      const updatedReceipt = await fixture.securityTable.getEntity<{
        outcome?: string;
      }>(
        STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
        rowKey
      );
      assert.equal(
        updatedReceipt.outcome,
        malformedCase.changes.outcome ?? "committed",
        `receipt mutation did not persist: ${malformedCase.name}`
      );
      const result = await inspectStaffOperationCorrelationFromTables(
        fixture.request,
        fixture.securityTable,
        fixture.staffEventsTable
      );
      assert.equal(
        result.status,
        "contradictory",
        `malformed receipt accepted: ${malformedCase.name}`
      );
      assert.equal(
        result.sources.securityReceipt,
        "malformed",
        `receipt not rejected as malformed: ${malformedCase.name}`
      );
      assert.equal(result.correlation.status, "contradictory");
      nonAuthorizing(result);
    });
  }

  console.log(
    "Independent staff operation, StaffEvents, projection, and ownership reconciliation proofs passed"
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
