import assert from "node:assert/strict";
import {
  assessCareBulkPerVisitorReceipts
} from "../../src/services/authorization/careBulkPerVisitorReceiptContract";

const membership = {
  requestId: "synthetic-request",
  kind: "assign" as const,
  assigneeId: "synthetic-staff",
  visitorIds: ["visitor-a", "visitor-b", "visitor-c"]
};

function receipt(
  visitorId: string,
  observation = "observed"
) {
  return {
    receiptId: `receipt-${visitorId}`,
    requestId: membership.requestId,
    visitorId,
    kind: membership.kind,
    assigneeId: membership.assigneeId,
    observation
  };
}

function assess(receipts: unknown) {
  return assessCareBulkPerVisitorReceipts({ membership, receipts });
}

type Assessment = ReturnType<typeof assess>;

function safe(value: Assessment) {
  assert.equal(value.advisoryOnly, true);
  assert.equal(value.receiptAuthenticityVerified, false);
  assert.equal(value.writerCoverageVerified, false);
  assert.equal(value.durableReceiptVerified, false);
  assert.equal(value.assignmentExecutionVerified, false);
  assert.equal(value.historicalReconciliationVerified, false);
  assert.equal(value.authorizationPermitted, false);
  assert.equal(value.executionPermitted, false);
  assert.equal(value.retryPermitted, false);
  assert.equal(value.automaticRecoveryPermitted, false);
  assert.equal(value.productionRolloutPermitted, false);
}

const complete = assess(
  membership.visitorIds.map(visitorId => receipt(visitorId))
);
assert.equal(complete.status, "observed_unverified");
assert.equal(complete.inputRejected, false);
assert.deepEqual(complete.unresolvedVisitorIds, []);
safe(complete);

const partial = assess([
  receipt("visitor-a"),
  receipt("visitor-b", "uncertain")
]);
assert.equal(partial.status, "requires_reconciliation");
assert.deepEqual(partial.unresolvedVisitorIds, [
  "visitor-b", "visitor-c"
]);
safe(partial);

const contradictory = assess([
  receipt("visitor-a", "contradictory")
]);
assert.equal(contradictory.status, "contradictory");
safe(contradictory);

const unassign = assessCareBulkPerVisitorReceipts({
  membership: {
    ...membership,
    kind: "unassign",
    assigneeId: null
  },
  receipts: [{
    ...receipt("visitor-a"),
    kind: "unassign",
    assigneeId: null
  }]
});
assert.equal(unassign.status, "requires_reconciliation");
safe(unassign);

const duplicateVisitor = assess([
  receipt("visitor-a"),
  { ...receipt("visitor-a"), receiptId: "different-receipt" }
]);
assert.equal(duplicateVisitor.status, "invalid_input");
safe(duplicateVisitor);

const duplicateReceiptId = assess([
  receipt("visitor-a"),
  { ...receipt("visitor-b"), receiptId: "receipt-visitor-a" }
]);
assert.equal(duplicateReceiptId.status, "invalid_input");
safe(duplicateReceiptId);

const invalid: unknown[] = [
  null,
  {},
  { membership, receipts: [receipt("outside")] },
  { membership, receipts: [{ ...receipt("visitor-a"), requestId: "wrong" }] },
  { membership, receipts: [{ ...receipt("visitor-a"), kind: "unassign" }] },
  { membership, receipts: [{ ...receipt("visitor-a"), assigneeId: null }] },
  { membership, receipts: [{ ...receipt("visitor-a"), receiptId: "" }] },
  { membership, receipts: [{ ...receipt("visitor-a"), observation: "unknown" }] },
  { membership, receipts: [,] },
  { membership, receipts: [receipt("visitor-a"), receipt("visitor-a")] },
  { membership, receipts: [Object.defineProperty(
    { ...receipt("visitor-a") },
    "observation",
    { enumerable: true, get() { throw Error("hostile"); } }
  )] },
  { membership: { ...membership, visitorIds: ["visitor-a", "visitor-a"] }, receipts: [] }
];

