import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  FormationEventEvidenceAcquisitionInputV1,
  FormationEventEvidenceAcquisitionResultV1
} from "../../src/contracts/formationEventEvidenceAcquisition.v1";
import { assessFormationEventAcquisition } from "../../src/domain/formation/assessFormationEventAcquisition";
import { makeDeterministicFormationEventRowKey } from "../../src/domain/formation/formationEventRowKey";

const VISITOR = "synthetic-visitor-001";
const EVENT_ID = "synthetic-event-100";
const AT = "2030-01-01T00:00:00.000Z";
const OTHER_AT = "2030-01-01T00:00:01.000Z";
const ROW_KEY = makeDeterministicFormationEventRowKey(AT, EVENT_ID);

function build(
  overrides: {
    identity?: Record<string, unknown>;
    observation?: Record<string, unknown>;
    record?: Record<string, unknown>;
  } = {}
): FormationEventEvidenceAcquisitionInputV1 {
  const record = {
    partitionKey: VISITOR,
    rowKey: ROW_KEY,
    visitorId: VISITOR,
    id: EVENT_ID,
    occurredAt: AT,
    type: "SERVICE_ATTENDED",
    recordedAt: "2030-01-01T00:00:01.000Z",
    channel: "service",
    visibility: "staff",
    sensitivity: "none",
    summary: undefined,
    metadata: undefined,
    idempotencyKey: EVENT_ID,
    ...overrides.record
  };
  const availability = overrides.observation?.availability ?? "available";
  const observation = availability === "available"
    ? { availability, record, ...overrides.observation }
    : { availability, ...overrides.observation };
  return {
    identity: { visitorId: VISITOR, eventId: EVENT_ID, occurredAt: AT, ...overrides.identity },
    observation
  } as FormationEventEvidenceAcquisitionInputV1;
}

function expect(
  input: unknown,
  status: FormationEventEvidenceAcquisitionResultV1["status"],
  reasonCode: FormationEventEvidenceAcquisitionResultV1["reasonCode"]
): FormationEventEvidenceAcquisitionResultV1 {
  const assessment = assessFormationEventAcquisition(input as FormationEventEvidenceAcquisitionInputV1);
  assert.equal(assessment.status, status);
  assert.equal(assessment.reasonCode, reasonCode);
  assert.equal(assessment.advisoryOnly, true);
  assert.equal(assessment.readOnly, true);
  assert.equal(assessment.authoritative, false);
  assert.equal(assessment.historicalAbsenceEstablished, false);
  assert.equal(assessment.transactionallyComplete, false);
  assert.equal(assessment.retryAuthorized, false);
  assert.equal(assessment.repairAuthorized, false);
  assert.equal(assessment.replayAuthorized, false);
  assert.equal(assessment.reconciliationAuthorized, false);
  return assessment;
}

let passed = 0;
function test(name: string, run: () => void): void {
  run();
  passed++;
  console.log(`PASS ${name}`);
}

test("exact matching observed record", () => {
  const assessment = expect(
    build(),
    "matching_evidence",
    "record_matches_trusted_identity"
  );
  assert.equal(assessment.candidateRowKey, ROW_KEY);
});

test("missing and blank visitor IDs fail closed", () => {
  const missing = build();
  delete (missing.identity as unknown as Record<string, unknown>).visitorId;
  expect(missing, "ambiguous", "identity_visitor_id_malformed");
  expect(build({ identity: { visitorId: undefined } }), "ambiguous", "identity_visitor_id_malformed");
  expect(build({ identity: { visitorId: "" } }), "ambiguous", "identity_visitor_id_malformed");
  expect(build({ identity: { visitorId: "   " } }), "ambiguous", "identity_visitor_id_malformed");
});

test("missing and blank event IDs fail closed", () => {
  const missing = build();
  delete (missing.identity as unknown as Record<string, unknown>).eventId;
  expect(missing, "ambiguous", "identity_event_id_malformed");
  expect(build({ identity: { eventId: undefined } }), "ambiguous", "identity_event_id_malformed");
  expect(build({ identity: { eventId: "" } }), "ambiguous", "identity_event_id_malformed");
  expect(build({ identity: { eventId: "   " } }), "ambiguous", "identity_event_id_malformed");
});

test("invalid occurrence timestamp fails closed", () => {
  expect(build({ identity: { occurredAt: "2030-02-30T00:00:00.000Z" } }), "ambiguous", "identity_occurred_at_invalid");
});

test("derived row-key mismatch", () => {
  expect(build({ record: { rowKey: "other-row-key" } }), "ambiguous", "row_key_mismatch");
});

test("partition-key mismatch", () => {
  expect(build({ record: { partitionKey: "synthetic-other-visitor" } }), "ambiguous", "partition_key_mismatch");
});

test("visitor-ID mismatch", () => {
  expect(build({ record: { visitorId: "synthetic-other-visitor" } }), "ambiguous", "visitor_id_mismatch");
});

test("event-ID mismatch", () => {
  expect(build({ record: { id: "synthetic-other-event" } }), "ambiguous", "event_id_mismatch");
});

test("canonical stored id is accepted and eventId-only records are rejected", () => {
  expect(build(), "matching_evidence", "record_matches_trusted_identity");

  const eventIdOnly = build();
  const record = (eventIdOnly.observation as { record: Record<string, unknown> }).record;
  delete record.id;
  record.eventId = EVENT_ID;
  expect(eventIdOnly, "ambiguous", "record_malformed");
});

