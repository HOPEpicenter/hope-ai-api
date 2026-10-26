import * as assert from "node:assert/strict";
import {
  assessCareBulkEvidenceGaps,
  type CareBulkEvidenceGapAssessment
} from "../../src/services/authorization/careBulkEvidenceGapAssessment";

const membership = {
  requestId: "synthetic_bulk_request",
  kind: "assign" as const,
  assigneeId: "synthetic_staff",
  visitorIds: ["synthetic_visitor_a", "synthetic_visitor_b"]
};

const writerPath = "postCareCandidateAssignBulk";

const receipts = membership.visitorIds.map((visitorId, index) => ({
  receiptId: `synthetic_receipt_${index}`,
  requestId: membership.requestId,
  visitorId,
  kind: "assign" as const,
  assigneeId: membership.assigneeId,
  observation: "observed"
}));

const observations = membership.visitorIds.map(visitorId => ({
  visitorId,
  observation: "observed"
}));

const operations = membership.visitorIds.map((visitorId, index) => ({
  visitorId,
  operationId: `synthetic_operation_${index}`,
  ledgerObservation: "observed_current"
}));

function assess(
  overrides: Record<string, unknown> = {}
): CareBulkEvidenceGapAssessment {
  return assessCareBulkEvidenceGaps({
    membership,
    writerPath,
    receipts,
    observations,
    operations,
    ...overrides
  });
}

const safetyFlags = [
  "membershipDurabilityVerified",
  "receiptAuthenticityVerified",
  "durableReceiptVerified",
  "writerCoverageVerified",
  "durableParticipationVerified",
  "assignmentExecutionVerified",
  "crossStorageConsistencyVerified",
  "historicalReconciliationVerified",
  "authorizationPermitted",
  "executionPermitted",
  "retryPermitted",
  "automaticRecoveryPermitted",
  "productionRolloutPermitted",
  "authoritative",
  "complete"
] as const;

function safe(result: CareBulkEvidenceGapAssessment): void {
  assert.equal(result.advisoryOnly, true);
  assert.equal(result.reconciliationRequired, true);
  assert.equal(result.manualInterventionRequired, true);

  for (const flag of safetyFlags) {
    assert.equal(result[flag], false, `${flag} must stay false`);
  }

  assert.ok(result.diagnostics.includes(
    "bulk_request_membership_not_durably_verified"
  ));
  assert.ok(result.diagnostics.includes(
    "assignment_execution_not_verified"
  ));
  assert.ok(result.diagnostics.includes(
    "historical_completeness_not_verified"
  ));
}

const complete = assess();
assert.equal(complete.status, "observations_consistent_not_complete");
assert.equal(complete.inputRejected, false);
assert.equal(complete.requestId, membership.requestId);
assert.equal(complete.intendedVisitorCount, 2);
assert.deepEqual(complete.unresolvedVisitorIds, []);
safe(complete);
console.log("[PASS] Complete-looking evidence remains unverified");

const missingReceipt = assess({
  receipts: receipts.slice(0, 1)
});
assert.equal(missingReceipt.status, "requires_reconciliation");
assert.deepEqual(missingReceipt.unresolvedVisitorIds, [
  "synthetic_visitor_b"
]);
safe(missingReceipt);
console.log("[PASS] Missing receipt remains unresolved");

const missingWriter = assess({
  observations: observations.slice(0, 1)
});
assert.equal(missingWriter.status, "requires_reconciliation");
assert.deepEqual(missingWriter.unresolvedVisitorIds, [
  "synthetic_visitor_b"
]);
safe(missingWriter);
console.log("[PASS] Missing writer observation remains unresolved");

const missingLedger = assess({
  operations: operations.slice(0, 1)
});
assert.equal(missingLedger.status, "requires_reconciliation");
assert.deepEqual(missingLedger.unresolvedVisitorIds, [
  "synthetic_visitor_b"
]);
safe(missingLedger);
console.log("[PASS] Missing ledger observation remains unresolved");

