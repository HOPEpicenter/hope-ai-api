import assert from "node:assert/strict";
import {
  planTokenCustodyAtomicReceipt
} from "../../src/services/authorization/planTokenCustodyAtomicReceipt";
import {
  inspectTokenCustodyReceiptReconciliation
} from "../../src/services/authorization/inspectTokenCustodyReceiptReconciliation";

const input = {
  recordId: "synthetic-custody-1",
  etag: '"synthetic-etag"',
  receiptId: "123e4567-e89b-42d3-a456-426614174000",
  snapshot: {
    recordId: "synthetic-custody-1",
    revision: 3,
    rotationRevision: 2,
    revocationRevision: 0,
    state: "active" as const,
    accessExpiresAtMs: 1000
  },
  command: {
    action: "rotate" as const,
    expectedRevision: 3,
    expectedRotationRevision: 2,
    expectedRevocationRevision: 0,
    authorized: true,
    executionEnabled: true,
    nextAccessExpiresAtMs: 2000
  }
};

const plan = planTokenCustodyAtomicReceipt(input);

assert.equal(plan.outcome, "proposed");
if (plan.outcome !== "proposed") {
  throw new Error("Invalid fixture");
}

const [update, create] = plan.actions;

if (update.kind !== "update" || create.kind !== "create") {
  throw new Error("Unexpected custody transaction action kinds");
}

const observation = {
  metadata: {
    partitionKey: plan.actions[0].partitionKey,
    rowKey: plan.actions[0].rowKey,
    snapshotJson: update.snapshotJson,
    etag: '"observed-metadata-etag"'
  },
  receipt: {
    partitionKey: plan.actions[1].partitionKey,
    rowKey: plan.actions[1].rowKey,
    receiptJson: create.receiptJson,
    etag: '"observed-receipt-etag"'
  }
};

let passed = 0;

function test(
  name: string,
  candidate: unknown,
  expected: string,
  candidatePlan: unknown = plan
): void {
  const actual = inspectTokenCustodyReceiptReconciliation(
    candidatePlan, candidate
  );

  assert.equal(actual.status, expected);
  assert.equal(actual.executionPermitted, false);
  assert.equal(actual.retryPermitted, false);
  passed++;
  console.log(`PASS ${name}`);
}

test("matching receipt recorded", observation, "recorded");
test("missing receipt unproven",
  { ...observation, receipt: null }, "absent_unproven");
test("missing metadata unproven",
  { ...observation, metadata: null }, "absent_unproven");
test("reader unavailable unresolved",
  { ...observation, receipt: undefined }, "unresolved");
test("missing observation unresolved", null, "unresolved");
test("denied plan unresolved", observation, "unresolved",
  planTokenCustodyAtomicReceipt({
    ...input,
    command: { ...input.command, executionEnabled: false }
  })
);
test("cross-partition receipt conflicts", {
  ...observation,
  receipt: { ...observation.receipt, partitionKey: "wrong" }
}, "conflicting_evidence");
test("wrong receipt identity conflicts", {
  ...observation,
  receipt: { ...observation.receipt, rowKey: "audit-other" }
}, "conflicting_evidence");
test("wildcard etag conflicts", {
  ...observation,
  metadata: { ...observation.metadata, etag: "*" }
}, "conflicting_evidence");
test("malformed receipt conflicts", {
  ...observation,
  receipt: { ...observation.receipt, receiptJson: "{invalid" }
}, "conflicting_evidence");
test("stale metadata conflicts", {
  ...observation,
  metadata: {
    ...observation.metadata,
    snapshotJson: JSON.stringify(input.snapshot)
  }
}, "conflicting_evidence");
test("injected credential field conflicts", {
  ...observation,
  metadata: {
    ...observation.metadata,
    snapshotJson: JSON.stringify({
      ...JSON.parse(observation.metadata.snapshotJson),
      refreshToken: "synthetic-never-persist"
    })
  }
}, "conflicting_evidence");
test("receipt revision mismatch conflicts", {
  ...observation,
  receipt: {
    ...observation.receipt,
    receiptJson: JSON.stringify({
      ...JSON.parse(observation.receipt.receiptJson),
      nextRevision: 999
    })
  }
}, "conflicting_evidence");
test("extra receipt field conflicts", {
  ...observation,
  receipt: {
    ...observation.receipt,
    unexpected: true
  }
}, "conflicting_evidence");
test("extra plan field unresolved",
  observation, "unresolved", { ...plan, authorized: true });

assert.equal(passed, 15);
console.log("CUSTODY_RECEIPT_RECONCILIATION=15_OF_15_PASS");