const revoked = Proxy.revocable({}, {});
revoked.revoke();
invalid.push(revoked.proxy);

const inherited = Object.create({ membership });
inherited.receipts = [];
invalid.push(inherited);

for (const input of invalid) {
  const value = assessCareBulkPerVisitorReceipts(input);
  assert.equal(value.status, "invalid_input");
  assert.equal(value.inputRejected, true);
  safe(value);
}

assert.equal(Object.isFrozen(complete), true);
assert.equal(Object.isFrozen(complete.receipts), true);
assert.equal(Object.isFrozen(complete.receipts[0]), true);

// STEP_703_ADVERSARIAL_RECEIPTS

// Observation order must not change request membership semantics.
const outOfOrder = assess([
  receipt("visitor-c"),
  receipt("visitor-a")
]);
assert.equal(outOfOrder.status, "requires_reconciliation");
assert.deepEqual(outOfOrder.unresolvedVisitorIds, ["visitor-b"]);
safe(outOfOrder);

// Empty receipt sets never imply completed assignment execution.
const emptyEvidence = assess([]);
assert.equal(emptyEvidence.status, "requires_reconciliation");
assert.deepEqual(
  emptyEvidence.unresolvedVisitorIds,
  membership.visitorIds
);
safe(emptyEvidence);

// A reported failure or missing acknowledgment is unresolved.
for (const observation of ["failed", "missing", "uncertain"]) {
  const value = assess([
    receipt("visitor-a"),
    receipt("visitor-b", observation),
    receipt("visitor-c")
  ]);
  assert.equal(value.status, "requires_reconciliation");
  assert.deepEqual(value.unresolvedVisitorIds, ["visitor-b"]);
  safe(value);
}

// Contradictions take precedence over other unresolved observations.
const mixed = assess([
  receipt("visitor-a", "uncertain"),
  receipt("visitor-b", "contradictory"),
  receipt("visitor-c")
]);
assert.equal(mixed.status, "contradictory");
safe(mixed);

// An accessor at an array index cannot execute as trusted data.
const accessorReceipts = [receipt("visitor-a")];
Object.defineProperty(accessorReceipts, "0", {
  configurable: true,
  enumerable: true,
  get() {
    throw Error("hostile_index_accessor");
  }
});
const accessorAssessment = assess(accessorReceipts);
assert.equal(accessorAssessment.status, "invalid_input");
safe(accessorAssessment);

// Revoked proxies nested inside the receipt list must fail closed.
const nestedRevoked = Proxy.revocable(receipt("visitor-a"), {});
nestedRevoked.revoke();
const revokedAssessment = assess([nestedRevoked.proxy]);
assert.equal(revokedAssessment.status, "invalid_input");
safe(revokedAssessment);

// Unexpected receipt properties are rejected.
const extraProperty = assess([{
  ...receipt("visitor-a"),
  unexpected: "not_allowed"
}]);
assert.equal(extraProperty.status, "invalid_input");
safe(extraProperty);

// A complete observation set remains unverified, not executable.
const reversedComplete = assess([
  receipt("visitor-c"),
  receipt("visitor-b"),
  receipt("visitor-a")
]);
assert.equal(reversedComplete.status, "observed_unverified");
assert.deepEqual(reversedComplete.unresolvedVisitorIds, []);
safe(reversedComplete);

console.log("[PASS] Out-of-order and empty evidence remain safe");
console.log("[PASS] Failed, missing, uncertain and contradictory evidence covered");
console.log("[PASS] Hostile nested receipts and extra properties rejected");
console.log("[PASS] Receipt correlation remains non-authorizing");
console.log("[PASS] Partial and ambiguous receipts remain unresolved");
console.log("[PASS] Duplicate, conflicting and hostile receipts rejected");
console.log("[PASS] All Bulk Care per-visitor receipt proofs passed");
