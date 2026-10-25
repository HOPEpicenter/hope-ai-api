import assert from "node:assert/strict";
import {
  assessCareBulkWriterParticipationEvidence
} from "../../src/services/authorization/careBulkWriterParticipationEvidenceContract";

const membership = {
  requestId: "synthetic-request",
  kind: "assign" as const,
  assigneeId: "synthetic-staff",
  visitorIds: ["visitor-a", "visitor-b", "visitor-c"]
};

const path = "postCareCandidateAssignBulk";

function assess(observations: unknown) {
  return assessCareBulkWriterParticipationEvidence({
    writerPath: path,
    membership,
    observations
  });
}

function safe(value: ReturnType<typeof assess>) {
  assert.equal(value.advisoryOnly, true);
  assert.equal(value.writerCoverageVerified, false);
  assert.equal(value.durableParticipationVerified, false);
  assert.equal(value.historicalReconciliationVerified, false);
  assert.equal(value.crossStorageConsistencyVerified, false);
  assert.equal(value.authorizationPermitted, false);
  assert.equal(value.executionPermitted, false);
  assert.equal(value.retryPermitted, false);
  assert.equal(value.automaticRecoveryPermitted, false);
  assert.equal(value.productionRolloutPermitted, false);
}

const allObserved = assess(
  membership.visitorIds.map(visitorId => ({
    visitorId,
    observation: "observed"
  }))
);
assert.equal(allObserved.status, "observed_consistent_not_complete");
assert.deepEqual(allObserved.unresolvedVisitorIds, []);
safe(allObserved);

const partial = assess([
  { visitorId: "visitor-a", observation: "observed" }
]);
assert.equal(partial.status, "requires_reconciliation");
assert.deepEqual(partial.unresolvedVisitorIds, [
  "visitor-b", "visitor-c"
]);
safe(partial);

for (const observation of [
  "missing", "failed", "uncertain"
]) {
  const value = assess([
    { visitorId: "visitor-a", observation }
  ]);
  assert.equal(value.status, "requires_reconciliation");
  safe(value);
}

const contradiction = assess([
  { visitorId: "visitor-a", observation: "contradictory" }
]);
assert.equal(contradiction.status, "contradictory");
safe(contradiction);

const wrongPath = assessCareBulkWriterParticipationEvidence({
  writerPath: "postCareCandidateUnassignBulk",
  membership,
  observations: []
});
assert.equal(wrongPath.status, "invalid_input");
safe(wrongPath);

const unassign = assessCareBulkWriterParticipationEvidence({
  writerPath: "postCareCandidateUnassignBulk",
  membership: {
    ...membership,
    kind: "unassign",
    assigneeId: null
  },
  observations: []
});
assert.equal(unassign.status, "requires_reconciliation");
safe(unassign);

const invalidCases: unknown[] = [
  null,
  {},
  {
    writerPath: path,
    membership,
    observations: [
      { visitorId: "visitor-a", observation: "observed" },
      { visitorId: "visitor-a", observation: "observed" }
    ]
  },
  {
    writerPath: path,
    membership,
    observations: [
      { visitorId: "outside-membership", observation: "observed" }
    ]
  },
  {
    writerPath: path,
    membership,
    observations: [
      { visitorId: "visitor-a", observation: "unknown" }
    ]
  },
  {
    writerPath: path,
    membership,
    observations: [ , ]
  },
  {
    writerPath: path,
    membership,
    observations: [
      Object.defineProperty(
        { visitorId: "visitor-a" },
        "observation",
        { enumerable: true, get() { throw Error("hostile"); } }
      )
    ]
  }
];

const revoked = Proxy.revocable({}, {});
revoked.revoke();
invalidCases.push(revoked.proxy);

for (const input of invalidCases) {
  const value = assessCareBulkWriterParticipationEvidence(input);
  assert.equal(value.status, "invalid_input");
  assert.equal(value.inputRejected, true);
  safe(value);
}

