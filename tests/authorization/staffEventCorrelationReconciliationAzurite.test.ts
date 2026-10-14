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
  staffEventCorrelationRowKey
} from "../../src/repositories/staffEventCorrelationStoragePrototype";
import {
  STAFF_EVENTS_APPEND_OBLIGATION_SCHEMA_VERSION,
  STAFF_EVENTS_APPEND_OBLIGATION_SOURCE,
  STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
  STAFF_OPERATION_CORRELATION_PROTOTYPE_SCHEMA_VERSION,
  STAFF_OPERATION_CORRELATION_PROTOTYPE_SOURCE,
  StaffOperationCorrelationPrototypeRepository,
  staffEventsAppendObligationRowKey
} from "../../src/repositories/staffOperationCorrelationPrototypeRepository";
import {
  inspectStaffEventCorrelationReconciliation,
  type StaffEventCorrelationReconciliationResult
} from "../../src/services/staff/inspectStaffEventCorrelationReconciliation";

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
const otherObjectId = "33333333-3333-4333-8333-333333333333";
const occurredAt = "2026-10-13T12:00:00.000Z";
const tables: TableClient[] = [];

function newTable(prefix: string): TableClient {
  const table = TableClient.fromConnectionString(
    connectionString,
    prefix + randomBytes(10).toString("hex"),
    { allowInsecureConnection: true }
  );
  tables.push(table);
  return table;
}

type Kind = "profile" | "acquire" | "release";

function eventFor(id: string, kind: Kind): StaffEvent {
  const data = kind === "profile"
    ? { displayName: "Synthetic Staff" }
    : kind === "acquire"
      ? { entraTenantId: tenantId, entraObjectId: objectId }
      : { entraTenantId: null, entraObjectId: null };
  return {
    eventId: `ev-${id}`,
    staffId: `staff-${id}`,
    type: "staff.updated",
    occurredAt,
    actorId: "synthetic-admin",
    data
  } as StaffEvent;
}

function metadataFor(id: string, kind: Kind): StaffEventCorrelationEvidenceV1 {
  return {
    schemaVersion: STAFF_EVENT_CORRELATION_EVIDENCE_SCHEMA_VERSION,
    sourceIdentity: STAFF_EVENT_CORRELATION_EVIDENCE_SOURCE,
    evidenceProvenance: "writer_supplied_metadata",
    operationId: `op-${id}`,
    eventId: `ev-${id}`,
    staffId: `staff-${id}`,
    mutationCategory: kind === "profile" ? "profile_update" : "binding_change",
    expectedSecurityRevision: 1,
    resultingSecurityRevision: 2,
    previousStaffState: "active",
    resultingStaffState: "active",
    ...(kind === "profile"
      ? {}
      : {
          binding: {
            identity: { entraTenantId: tenantId, entraObjectId: objectId },
            transition: kind,
            ...(kind === "release" ? { expectedOwnerStaffId: `staff-${id}` } : {})
          }
        })
  };
}

function receiptFor(
  id: string,
  kind: Kind,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    partitionKey: STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
    rowKey: `operation-op-${id}`,
    schemaVersion: STAFF_OPERATION_CORRELATION_PROTOTYPE_SCHEMA_VERSION,
    source: STAFF_OPERATION_CORRELATION_PROTOTYPE_SOURCE,
    operationId: `op-${id}`,
    eventId: `ev-${id}`,
    staffId: `staff-${id}`,
    mutationCategory: kind === "profile" ? "profile_update" : "binding_change",
    expectedRevision: 1,
    resultingRevision: 2,
    previousStaffState: "active",
    resultingStaffState: "active",
    ...(kind === "profile"
      ? {}
      : {
          tenantId,
          objectId,
          bindingTransition: kind,
          ...(kind === "release" ? { expectedOwnerStaffId: `staff-${id}` } : {})
        }),
    outcome: "committed",
    ...overrides
  };
}

