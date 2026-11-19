import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { generateKeyPairSync, sign } from "node:crypto";
import { assessSyntheticInspectionAuthority } from "./assess-synthetic-inspection-authority.mjs";
import {
  createSyntheticInspectionConsumptionFixture,
  inspectSyntheticConsumptionFixture,
  simulateSyntheticInspectionConsumption
} from "./simulate-synthetic-inspection-consumption.mjs";

const require = createRequire(import.meta.url);
require("ts-node/register");
const { appendKioskIntakeSubmissionV1 } = require(
  "../../src/repositories/kioskIntakeSubmissionsRepositoryV1.ts"
);
const keys = generateKeyPairSync("ed25519");
const context = {
  keyId: "synthetic_key_001",
  publicKeyPem: keys.publicKey.export({ type: "spki", format: "pem" }),
  issuer: "synthetic-approval-issuer",
  audience: "synthetic-inspection-audience",
  nowMs: Date.parse("2026-11-16T12:00:00.000Z")
};
const payload = {
  name: "Synthetic Kiosk Cleanup Test",
  email: "kiosk-cleanup@example.invalid",
  phone: "",
  visitType: "first",
  interests: ["prayer"],
  invitedBy: "",
  contactConsent: false
};
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

async function request() {
  let fingerprint;
  const table = {
    async createEntity(entity) { fingerprint = entity.payloadHash; },
    async getEntity() { throw new Error("UNEXPECTED_READ"); }
  };
  await appendKioskIntakeSubmissionV1(payload, id, {
    enabled: true, table, now: () => "2026-11-22T15:00:00.000Z"
  });
  return {
    operation: "kiosk.synthetic-intake.inspect-one.v1",
    operationId: "synthetic_operation_001",
    target: {
      subscription: "fbafd6e4-21ad-41d9-8f98-091c3c73ded2",
      resourceGroup: "rg-hope-kiosk-acceptance-20261122",
      account: "sthopekiad20261122",
      table: "KioskIntakeSubmissions",
      partition: "friends-family-2026-11-22",
      submissionId: id,
      payloadFingerprint: fingerprint
    },
    operator: {
      tenantId: "11111111-2222-4333-8444-555555555555",
      objectId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
    },
    uuidEvidence: "synthetic_evidence_001"
  };
}

function envelope(item, changes = {}, privateKey = keys.privateKey) {
  const claims = {
    operation: item.operation,
    operationId: item.operationId,
    target: item.target,
    operator: item.operator,
    uuidEvidence: item.uuidEvidence,
    issuer: context.issuer,
    audience: context.audience,
    issuedAt: "2026-11-16T11:59:00.000Z",
    expiresAt: "2026-11-16T12:05:00.000Z",
    ...changes
  };
  const body = JSON.stringify(claims);
  return {
    keyId: context.keyId,
    payload: body,
    signature: sign(null, Buffer.from(body), privateKey).toString("base64")
  };
}

function check(item, expected, config = context) {
  const result = assessSyntheticInspectionAuthority(item, config);
  assert.equal(result.status, expected);
  for (const key of [
    "operatorVerified", "issuerAuthorized", "uuidEvidenceVerified",
    "replayProtectionVerified", "approvalConsumptionPermitted",
    "inspectionAuthorized", "executionPermitted", "cleanupAuthorized"
  ]) assert.equal(result[key], false);
  return result;
}