// A lost acknowledgment after an earlier observed operation is unresolved.
const lostAcknowledgment = assess([
  { visitorId: "visitor-a", observation: "observed" },
  { visitorId: "visitor-b", observation: "uncertain" }
]);
assert.equal(lostAcknowledgment.status, "requires_reconciliation");
assert.deepEqual(lostAcknowledgment.observedVisitorIds, ["visitor-a"]);
assert.deepEqual(lostAcknowledgment.unresolvedVisitorIds, [
  "visitor-b", "visitor-c"
]);
safe(lostAcknowledgment);

// Ordering of caller observations must not change membership ordering.
const reversedEvidence = assess([
  { visitorId: "visitor-c", observation: "observed" },
  { visitorId: "visitor-a", observation: "observed" },
  { visitorId: "visitor-b", observation: "observed" }
]);
assert.equal(
  reversedEvidence.status,
  "observed_consistent_not_complete"
);
assert.deepEqual(reversedEvidence.observedVisitorIds, membership.visitorIds);
safe(reversedEvidence);

// Both writer paths remain advisory even with all observations supplied.
const unassignAllObserved = assessCareBulkWriterParticipationEvidence({
  writerPath: "postCareCandidateUnassignBulk",
  membership: { ...membership, kind: "unassign", assigneeId: null },
  observations: membership.visitorIds.map(visitorId => ({
    visitorId,
    observation: "observed"
  }))
});
assert.equal(
  unassignAllObserved.status,
  "observed_consistent_not_complete"
);
safe(unassignAllObserved);

// Contradictory evidence takes precedence over missing observations.
const mixedContradiction = assess([
  { visitorId: "visitor-a", observation: "contradictory" },
  { visitorId: "visitor-b", observation: "uncertain" }
]);
assert.equal(mixedContradiction.status, "contradictory");
safe(mixedContradiction);

// Inherited or accessor properties cannot masquerade as valid evidence.
const inheritedEntry = Object.create({
  observation: "observed"
});
inheritedEntry.visitorId = "visitor-a";

const topLevelAccessor = Object.defineProperty(
  {
    membership,
    observations: []
  },
  "writerPath",
  {
    enumerable: true,
    get() {
      throw new Error("synthetic_top_level_accessor");
    }
  }
);

const malformedMembership = {
  ...membership,
  visitorIds: ["visitor-a", "visitor-a"]
};

const extraTopLevelKey = {
  writerPath: path,
  membership,
  observations: [],
  additional: true
};

const invalidStructure: unknown[] = [
  {
    writerPath: path,
    membership,
    observations: [inheritedEntry]
  },
  topLevelAccessor,
  {
    writerPath: path,
    membership: malformedMembership,
    observations: []
  },
  extraTopLevelKey,
  {
    writerPath: path,
    membership,
    observations: [
      { visitorId: "visitor-a", observation: "observed", extra: true }
    ]
  }
];

const inheritedTopLevel = Object.create({ writerPath: path });
inheritedTopLevel.membership = membership;
inheritedTopLevel.observations = [];
invalidStructure.push(inheritedTopLevel);

// An accessor at an array index is rejected, even when the array is dense.
const accessorArray = [
  { visitorId: "visitor-a", observation: "observed" }
];
Object.defineProperty(accessorArray, "0", {
  configurable: true,
  enumerable: true,
  get() {
    throw new Error("synthetic_array_accessor");
  }
});
invalidStructure.push({
  writerPath: path,
  membership,
  observations: accessorArray
});

const revokedNested = Proxy.revocable({}, {});
revokedNested.revoke();
invalidStructure.push({
  writerPath: path,
  membership,
  observations: [revokedNested.proxy]
});

for (const input of invalidStructure) {
  const value = assessCareBulkWriterParticipationEvidence(input);
  assert.equal(value.status, "invalid_input");
  assert.equal(value.inputRejected, true);
  safe(value);
}

console.log("[PASS] Lost acknowledgment and writer paths remain advisory");
console.log("[PASS] Inherited, accessor, and nested hostile inputs rejected");
assert.equal(Object.isFrozen(allObserved), true);
assert.equal(Object.isFrozen(partial.unresolvedVisitorIds), true);

console.log("[PASS] Consistent observations remain non-authorizing");
console.log("[PASS] Partial and ambiguous evidence requires reconciliation");
console.log("[PASS] Contradictions and hostile inputs fail closed");
console.log("[PASS] All Bulk Care writer participation proofs passed");