function assertSafe(result: StaffEventCorrelationReconciliationResult): void {
  assert.equal(result.authoritative, false);
  assert.equal(result.executionPermitted, false);
  assert.equal(result.retryPermitted, false);
  assert.equal(result.securityTransactionVerified, false);
  assert.equal(result.staffEventsAppendVerified, false);
  assert.equal(result.operationIdUniquenessEnforced, false);
}

async function snapshot(...ts: TableClient[]): Promise<string> {
  const rows: unknown[] = [];
  for (const t of ts) {
    for await (const e of t.listEntities()) rows.push(e);
  }
  return JSON.stringify(rows);
}

async function main(): Promise<void> {
  const securityTable = newTable("StaffEventCorrelationReconSecurity");
  const eventsTable = newTable("StaffEventCorrelationProofRecon");
  await securityTable.createTable();
  await eventsTable.createTable();
  const store = new StaffEventCorrelationStoragePrototype(eventsTable);

  const reconcile = async (
    id: string,
    security: { getEntity: TableClient["getEntity"] } = securityTable,
    events: { tableName: string; getEntity: TableClient["getEntity"] } = eventsTable
  ) => {
    const result = await inspectStaffEventCorrelationReconciliation(
      {
        operationId: `op-${id}`,
        eventId: `ev-${id}`,
        staffId: `staff-${id}`,
        occurredAt
      },
      { getEntity: (pk, rk) => security.getEntity(pk, rk) },
      {
        tableName: events.tableName,
        getEntity: (pk, rk) => events.getEntity(pk, rk)
      }
    );
    assertSafe(result);
    return result;
  };

  async function seed(
    id: string,
    kind: Kind,
    receipt: Record<string, unknown> | null = {},
    metadata: Partial<StaffEventCorrelationEvidenceV1> | null = {}
  ): Promise<void> {
    if (receipt) await securityTable.createEntity(receiptFor(id, kind, receipt) as never);
    if (metadata) {
      const created = await store.create(
        eventFor(id, kind),
        { ...metadataFor(id, kind), ...metadata }
      );
      assert.equal(created.status, "created", `${id}:${created.diagnostic}`);
    }
  }

  async function rawEvent(id: string, extra: Record<string, unknown>) {
    const e = eventFor(id, "profile");
    await eventsTable.createEntity({
      partitionKey: e.staffId,
      rowKey: staffEventCorrelationRowKey(e),
      eventId: e.eventId,
      staffId: e.staffId,
      type: e.type,
      occurredAt: e.occurredAt,
      actorId: e.actorId,
      dataJson: JSON.stringify(e.data),
      ...extra
    });
  }

  // 1: matching evidence (profile, acquire, release) remains non-authorizing.
  for (const kind of ["profile", "acquire", "release"] as const) {
    await seed(`match-${kind}`, kind);
    const r = await reconcile(`match-${kind}`);
    assert.equal(r.status, "consistent_observed_evidence", kind);
    assert.deepEqual(r.mismatchedFields, []);
    assert.equal(r.sources.securityReceipt, "observed");
    assert.equal(r.sources.staffEvent, "observed");
  }

  // 2, 3: missing sources.
  await seed("no-receipt", "profile", null);
  assert.equal((await reconcile("no-receipt")).status, "missing_security_receipt");
  await seed("no-event", "profile", {}, null);
  assert.equal((await reconcile("no-event")).status, "missing_staff_event");
  assert.equal((await reconcile("neither")).status, "missing_security_receipt");

  // 4-7: StaffEvents metadata defects.
  await securityTable.createEntity(receiptFor("legacy", "profile") as never);
  assert.equal((await store.create(eventFor("legacy", "profile"))).status, "created");
  assert.equal((await reconcile("legacy")).status, "legacy_event_without_metadata");

  await securityTable.createEntity(receiptFor("incomplete", "profile") as never);
  await rawEvent("incomplete", { correlationMetadataJson: JSON.stringify({ schemaVersion: 1 }) });
  assert.equal((await reconcile("incomplete")).status, "incomplete_metadata");

  await securityTable.createEntity(receiptFor("badjson", "profile") as never);
  await rawEvent("badjson", { correlationMetadataJson: "{not json" });
  assert.equal((await reconcile("badjson")).status, "malformed_evidence");

  await securityTable.createEntity(receiptFor("v2", "profile") as never);
  await rawEvent("v2", { correlationMetadataJson: JSON.stringify({ schemaVersion: 2 }) });
  assert.equal((await reconcile("v2")).status, "unsupported_schema_version");

  // 8-15: disagreements between independently valid sources.
  // Both sources individually valid: assert the exact mismatched fields.
  const comparisons: Array<[
    string, Kind, Record<string, unknown>, Partial<StaffEventCorrelationEvidenceV1>, string[]
  ]> = [
    ["opid", "profile", {}, { operationId: "op-other" }, ["operationId"]],
    ["cat", "profile", { mutationCategory: "status_transition" }, {}, ["mutationCategory"]],
    ["exprev", "profile", { expectedRevision: 5, resultingRevision: 6 }, {},
      ["expectedSecurityRevision", "resultingSecurityRevision"]],
    ["prev", "profile", { previousStaffState: "pending" }, {}, ["previousStaffState"]],
    ["resst", "profile", { mutationCategory: "status_transition", resultingStaffState: "revoked" }, {},
      ["mutationCategory", "resultingStaffState"]],
    ["ident", "acquire", { objectId: otherObjectId }, {}, ["binding.identity"]],
    ["trans", "acquire", { bindingTransition: "release", expectedOwnerStaffId: "staff-trans" }, {},
      ["binding.transition", "binding.expectedOwnerStaffId"]]
  ];
  for (const [id, kind, receiptOverride, metaOverride, fields] of comparisons) {
    await seed(id, kind, receiptOverride, metaOverride);
    const r = await reconcile(id);
    assert.equal(r.status, "contradictory_evidence", id);
    assert.equal(r.sources.securityReceipt, "observed", id);
    assert.equal(r.sources.staffEvent, "observed", id);
    assert.deepEqual([...r.mismatchedFields].sort(), [...fields].sort(), id);
  }

  async function seedRawMetadata(
    id: string,
    kind: Kind,
    receipt: Record<string, unknown>,
    metadata: Record<string, unknown>
  ): Promise<void> {
    await securityTable.createEntity(receiptFor(id, kind, receipt) as never);
    const e = eventFor(id, kind);
    await eventsTable.createEntity({
      partitionKey: e.staffId,
      rowKey: staffEventCorrelationRowKey(e),
      eventId: e.eventId,
      staffId: e.staffId,
      type: e.type,
      occurredAt: e.occurredAt,
      actorId: e.actorId,
      dataJson: JSON.stringify(e.data),
      correlationMetadataJson: JSON.stringify({ ...metadataFor(id, kind), ...metadata })
    });
  }
  const release = (owner: string) => ({
    binding: {
      identity: { entraTenantId: tenantId, entraObjectId: objectId },
      transition: "release",
      expectedOwnerStaffId: owner
    }
  });

  // Defects found before comparison: assert source status and diagnostic,
  // and that no field comparison was attempted.
  const preComparison: Array<[string, string, string, string, string]> = [];
  await seed("evid", "profile", { eventId: "ev-other" });
  preComparison.push(["evid", "contradictory", "observed", "security_receipt_identity_differs_from_requested_identity", "contradictory_evidence"]);
  await seed("stid", "profile", { staffId: "staff-other" });
  preComparison.push(["stid", "contradictory", "observed", "security_receipt_identity_differs_from_requested_identity", "contradictory_evidence"]);
  // Release owner must equal the receipt staff ID: receipt-only disagreement.
  await seed("ownrcpt", "release", { expectedOwnerStaffId: "staff-someone-else" });
  preComparison.push(["ownrcpt", "contradictory", "observed", "security_receipt_release_owner_differs_from_staff", "contradictory_evidence"]);
  // Metadata-only disagreement is rejected by the v1 classifier.
  await seedRawMetadata("ownmeta", "release", {}, release("staff-someone-else"));
  preComparison.push(["ownmeta", "observed", "contradictory", "staff_event:contradictory:release_owner_mismatch", "contradictory_evidence"]);
  // Both sides claim the same incorrect owner: never consistent.
  await seedRawMetadata("ownboth", "release", { expectedOwnerStaffId: "staff-someone-else" }, release("staff-someone-else"));
  preComparison.push(["ownboth", "contradictory", "contradictory", "security_receipt_release_owner_differs_from_staff", "contradictory_evidence"]);
  // Mutually consistent but prohibited transitions.
  await seedRawMetadata("badrevoke", "profile",
    { previousStaffState: "revoked", resultingStaffState: "active" },
    { previousStaffState: "revoked", resultingStaffState: "active" });
  preComparison.push(["badrevoke", "contradictory", "contradictory", "security_receipt_prohibited_or_contradictory_transition", "contradictory_evidence"]);
  await seedRawMetadata("badcreate", "profile",
    { mutationCategory: "identity_creation", previousStaffState: "active", resultingStaffState: "active" },
    { mutationCategory: "identity_creation", previousStaffState: "active", resultingStaffState: "active" });
  preComparison.push(["badcreate", "contradictory", "contradictory", "security_receipt_prohibited_or_contradictory_transition", "contradictory_evidence"]);
  await seedRawMetadata("badactivate", "profile",
    { mutationCategory: "activation", previousStaffState: "active", resultingStaffState: "active" },
    { mutationCategory: "activation", previousStaffState: "active", resultingStaffState: "active" });
  preComparison.push(["badactivate", "contradictory", "incomplete", "security_receipt_prohibited_or_contradictory_transition", "contradictory_evidence"]);
  // Binding change without binding evidence is a prohibited receipt.
  await seed("nobind", "acquire", { tenantId: undefined, objectId: undefined, bindingTransition: undefined });
  preComparison.push(["nobind", "contradictory", "observed", "security_receipt_prohibited_or_contradictory_transition", "contradictory_evidence"]);
  // Metadata with non-consecutive revisions against a valid receipt.
  await seedRawMetadata("metarev", "profile", {}, { resultingSecurityRevision: 9 });
  preComparison.push(["metarev", "observed", "contradictory", "staff_event:contradictory:nonconsecutive_security_revisions", "contradictory_evidence"]);
  for (const [id, receiptSource, eventStatus, diagnostic, status] of preComparison) {
    const r = await reconcile(id);
    assert.equal(r.status, status, id);
    assert.notEqual(r.status, "consistent_observed_evidence", id);
    assert.equal(r.sources.securityReceipt, receiptSource === "observed" ? "observed" : receiptSource, id);
    assert.equal(r.sources.staffEvent, eventStatus === "observed" ? "observed" : eventStatus, id);
    assert.ok(r.diagnostics.some(d => d.includes(diagnostic)), `${id}:${r.diagnostics}`);
    assert.deepEqual(r.mismatchedFields, [], id);
  }

  // 16: malformed receipt schema/source/outcome and field defects.
  const malformedReceipts: Array<[string, Record<string, unknown>, string]> = [
    ["rsrc", { source: "other" }, "malformed_evidence"],
    ["rout", { outcome: "pending" }, "malformed_evidence"],
    ["rschema", { schemaVersion: undefined }, "malformed_evidence"],
    ["rver", { schemaVersion: 2 }, "unsupported_schema_version"],
    ["rcat", { mutationCategory: "nonsense" }, "malformed_evidence"],
    ["rstate", { previousStaffState: "weird" }, "malformed_evidence"],
    ["rkeys", { partitionKey: "wrong-partition" }, "missing_security_receipt"]
  ];
  for (const [id, override, expected] of malformedReceipts) {
    await seed(id, "profile", override);
    assert.equal((await reconcile(id)).status, expected, id);
  }
  await seed("rbind", "acquire", { tenantId: "not-a-guid" });
  assert.equal((await reconcile("rbind")).status, "malformed_evidence");
  await seed("rrev", "profile", { resultingRevision: 7 });
  assert.equal((await reconcile("rrev")).status, "contradictory_evidence");

  // Tampered keys on a returned receipt/event are contradictory.
  await seed("keytamper", "profile");
  const tamperedKeys = await reconcile("keytamper", {
    getEntity: (async (pk: string, rk: string) => ({
      ...(await securityTable.getEntity(pk, rk)),
      rowKey: "operation-tampered"
    })) as TableClient["getEntity"]
  });
  assert.equal(tamperedKeys.status, "contradictory_evidence");

  // 17: storage failures and unavailable tables.
  const failing = {
    getEntity: (async () => {
      throw Object.assign(new Error("simulated outage"), { statusCode: 500 });
    }) as TableClient["getEntity"]
  };
  await seed("fail", "profile");
  assert.equal((await reconcile("fail", failing)).status, "uncertain");
  assert.equal(
    (await reconcile("fail", securityTable, {
      tableName: eventsTable.tableName,
      getEntity: failing.getEntity
    })).status,
    "uncertain"
  );
  const bothDown = await reconcile("fail", failing, {
    tableName: eventsTable.tableName,
    getEntity: failing.getEntity
  });
  assert.equal(bothDown.status, "storage_unavailable");
  const ghostSecurity = newTable("StaffEventCorrelationReconGhost");
  const ghostEvents = newTable("StaffEventCorrelationProofGhost");
  const noTables = await reconcile("fail", ghostSecurity, ghostEvents);
  assert.equal(noTables.status, "storage_unavailable");
  assert.equal(noTables.sources.securityReceipt, "unavailable");
  assert.notEqual(noTables.status, "missing_security_receipt");

  // Invalid requests and production table names are refused without reads.
  let reads = 0;
  const counting = {
    tableName: "StaffEvents",
    getEntity: (async () => { reads += 1; return {}; }) as TableClient["getEntity"]
  };
  const prod = await reconcile("fail", securityTable, counting);
  assert.equal(prod.status, "invalid_request");
  assert.equal(reads, 0);
  const badId = await inspectStaffEventCorrelationReconciliation(
    { operationId: "../x", eventId: "e", staffId: "s", occurredAt },
    securityTable,
    eventsTable
  );
  assert.equal(badId.status, "invalid_request");
  assertSafe(badId);

  // 17b: append obligation evidence is separate, opt-in, and non-authorizing.
  const obligationFor = (
    id: string,
    overrides: Record<string, unknown> = {}
  ): Record<string, unknown> => ({
    partitionKey: STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
    rowKey: staffEventsAppendObligationRowKey(`op-${id}`),
    schemaVersion: STAFF_EVENTS_APPEND_OBLIGATION_SCHEMA_VERSION,
    source: STAFF_EVENTS_APPEND_OBLIGATION_SOURCE,
    operationId: `op-${id}`,
    eventId: `ev-${id}`,
    staffId: `staff-${id}`,
    mutationCategory: "profile_update",
    resultingSecurityRevision: 2,
    status: "pending",
    ...overrides
  });
  const withObligation = async (
    id: string,
    security: { getEntity: TableClient["getEntity"] } = securityTable
  ) => {
    const result = await inspectStaffEventCorrelationReconciliation(
      {
        operationId: `op-${id}`,
        eventId: `ev-${id}`,
        staffId: `staff-${id}`,
        occurredAt
      },
      { getEntity: (pk, rk) => security.getEntity(pk, rk) },
      {
        tableName: eventsTable.tableName,
        getEntity: (pk, rk) => eventsTable.getEntity(pk, rk)
      },
      { inspectAppendObligation: true }
    );
    assertSafe(result);
    return result;
  };

  // Legacy/omitted option: not inspected, behavior unchanged.
  await seed("obl-legacy", "profile");
  const legacy = await reconcile("obl-legacy");
  assert.equal(legacy.status, "consistent_observed_evidence");
  assert.equal(legacy.appendObligation.status, "not_inspected");
  // Receipt without obligation: missing, and the top-level status is unchanged.
  const legacyOpted = await withObligation("obl-legacy");
  assert.equal(legacyOpted.status, "consistent_observed_evidence");
  assert.equal(legacyOpted.appendObligation.status, "missing");

  // Pending obligation with no StaffEvents row is not append proof.
  await seed("obl-pending", "profile", {}, null);
  await securityTable.createEntity(obligationFor("obl-pending") as never);
  const pendingOnly = await withObligation("obl-pending");
  assert.equal(pendingOnly.appendObligation.status, "observed_pending");
  assert.equal(pendingOnly.status, "missing_staff_event");
  assert.equal(pendingOnly.staffEventsAppendVerified, false);

  // Pending obligation alongside matching evidence.
  await seed("obl-ok", "profile");
  await securityTable.createEntity(obligationFor("obl-ok") as never);
  const okOblig = await withObligation("obl-ok");
  assert.equal(okOblig.appendObligation.status, "observed_pending");
  assert.equal(okOblig.status, "consistent_observed_evidence");

  const badObligations: Array<[string, Record<string, unknown>, string, string[]]> = [
    ["oschema", { schemaVersion: undefined }, "malformed", []],
    ["over", { schemaVersion: 2 }, "malformed", []],
    ["osrc", { source: "other" }, "malformed", []],
    ["ocat", { mutationCategory: "nonsense" }, "malformed", []],
    ["orev", { resultingSecurityRevision: "2" }, "malformed", []],
    ["ostatus", { status: "complete" }, "contradictory", []],
    ["oop", { operationId: "op-other" }, "contradictory", ["operationId"]],
    ["oev", { eventId: "ev-other" }, "contradictory", ["eventId"]],
    ["ostaff", { staffId: "staff-other" }, "contradictory", ["staffId"]],
    ["ocatmis", { mutationCategory: "binding_change" }, "contradictory", ["mutationCategory"]],
    ["orevmis", { resultingSecurityRevision: 9 }, "contradictory", ["resultingSecurityRevision"]],
    ["okeys", { partitionKey: "wrong-partition" }, "missing", []]
  ];
  for (const [id, override, expected, fields] of badObligations) {
    await seed(id, "profile");
    await securityTable.createEntity(obligationFor(id, override) as never);
    const r = await withObligation(id);
    assert.equal(r.appendObligation.status, expected, id);
    assert.deepEqual([...r.appendObligation.mismatchedFields].sort(), fields, id);
    assert.equal(r.status, "consistent_observed_evidence", id);
  }

  // A returned row with tampered keys is contradictory.
  await seed("otamper", "profile");
  await securityTable.createEntity(obligationFor("otamper") as never);
  const tamperedObl = await withObligation("otamper", {
    getEntity: (async (pk: string, rk: string) => {
      const e = await securityTable.getEntity(pk, rk);
      return rk.startsWith("staff-events-append-obligation-")
        ? { ...e, rowKey: "obligation-tampered" }
        : e;
    }) as TableClient["getEntity"]
  });
  assert.equal(tamperedObl.appendObligation.status, "contradictory");

  // Obligation read failures are unavailable, never missing.
  await seed("ofail", "profile");
  const oblFail = await withObligation("ofail", {
    getEntity: (async (pk: string, rk: string) => {
      if (rk.startsWith("staff-events-append-obligation-")) {
        throw Object.assign(new Error("simulated outage"), { statusCode: 500 });
      }
      return securityTable.getEntity(pk, rk);
    }) as TableClient["getEntity"]
  });
  assert.equal(oblFail.appendObligation.status, "unavailable");
  assert.equal(oblFail.status, "consistent_observed_evidence");
  const oblGhost = await withObligation("ofail", ghostSecurity);
  assert.equal(oblGhost.appendObligation.status, "unavailable");

  // Obligation read never mutates storage.
  const beforeOblig = await snapshot(securityTable, eventsTable);
  await withObligation("obl-ok");
  assert.equal(await snapshot(securityTable, eventsTable), beforeOblig);

  // 18: lost acknowledgement is never promoted to verified success.
  const ackSecurity = newTable("StaffEventCorrelationReconAck");
  await ackSecurity.createTable();
  const lostProxy = new Proxy(ackSecurity, {
    get(target, property) {
      if (property === "submitTransaction") {
        return async (actions: Parameters<TableClient["submitTransaction"]>[0]) => {
          await target.submitTransaction(actions);
          throw new Error("simulated lost acknowledgement");
        };
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  const ackRepo = new StaffOperationCorrelationPrototypeRepository(
    ackSecurity as TableClient
  );
  assert.equal(await ackRepo.initializeAuthorityHead(), "initialized");
  const lostRepo = new StaffOperationCorrelationPrototypeRepository(
    lostProxy as TableClient
  );
  const lost = await lostRepo.commitOperation({
    operationId: "op-lost",
    eventId: "ev-lost",
    staffId: "staff-lost",
    mutationCategory: "identity_creation",
    expectedRevision: 0,
    expectedStaffState: "absent",
    resultingStaffState: "active"
  });
  assert.equal(lost.status, "uncertain");
  const lostEvent = {
    ...eventFor("lost", "profile"),
    type: "staff.created",
    data: { displayName: "Synthetic", status: "active" }
  } as StaffEvent;
  const lostCreate = await store.create(lostEvent, {
    ...metadataFor("lost", "profile"),
    mutationCategory: "identity_creation",
    expectedSecurityRevision: 0,
    resultingSecurityRevision: 1,
    previousStaffState: "absent"
  });
  assert.equal(lostCreate.status, "created");
  const lostResult = await reconcile("lost", ackSecurity);
  // The receipt landed, so evidence is observed, yet nothing is verified.
  assert.equal(lostResult.status, "consistent_observed_evidence");
  assert.equal(lostResult.securityTransactionVerified, false);
  assert.equal(lostResult.retryPermitted, false);
  // Lost acknowledgement where nothing landed stays missing, not success.
  await store.create(
    { ...lostEvent, eventId: "ev-lostnone", staffId: "staff-lostnone" },
    {
      ...metadataFor("lostnone", "profile"),
      mutationCategory: "identity_creation",
      expectedSecurityRevision: 0,
      resultingSecurityRevision: 1,
      previousStaffState: "absent"
    }
  );
  assert.equal((await reconcile("lostnone", ackSecurity)).status, "missing_security_receipt");

  // 19: reconciliation does not mutate either table.
  const before = await snapshot(securityTable, eventsTable, ackSecurity);
  for (const id of ["match-profile", "no-receipt", "badjson", "opid", "lost", "fail"]) {
    await reconcile(id);
  }
  await reconcile("fail", failing);
  assert.equal(await snapshot(securityTable, eventsTable, ackSecurity), before);

  // 20: all results above passed assertSafe, including consistent evidence.
  console.log("[PASS] StaffEvents correlation reconciliation Azurite proof");
}

main()
  .then(async () => {
    for (const t of tables) await t.deleteTable().catch(() => undefined);
  })
  .catch(async error => {
    for (const t of tables) await t.deleteTable().catch(() => undefined);
    console.error(error);
    process.exit(1);
  });