test("V1 idempotencyKey and legacy id are independently accepted while conflicting identifiers fail closed", () => {
  const v1Record = build();
  const v1StoredRecord = (v1Record.observation as { record: Record<string, unknown> }).record;
  delete v1StoredRecord.id;
  expect(v1Record, "matching_evidence", "record_matches_trusted_identity");

  const legacyRecord = build();
  const legacyStoredRecord = (legacyRecord.observation as { record: Record<string, unknown> }).record;
  delete legacyStoredRecord.idempotencyKey;
  expect(legacyRecord, "matching_evidence", "record_matches_trusted_identity");

  expect(
    build({ record: { idempotencyKey: "synthetic-conflicting-event-101" } }),
    "ambiguous",
    "event_id_mismatch"
  );
});

test("occurrence timestamp mismatch", () => {
  expect(
    build({ record: { occurredAt: OTHER_AT } }),
    "ambiguous",
    "occurred_at_mismatch"
  );
});

test("observed absence is explicitly non-authoritative", () => {
  const assessment = expect(
    { identity: { visitorId: VISITOR, eventId: EVENT_ID, occurredAt: AT }, observation: { availability: "absent_observed" } },
    "observed_absence",
    "absence_observed_not_historical"
  );
  assert.equal(assessment.historicalAbsenceEstablished, false);
});

test("unavailable observation is not absence", () => {
  expect(build({ observation: { availability: "unavailable" } }), "unavailable", "observation_unavailable");
});

test("partial observation remains ambiguous", () => {
  expect(build({ observation: { availability: "partial" } }), "ambiguous", "observation_partial");
});

test("partial and malformed records are rejected", () => {
  const missingCanonicalId = build();
  const missingIdRecord = (missingCanonicalId.observation as { record: Record<string, unknown> }).record;
  delete missingIdRecord.id;
  delete missingIdRecord.idempotencyKey;
  expect(missingCanonicalId, "ambiguous", "record_malformed");
  expect(
    { identity: { visitorId: VISITOR, eventId: EVENT_ID, occurredAt: AT }, observation: { availability: "available", record: null } },
    "ambiguous",
    "record_malformed"
  );
});

test("malformed objects and unexpected properties fail closed", () => {
  expect(null, "ambiguous", "input_malformed");
  expect({ ...build(), unexpected: true }, "ambiguous", "input_malformed");
  expect(
    { identity: { visitorId: VISITOR, eventId: EVENT_ID, occurredAt: AT }, unexpected: true, observation: { availability: "unavailable" } },
    "ambiguous",
    "input_malformed"
  );
  expect(build({ observation: { unexpected: true } }), "ambiguous", "observation_malformed");
  expect(build({ record: { unexpected: true } }), "ambiguous", "record_malformed");
});

test("invalid observation status fails closed", () => {
  expect(build({ observation: { availability: "complete" } }), "ambiguous", "observation_status_invalid");
});

test("Azure Table key restrictions are applied to partition and derived row keys", () => {
  expect(build({ identity: { visitorId: "visitor/invalid" } }), "ambiguous", "identity_visitor_id_invalid_for_partition_key");
  expect(build({ identity: { visitorId: "v".repeat(1025) } }), "ambiguous", "identity_visitor_id_invalid_for_partition_key");
  expect(build({ identity: { eventId: "event?invalid" } }), "ambiguous", "identity_event_id_invalid_for_row_key");
  expect(build({ identity: { eventId: "e".repeat(999) } }), "ambiguous", "identity_event_id_invalid_for_row_key");
});

test("hostile getters and proxies fail closed", () => {
  const getterInput = {
    get identity(): never {
      throw new Error("synthetic hostile getter");
    },
    observation: { availability: "unavailable" }
  };
  expect(getterInput, "ambiguous", "input_malformed");

  let occurredAtGetterInvoked = false;
  const hostileGetterRecord = {
    partitionKey: VISITOR,
    rowKey: ROW_KEY,
    visitorId: VISITOR,
    id: EVENT_ID,
    get occurredAt(): never {
      occurredAtGetterInvoked = true;
      throw new Error("synthetic hostile getter");
    }
  };
  expect(
    { identity: { visitorId: VISITOR, eventId: EVENT_ID, occurredAt: AT }, observation: { availability: "available", record: hostileGetterRecord } },
    "ambiguous",
    "record_malformed"
  );
  assert.equal(occurredAtGetterInvoked, false);

  const hostileProxy = new Proxy({}, {
    ownKeys(): never {
      throw new Error("synthetic hostile proxy");
    }
  });
  expect(hostileProxy, "ambiguous", "adversarial_input");
});

test("assessor imports and uses no storage, network, environment, randomness, or current time", () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), "src/domain/formation/assessFormationEventAcquisition.ts"),
    "utf8"
  );
  const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map(match => match[1]);
  assert.deepEqual(imports, [
    "../../contracts/formationEventEvidenceAcquisition.v1",
    "./formationEventRowKey"
  ]);
  assert.doesNotMatch(source, /@azure|process\.env|\bfetch\s*\(|Date\.now\s*\(|new Date\s*\(\s*\)|Math\.random\s*\(|randomBytes/);
});

console.log(`Formation event evidence acquisition assertions passed (${passed} tests).`);