const union = assess({
  receipts: [receipts[0]],
  observations: [observations[1]],
  operations: []
});
assert.equal(union.status, "requires_reconciliation");
assert.deepEqual(union.unresolvedVisitorIds, [
  "synthetic_visitor_a",
  "synthetic_visitor_b"
]);
safe(union);
console.log("[PASS] Unresolved visitors union across evidence sources");

const contradictoryReceipt = assess({
  receipts: [
    { ...receipts[0], observation: "contradictory" },
    receipts[1]
  ]
});
assert.equal(contradictoryReceipt.status, "contradictory");
safe(contradictoryReceipt);
console.log("[PASS] Contradictory receipt takes precedence");

const contradictoryWriter = assess({
  observations: [
    { ...observations[0], observation: "contradictory" },
    observations[1]
  ]
});
assert.equal(contradictoryWriter.status, "contradictory");
safe(contradictoryWriter);
console.log("[PASS] Contradictory writer takes precedence");

const contradictoryLedger = assess({
  operations: [
    { ...operations[0], ledgerObservation: "inconsistent" },
    operations[1]
  ]
});
assert.equal(contradictoryLedger.status, "contradictory");
safe(contradictoryLedger);
console.log("[PASS] Contradictory ledger takes precedence");

const invalidCases: Array<[string, unknown]> = [
  ["null input", null],
  ["empty object", {}],
  ["wrong writer path", {
    membership, writerPath: "postCareCandidateUnassignBulk",
    receipts, observations, operations
  }],
  ["duplicate receipt", {
    membership, writerPath,
    receipts: [receipts[0], receipts[0]],
    observations, operations
  }],
  ["unknown visitor", {
    membership, writerPath, receipts,
    observations: [{ visitorId: "unknown", observation: "observed" }],
    operations
  }],
  ["sparse receipts", {
    membership, writerPath,
    receipts: new Array(1),
    observations, operations
  }]
];

for (const [label, input] of invalidCases) {
  const result = assessCareBulkEvidenceGaps(input);
  assert.equal(result.status, "invalid_input", label);
  assert.equal(result.inputRejected, true, label);
  safe(result);
}
console.log("[PASS] Malformed and inconsistent inputs fail closed");

const accessorInput: Record<string, unknown> = {
  membership, writerPath, receipts, observations, operations
};
Object.defineProperty(accessorInput, "membership", {
  enumerable: true,
  get() { throw new Error("synthetic_accessor"); }
});

const hostile = [
  accessorInput,
  new Proxy({}, {
    ownKeys() { throw new Error("synthetic_proxy"); }
  }),
  Proxy.revocable({}, {}).proxy
];

for (const input of hostile) {
  const result = assessCareBulkEvidenceGaps(input);
  assert.equal(result.status, "invalid_input");
  safe(result);
}

const revoked = Proxy.revocable({}, {});
revoked.revoke();
const revokedResult = assessCareBulkEvidenceGaps(revoked.proxy);
assert.equal(revokedResult.status, "invalid_input");
safe(revokedResult);
console.log("[PASS] Accessors and hostile proxies fail closed");

const unassignMembership = {
  requestId: "synthetic_unassign",
  kind: "unassign" as const,
  assigneeId: null,
  visitorIds: ["synthetic_visitor_c"]
};

const unassign = assess({
  membership: unassignMembership,
  writerPath: "postCareCandidateUnassignBulk",
  receipts: [{
    receiptId: "synthetic_unassign_receipt",
    requestId: unassignMembership.requestId,
    visitorId: "synthetic_visitor_c",
    kind: "unassign",
    assigneeId: null,
    observation: "observed"
  }],
  observations: [{
    visitorId: "synthetic_visitor_c",
    observation: "observed"
  }],
  operations: [{
    visitorId: "synthetic_visitor_c",
    operationId: "synthetic_unassign_operation",
    ledgerObservation: "observed_historical"
  }]
});

assert.equal(unassign.status, "observations_consistent_not_complete");
assert.equal(unassign.requestId, unassignMembership.requestId);
safe(unassign);
console.log("[PASS] Unassign observations remain advisory");

