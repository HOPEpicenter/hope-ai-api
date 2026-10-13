import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { TableClient } from "@azure/data-tables";
import {
  STAFF_EVENT_CORRELATION_EVIDENCE_SCHEMA_VERSION,
  STAFF_EVENT_CORRELATION_EVIDENCE_SOURCE,
  type StaffEventCorrelationEvidenceV1
} from "../../src/contracts/staffEventCorrelationEvidence.v1";
import type { StaffEvent } from "../../src/domain/staff/projectStaffDirectory";
import {
  StaffEventCorrelationStoragePrototype,
  staffEventCorrelationRowKey,
  type StaffEventCorrelationStoragePort
} from "../../src/repositories/staffEventCorrelationStoragePrototype";
import {
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

const staffId = "synthetic-staff-1344";
const created: TableClient[] = [];

function newTable(prefix: string): TableClient {
  const table = TableClient.fromConnectionString(
    connectionString,
    prefix + randomBytes(10).toString("hex"),
    { allowInsecureConnection: true }
  );
  created.push(table);
  return table;
}

function event(changes: Partial<StaffEvent> = {}): StaffEvent {
  return {
    eventId: "synthetic-event-1",
    staffId,
    type: "staff.updated",
    occurredAt: "2026-10-13T12:00:00.000Z",
    actorId: "synthetic-admin",
    data: { displayName: "Synthetic Staff" },
    ...changes
  };
}

function metadata(
  changes: Partial<StaffEventCorrelationEvidenceV1> = {}
): StaffEventCorrelationEvidenceV1 {
  return {
    schemaVersion: STAFF_EVENT_CORRELATION_EVIDENCE_SCHEMA_VERSION,
    sourceIdentity: STAFF_EVENT_CORRELATION_EVIDENCE_SOURCE,
    evidenceProvenance: "writer_supplied_metadata",
    operationId: "synthetic-operation-1",
    eventId: "synthetic-event-1",
    staffId,
    mutationCategory: "profile_update",
    expectedSecurityRevision: 0,
    resultingSecurityRevision: 1,
    previousStaffState: "active",
    resultingStaffState: "active",
    ...changes
  };
}

function assertNonAuthorizing(value: object): void {
  const v = value as Record<string, unknown>;
  assert.equal(v.authoritative, false);
  assert.equal(v.executionPermitted, false);
  assert.equal(v.retryPermitted, false);
  assert.equal(v.securityTransactionVerified, false);
  assert.equal(v.staffEventsAppendVerified, false);
  assert.equal(v.operationIdUniquenessEnforced, false);
}

function identity(e: StaffEvent) {
  return { staffId: e.staffId, eventId: e.eventId, occurredAt: e.occurredAt };
}

async function rawEntity(table: TableClient, e: StaffEvent) {
  return table.getEntity<Record<string, unknown>>(
    e.staffId,
    staffEventCorrelationRowKey(e)
  );
}

function rawRow(
  e: StaffEvent,
  extra: Record<string, unknown> = {}
): { partitionKey: string; rowKey: string; [key: string]: unknown } {
  return {
    partitionKey: e.staffId,
    rowKey: staffEventCorrelationRowKey(e),
    eventId: e.eventId,
    staffId: e.staffId,
    type: e.type,
    occurredAt: e.occurredAt,
    actorId: e.actorId,
    dataJson: JSON.stringify(e.data),
    ...extra
  };
}

async function main(): Promise<void> {
  const table = newTable("StaffEventCorrelationProof");
  await table.createTable();
  const store = new StaffEventCorrelationStoragePrototype(table);

  // Guards: production or unnamed tables are rejected.
  assert.throws(() =>
    new StaffEventCorrelationStoragePrototype(
      { tableName: "StaffEvents" } as StaffEventCorrelationStoragePort
    )
  );
  assert.throws(() =>
    new StaffEventCorrelationStoragePrototype(
      {} as StaffEventCorrelationStoragePort
    )
  );

  // 1, 2: create, independent read-back, exact preservation.
  const e1 = event();
  const m1 = metadata();
  const c1 = await store.create(e1, m1);
  assert.equal(c1.status, "created");
  assert.equal(c1.createAttempts, 1);
  assertNonAuthorizing(c1);
  const r1 = await store.read(identity(e1));
  assert.equal(r1.status, "valid");
  assert.equal(r1.correlationEvidenceUsable, true);
  assert.deepEqual(r1.evidence, m1);
  assert.deepEqual(r1.event, e1);
  assertNonAuthorizing(r1);
  const raw1 = await rawEntity(table, e1);
  assert.equal(raw1.partitionKey, staffId);
  assert.equal(raw1.rowKey, `${e1.occurredAt}__${e1.eventId}`);
  assert.equal(raw1.dataJson, JSON.stringify(e1.data));
  assert.equal(raw1.correlationMetadataJson, JSON.stringify(m1));
  for (const f of ["eventId", "staffId", "type", "occurredAt", "actorId"]) {
    assert.equal(raw1[f], (e1 as Record<string, unknown>)[f]);
  }

  // Invalid proposals are rejected before any write.
  const bad = await store.create(e1, metadata({ eventId: "other" }));
  assert.equal(bad.status, "rejected_invalid");
  assert.equal(bad.createAttempts, 0);
  assertNonAuthorizing(bad);
  assert.equal(
    (await store.create(event({ eventId: "x" }), { schemaVersion: 2 })).status,
    "rejected_invalid"
  );

  // 3: legacy event without metadata.
  const legacy = event({ eventId: "synthetic-legacy" });
  assert.equal((await store.create(legacy)).status, "created");
  const rl = await store.read(identity(legacy));
  assert.equal(rl.status, "legacy");
  assert.equal(rl.correlationEvidenceUsable, false);
  assert.deepEqual(rl.event, legacy);
  assert.equal(
    (await rawEntity(table, legacy)).correlationMetadataJson,
    undefined
  );
  assertNonAuthorizing(rl);

  // 4: missing, malformed, unsupported metadata fail closed.
  const cases: Array<[string, Record<string, unknown>, string]> = [
    ["synthetic-bad-json", { correlationMetadataJson: "{not json" }, "malformed"],
    ["synthetic-bad-null", { correlationMetadataJson: "null" }, "malformed"],
    ["synthetic-bad-array", { correlationMetadataJson: "[]" }, "malformed"],
    [
      "synthetic-bad-version",
      { correlationMetadataJson: JSON.stringify({ schemaVersion: 2 }) },
      "unsupported_schema_version"
    ],
    [
      "synthetic-bad-incomplete",
      { correlationMetadataJson: JSON.stringify({ schemaVersion: 1 }) },
      "incomplete"
    ],
    [
      "synthetic-bad-extra",
      {
        correlationMetadataJson: JSON.stringify({
          ...metadata({ eventId: "synthetic-bad-extra" }),
          extra: true
        })
      },
      "malformed"
    ]
  ];
  for (const [id, extra, expected] of cases) {
    const e = event({ eventId: id });
    await table.createEntity(rawRow(e, extra));
    const r = await store.read(identity(e));
    assert.equal(r.status, expected, id);
    assert.equal(r.correlationEvidenceUsable, false, id);
    assert.equal(r.evidence, undefined, id);
    assertNonAuthorizing(r);
  }

  // 5: persisted event/staff ID mismatches.
  const idA = event({ eventId: "synthetic-id-mismatch" });
  await table.createEntity(rawRow(idA, { eventId: "different-event" }));
  assert.equal((await store.read(identity(idA))).status, "identity_mismatch");
  const idB = event({ eventId: "synthetic-staff-mismatch" });
  await table.createEntity(rawRow(idB, { staffId: "different-staff" }));
  assert.equal((await store.read(identity(idB))).status, "identity_mismatch");

  // 6: key tampering. Event 2 content stored under event 1's keys.
  const e2 = event({ eventId: "synthetic-event-2" });
  const keyTamper = event({ eventId: "synthetic-key-tamper" });
  await table.createEntity({
    ...rawRow(e2, {
      correlationMetadataJson: JSON.stringify(
        metadata({ eventId: e2.eventId })
      )
    }),
    partitionKey: keyTamper.staffId,
    rowKey: staffEventCorrelationRowKey(keyTamper)
  });
  const rt = await store.read(identity(keyTamper));
  assert.equal(rt.status, "identity_mismatch");
  assert.equal(rt.correlationEvidenceUsable, false);
  const timeTamper = event({
    eventId: "synthetic-time-tamper",
    occurredAt: "2026-10-13T13:00:00.000Z"
  });
  await table.createEntity(
    rawRow(timeTamper, { occurredAt: "2026-10-13T14:00:00.000Z" })
  );
  assert.equal((await store.read(identity(timeTamper))).status, "identity_mismatch");
  // Returned keys that differ from the requested identity are detected.
  const wrongKeys = new StaffEventCorrelationStoragePrototype({
    tableName: "StaffEventCorrelationProofStub",
    createEntity: async () => ({}),
    getEntity: async () => ({ ...rawRow(e1), rowKey: "tampered" })
  });
  assert.equal((await wrongKeys.read(identity(e1))).status, "key_mismatch");
  const missing = await store.read(identity(event({ eventId: "absent" })));
  assert.equal(missing.status, "not_found");
  assert.equal(missing.correlationEvidenceUsable, false);

  // 7, 8: duplicate and conflicting replays preserve the original.
  const dup = await store.create(e1, m1);
  assert.equal(dup.status, "duplicate_identical");
  assertNonAuthorizing(dup);
  const conflict = await store.create(
    event({ actorId: "other-actor", data: { displayName: "Changed" } }),
    m1
  );
  assert.equal(conflict.status, "duplicate_conflicting");
  assertNonAuthorizing(conflict);
  const conflictMeta = await store.create(
    e1,
    metadata({ operationId: "synthetic-operation-other" })
  );
  assert.equal(conflictMeta.status, "duplicate_conflicting");
  const after = await store.read(identity(e1));
  assert.equal(after.status, "valid");
  assert.deepEqual(after.event, e1);
  assert.deepEqual(after.evidence, m1);
  assert.equal(
    (await rawEntity(table, e1)).correlationMetadataJson,
    JSON.stringify(m1)
  );

  // 9: concurrent creation of one row commits at most one entity.
  const cTable = newTable("StaffEventCorrelationProofRace");
  await cTable.createTable();
  const cStore = new StaffEventCorrelationStoragePrototype(cTable);
  const race = event({ eventId: "synthetic-race" });
  const raceMeta = metadata({ eventId: race.eventId });
  const results = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      cStore.create(
        i % 2 === 0 ? race : event({ eventId: race.eventId, actorId: `a${i}` }),
        raceMeta
      )
    )
  );
  assert.equal(results.filter(r => r.status === "created").length, 1);
  assert.ok(results.every(r => r.createAttempts <= 1));
  results.forEach(assertNonAuthorizing);
  let count = 0;
  for await (const _ of cTable.listEntities()) count += 1;
  assert.equal(count, 1);

  // 10: identical operation IDs in distinct rows are both accepted.
  const dupOpA = event({ eventId: "synthetic-op-a" });
  const dupOpB = event({ eventId: "synthetic-op-b" });
  const dupOpC = event({ eventId: "synthetic-op-c", staffId: "synthetic-staff-other" });
  for (const e of [dupOpA, dupOpB, dupOpC]) {
    const r = await store.create(
      e,
      metadata({
        operationId: "synthetic-shared-operation",
        eventId: e.eventId,
        staffId: e.staffId
      })
    );
    assert.equal(r.status, "created");
    assert.equal(r.operationIdUniquenessEnforced, false);
  }
  const otherTable = newTable("StaffEventCorrelationProofOther");
  await otherTable.createTable();
  assert.equal(
    (await new StaffEventCorrelationStoragePrototype(otherTable).create(
      dupOpA,
      metadata({ operationId: "synthetic-shared-operation", eventId: dupOpA.eventId })
    )).status,
    "created"
  );

  // 11, 12: persisted metadata is not a verified security operation.
  const securityTable = newTable("StaffEventCorrelationProofSecurity");
  await securityTable.createTable();
  const security = new StaffOperationCorrelationPrototypeRepository(
    securityTable
  );
  assert.equal(await security.initializeAuthorityHead(), "initialized");
  const createdEvent = event({
    eventId: "synthetic-create-event",
    staffId: "synthetic-staff-create",
    type: "staff.created",
    data: { displayName: "Synthetic Create", status: "active" }
  });
  const request = {
    mutationCategory: "identity_creation" as const,
    operationId: "synthetic-create-operation",
    eventId: createdEvent.eventId,
    expectedSecurityRevision: 0,
    expectedStaffId: createdEvent.staffId,
    expectedStaffState: "absent" as const,
    targetStaffState: "active" as const
  };
  const createMeta = metadata({
    operationId: request.operationId,
    eventId: createdEvent.eventId,
    staffId: createdEvent.staffId,
    mutationCategory: "identity_creation",
    previousStaffState: "absent",
    resultingStaffState: "active"
  });
  const cc = await store.create(createdEvent, createMeta);
  assert.equal(cc.status, "created");
  const rc = await store.read(identity(createdEvent));
  assert.equal(rc.status, "valid");
  assert.equal(rc.securityTransactionVerified, false);
  // StaffEvents evidence exists, but no security receipt.
  const noReceipt = await inspectStaffOperationCorrelationFromTables(
    request,
    securityTable,
    table
  );
  assert.notEqual(noReceipt.correlation.status, "complete");
  assert.notEqual(noReceipt.status, "complete" as never);
  assert.equal(noReceipt.correlation.authoritative, false);
  assert.equal(noReceipt.correlation.executionPermitted, false);
  assert.equal(noReceipt.correlation.retryPermitted, false);

  // Security receipt without StaffEvents evidence.
  const orphan = {
    ...request,
    operationId: "synthetic-orphan-operation",
    eventId: "synthetic-orphan-event",
    expectedStaffId: "synthetic-staff-orphan"
  };
  const commit = await security.commitOperation({
    operationId: orphan.operationId,
    eventId: orphan.eventId,
    staffId: orphan.expectedStaffId,
    mutationCategory: "identity_creation",
    expectedRevision: 0,
    expectedStaffState: "absent",
    resultingStaffState: "active"
  });
  assert.equal(commit.status, "committed");
  const orphanInspection = await inspectStaffOperationCorrelationFromTables(
    orphan,
    securityTable,
    table
  );
  assert.notEqual(orphanInspection.correlation.status, "complete");
  assert.equal(orphanInspection.correlation.authoritative, false);
  assert.equal(orphanInspection.correlation.retryPermitted, false);

  // 13: failed or uncertain acknowledgements are never retried.
  let failCalls = 0;
  const failing = new StaffEventCorrelationStoragePrototype({
    tableName: "StaffEventCorrelationProofFail",
    createEntity: async () => {
      failCalls += 1;
      throw new Error("simulated network failure");
    },
    getEntity: async () => {
      throw new Error("must not be read");
    }
  });
  const failed = await failing.create(e1, m1);
  assert.equal(failed.status, "uncertain");
  assert.equal(failed.createAttempts, 1);
  assert.equal(failCalls, 1);
  assertNonAuthorizing(failed);

  let lostCalls = 0;
  const lostTable = newTable("StaffEventCorrelationProofLost");
  await lostTable.createTable();
  const lost = new StaffEventCorrelationStoragePrototype({
    tableName: lostTable.tableName,
    createEntity: async entity => {
      lostCalls += 1;
      await lostTable.createEntity(entity);
      throw new Error("simulated lost acknowledgement");
    },
    getEntity: (pk, rk) =>
      lostTable.getEntity<Record<string, unknown>>(pk, rk)
  });
  const lostResult = await lost.create(e1, m1);
  assert.equal(lostResult.status, "uncertain");
  assert.equal(lostCalls, 1);
  assert.equal(lostResult.retryPermitted, false);
  // Independent read shows the write landed, yet the create stays uncertain.
  const lostRead = await lost.read(identity(e1));
  assert.equal(lostRead.status, "valid");
  assert.equal(lostCalls, 1);
  assertNonAuthorizing(lostRead);

  // Explicit null metadata is rejected at the write boundary, zero attempts.
  const nullEvent = event({ eventId: "synthetic-null-metadata" });
  const nullResult = await store.create(nullEvent, null);
  assert.equal(nullResult.status, "rejected_invalid");
  assert.equal(nullResult.createAttempts, 0);
  assertNonAuthorizing(nullResult);
  assert.equal((await store.read(identity(nullEvent))).status, "not_found");

  // 409 handling with an injected port: exactly one create, no other writes.
  const stored = rawRow(e1, { correlationMetadataJson: JSON.stringify(m1) });
  async function duplicateScenario(
    getEntity: () => Promise<Record<string, unknown>>
  ) {
    let creates = 0;
    const proxy = new StaffEventCorrelationStoragePrototype({
      tableName: "StaffEventCorrelationProofStub409",
      createEntity: async () => {
        creates += 1;
        throw Object.assign(new Error("conflict"), { statusCode: 409 });
      },
      getEntity
    });
    const result = await proxy.create(e1, m1);
    assert.equal(creates, 1);
    assert.equal(result.createAttempts, 1);
    assertNonAuthorizing(result);
    return result;
  }
  assert.equal(
    (await duplicateScenario(async () => stored)).status,
    "duplicate_identical"
  );
  assert.equal(
    (await duplicateScenario(async () => ({ ...stored, actorId: "other" })))
      .status,
    "duplicate_conflicting"
  );
  const unreadable = await duplicateScenario(async () => {
    throw new Error("simulated read failure");
  });
  assert.equal(unreadable.status, "uncertain");
  assert.equal(
    unreadable.diagnostic,
    "existing_row_contents_could_not_be_independently_verified"
  );

  // Stored JSON null remains malformed on read, not legacy.
  const storedNull = event({ eventId: "synthetic-stored-null" });
  await table.createEntity(rawRow(storedNull, { correlationMetadataJson: "null" }));
  assert.equal((await store.read(identity(storedNull))).status, "malformed");

  console.log("[PASS] StaffEvents correlation storage Azurite proof");
}

main()
  .then(async () => {
    for (const t of created) await t.deleteTable().catch(() => undefined);
  })
  .catch(async error => {
    for (const t of created) await t.deleteTable().catch(() => undefined);
    console.error(error);
    process.exit(1);
  });