test("valid synthetic signature, claimed approval and replay never grant authority", async () => {
  const item = await request();
  item.envelope = envelope(item);
  let externalCalls = 0;
  Object.assign(item, {
    enabled: true, approved: true, execute: true,
    consumed: true, durable: true, replayProtectionVerified: true,
    ledger: { consume() { externalCalls++; } },
    storage: { getEntity() { externalCalls++; } }
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.equal(check(item,
      "EXECUTION_DISABLED_TRUST_AND_REPLAY_UNAVAILABLE"
    ).signatureMatchesSuppliedKey, true);
  }
  assert.equal(externalCalls, 0);
});

test("rejects forged signatures and untrusted supplied keys still cannot authorize", async () => {
  const item = await request();
  const other = generateKeyPairSync("ed25519");
  item.envelope = envelope(item, {}, other.privateKey);
  check(item, "SIGNATURE_INVALID");
  const untrusted = {
    ...context, publicKeyPem: other.publicKey.export({ type: "spki", format: "pem" })
  };
  check(item, "EXECUTION_DISABLED_TRUST_AND_REPLAY_UNAVAILABLE", untrusted);
  item.envelope.payload += " ";
  check(item, "SIGNATURE_INVALID", untrusted);
});

test("rejects other operations and target scope or fingerprint changes", async () => {
  const item = await request();
  item.envelope = envelope(item);
  for (const operation of [
    "kiosk.synthetic-intake.delete-one.v1", "FIRST_CANONICAL_STAFF_BOOTSTRAP",
    "kiosk.device.pair", "visitor.reconcile", ""
  ]) check({ ...item, operation }, "OPERATION_INVALID");
  for (const change of [
    { subscription: "other" }, { resourceGroup: "other" }, { account: "other" },
    { table: "other" }, { partition: "other" }, { submissionId: "invalid" },
    { payloadFingerprint: "0".repeat(64) }, { extra: true }
  ]) check({ ...item, target: { ...item.target, ...change } }, "TARGET_INVALID");
  item.envelope = envelope(item, { operation: "kiosk.synthetic-intake.delete-one.v1" });
  check(item, "APPROVAL_SCOPE_MISMATCH");
});

test("rejects mismatched identity, issuer, audience, UUID, or UUID evidence", async () => {
  const item = await request();
  item.envelope = envelope(item);
  check({ ...item, uuidEvidence: "" }, "UUID_EVIDENCE_MISSING");
  const changes = [
    { operator: { ...item.operator, objectId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } },
    { issuer: "other-issuer" }, { audience: "other-audience" },
    { uuidEvidence: "other_evidence_001" },
    { target: { ...item.target, submissionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } }
  ];
  for (const change of changes) {
    item.envelope = envelope(item, change);
    check(item, "APPROVAL_SCOPE_MISMATCH");
  }
});

test("rejects expired, future, excessive, and malformed approval validity", async () => {
  const item = await request();
  for (const change of [
    { issuedAt: "2026-11-16T11:40:00.000Z", expiresAt: "2026-11-16T11:45:00.000Z" },
    { issuedAt: "2026-11-16T12:01:00.000Z" },
    { expiresAt: "2026-11-16T12:20:00.000Z" },
    { issuedAt: null },
    { expiresAt: "invalid" }
  ]) {
    item.envelope = envelope(item, change);
    check(item, "APPROVAL_TIME_INVALID");
  }
});

function checkConsumption(result, status, fixtureConsumed = false) {
  assert.equal(result.status, status);
  assert.equal(result.fixtureConsumed, fixtureConsumed);
  for (const key of [
    "operatorVerified", "issuerAuthorized", "uuidEvidenceVerified",
    "replayProtectionVerified", "durableConsumptionVerified",
    "inspectionAuthorized", "executionPermitted", "cleanupAuthorized"
  ]) assert.equal(result[key], false);
}

test("fixture consumption is single-use but never provides live authorization", async () => {
  const item = await request();
  item.envelope = envelope(item);
  const fixture = createSyntheticInspectionConsumptionFixture(context, item.operator);
  checkConsumption(inspectSyntheticConsumptionFixture(item.operationId, fixture),
    "FIXTURE_AUDIT_UNAVAILABLE");
  checkConsumption(simulateSyntheticInspectionConsumption(item, fixture),
    "FIXTURE_CONSUMPTION_ONLY", true);
  checkConsumption(inspectSyntheticConsumptionFixture(item.operationId, fixture),
    "FIXTURE_AUDIT_MATCHED");
  checkConsumption(simulateSyntheticInspectionConsumption(item, fixture), "FIXTURE_REPLAY");
  const freshFixture = createSyntheticInspectionConsumptionFixture(context, item.operator);
  checkConsumption(simulateSyntheticInspectionConsumption(item, freshFixture),
    "FIXTURE_CONSUMPTION_ONLY", true);
});

test("unbranded ledgers, claimed transactions and caller keys cannot grant authority", async () => {
  const item = await request();
  item.envelope = envelope(item);
  let calls = 0;
  const fake = { submitTransaction() { calls++; return true; } };
  checkConsumption(simulateSyntheticInspectionConsumption({
    ...item, approved: true, consumed: true, execute: true
  }, fake), "FIXTURE_REQUIRED");
  assert.equal(calls, 0);
  const otherKeys = generateKeyPairSync("ed25519");
  const otherContext = {
    ...context, publicKeyPem: otherKeys.publicKey.export({ type: "spki", format: "pem" })
  };
  const fixture = createSyntheticInspectionConsumptionFixture(otherContext, item.operator);
  checkConsumption(simulateSyntheticInspectionConsumption(item, fixture), "APPROVAL_REJECTED");
  item.envelope = envelope(item, {}, otherKeys.privateKey);
  checkConsumption(simulateSyntheticInspectionConsumption(item, fixture),
    "FIXTURE_CONSUMPTION_ONLY", true);
});

test("competing fixture attempts cannot both consume the same operation", async () => {
  const item = await request();
  item.envelope = envelope(item);
  const fixture = createSyntheticInspectionConsumptionFixture(context, item.operator);
  const results = await Promise.all([
    Promise.resolve().then(() => simulateSyntheticInspectionConsumption(item, fixture)),
    Promise.resolve().then(() => simulateSyntheticInspectionConsumption(item, fixture))
  ]);
  checkConsumption(results[0], "FIXTURE_CONSUMPTION_ONLY", true);
  checkConsumption(results[1], "FIXTURE_REPLAY");
});

test("fixture consumption rejects invalid approvals and operator mismatches before consumption", async () => {
  const item = await request();
  const fixture = createSyntheticInspectionConsumptionFixture(context, item.operator);
  for (const changes of [
    { operation: "kiosk.synthetic-intake.delete-one.v1" },
    { issuer: "other-issuer" }, { audience: "other-audience" },
    { operator: { ...item.operator, objectId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } },
    { target: { ...item.target, payloadFingerprint: "0".repeat(64) } },
    { issuedAt: "2026-11-16T11:40:00.000Z", expiresAt: "2026-11-16T11:45:00.000Z" },
    { issuedAt: "2026-11-16T12:01:00.000Z" }
  ]) {
    item.envelope = envelope(item, changes);
    checkConsumption(simulateSyntheticInspectionConsumption(item, fixture), "APPROVAL_REJECTED");
  }
  item.envelope = envelope(item, {}, generateKeyPairSync("ed25519").privateKey);
  checkConsumption(simulateSyntheticInspectionConsumption(item, fixture), "APPROVAL_REJECTED");
  const differentOperator = {
    ...item.operator, objectId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
  };
  const otherFixture = createSyntheticInspectionConsumptionFixture(context, differentOperator);
  item.envelope = envelope(item);
  checkConsumption(simulateSyntheticInspectionConsumption(item, otherFixture),
    "FIXTURE_OPERATOR_MISMATCH");
  checkConsumption(simulateSyntheticInspectionConsumption(item, fixture),
    "FIXTURE_CONSUMPTION_ONLY", true);
});