// Cross-source observed-versus-failed regressions.
// These are conflicting caller observations, not authenticated facts.
const receiptFailedWriterObserved = assess({
  receipts: [
    { ...receipts[0], observation: "failed" },
    receipts[1]
  ]
});
assert.equal(receiptFailedWriterObserved.status, "contradictory");
assert.deepEqual(receiptFailedWriterObserved.unresolvedVisitorIds, [
  "synthetic_visitor_a"
]);
assert.ok(receiptFailedWriterObserved.diagnostics.includes(
  "cross_source_observation_disagreement"
));
safe(receiptFailedWriterObserved);
console.log("[PASS] Failed receipt versus observed writer is contradictory");

const writerFailedReceiptObserved = assess({
  observations: [
    { ...observations[0], observation: "failed" },
    observations[1]
  ]
});
assert.equal(writerFailedReceiptObserved.status, "contradictory");
assert.deepEqual(writerFailedReceiptObserved.unresolvedVisitorIds, [
  "synthetic_visitor_a"
]);
assert.ok(writerFailedReceiptObserved.diagnostics.includes(
  "cross_source_observation_disagreement"
));
safe(writerFailedReceiptObserved);
console.log("[PASS] Failed writer versus observed receipt is contradictory");

const observedLedgerAgainstFailures = assess({
  receipts: [
    { ...receipts[0], observation: "failed" },
    receipts[1]
  ],
  observations: [
    { ...observations[0], observation: "failed" },
    observations[1]
  ]
});
assert.equal(observedLedgerAgainstFailures.status, "contradictory");
assert.ok(observedLedgerAgainstFailures.diagnostics.includes(
  "cross_source_observation_disagreement"
));
safe(observedLedgerAgainstFailures);
console.log("[PASS] Observed ledger versus failed evidence is contradictory");

const failedWithoutObserved = assess({
  receipts: [
    { ...receipts[0], observation: "failed" },
    receipts[1]
  ],
  observations: [
    { ...observations[0], observation: "failed" },
    observations[1]
  ],
  operations: [operations[1]]
});
assert.equal(failedWithoutObserved.status, "requires_reconciliation");
assert.deepEqual(failedWithoutObserved.unresolvedVisitorIds, [
  "synthetic_visitor_a"
]);
assert.equal(
  failedWithoutObserved.diagnostics.includes(
    "cross_source_observation_disagreement"
  ),
  false
);
safe(failedWithoutObserved);
console.log("[PASS] Failed evidence without observed counterclaim remains unresolved");

const uncertainWriter = assess({
  observations: [
    { ...observations[0], observation: "uncertain" },
    observations[1]
  ]
});
assert.equal(uncertainWriter.status, "requires_reconciliation");
assert.equal(
  uncertainWriter.diagnostics.includes(
    "cross_source_observation_disagreement"
  ),
  false
);
safe(uncertainWriter);
console.log("[PASS] Uncertain observation is not a contradiction");

const missingReceiptEvidence = assess({
  receipts: [receipts[1]]
});
assert.equal(missingReceiptEvidence.status, "requires_reconciliation");
assert.equal(
  missingReceiptEvidence.diagnostics.includes(
    "cross_source_observation_disagreement"
  ),
  false
);
safe(missingReceiptEvidence);
console.log("[PASS] Absent receipt is not a contradiction");

const notInspectedLedger = assess({
  operations: [
    { ...operations[0], ledgerObservation: "not_inspected" },
    operations[1]
  ]
});
assert.equal(notInspectedLedger.status, "requires_reconciliation");
assert.equal(
  notInspectedLedger.diagnostics.includes(
    "cross_source_observation_disagreement"
  ),
  false
);
safe(notInspectedLedger);
console.log("[PASS] Not-inspected ledger remains unresolved");

const explicitContradiction = assess({
  receipts: [
    { ...receipts[0], observation: "contradictory" },
    receipts[1]
  ]
});
assert.equal(explicitContradiction.status, "contradictory");
assert.ok(explicitContradiction.diagnostics.includes(
  "contradictory_caller_evidence"
));
safe(explicitContradiction);
console.log("[PASS] Explicit contradiction remains fail-closed");

console.log("[PASS] All Bulk Care evidence-gap assessment tests passed");
