import assert from "node:assert/strict";
import {
  FORMATION_ASSIGNMENT_WRITER_PATHS,
  assessFormationAssignmentWriterParticipation
} from "../../src/services/authorization/formationAssignmentWriterParticipationContract";

const observed = {
  ledger: "observed",
  formationEvent: "observed",
  globalTimeline: "observed",
  profile: "observed"
} as const;

function assess(
  writerPath: string,
  acknowledgments: Record<string, string> = observed
) {
  return assessFormationAssignmentWriterParticipation({
    writerPath,
    acknowledgments
  });
}

function nonAuthorizing(result: ReturnType<typeof assess>) {
  assert.equal(result.advisoryOnly, true);
  assert.equal(result.authoritative, false);
  assert.equal(result.writerCoverageVerified, false);
  assert.equal(result.historyComplete, false);
  assert.equal(result.crossPartitionAtomicityVerified, false);
  assert.equal(result.authorizationPermitted, false);
  assert.equal(result.executionPermitted, false);
  assert.equal(result.retryPermitted, false);
  assert.equal(result.automaticRecoveryPermitted, false);
  assert.equal(result.productionRolloutPermitted, false);
}

for (const writerPath of FORMATION_ASSIGNMENT_WRITER_PATHS) {
  const result = assess(writerPath);
  assert.equal(result.inputRejected, false);
  nonAuthorizing(result);

  if (result.pathClass === "event_backed") {
    assert.equal(result.status, "observed_consistent_not_complete");
  } else {
    assert.equal(result.status, "blocked");
    assert.equal(result.manualInterventionRequired, true);
  }
}

for (const invalid of [
  null,
  undefined,
  {},
  [],
  { writerPath: "unknown", acknowledgments: observed },
  { writerPath: "care_single_assign", acknowledgments: {} },
  { writerPath: "care_single_assign", acknowledgments: observed, extra: true },
  { writerPath: "care_single_assign", acknowledgments: { ...observed, extra: true } },
  { writerPath: "care_single_assign", acknowledgments: { ...observed, ledger: "unknown" } }
]) {
  const result = assessFormationAssignmentWriterParticipation(invalid);
  assert.equal(result.inputRejected, true);
  assert.equal(result.status, "contradictory");
  nonAuthorizing(result);
}

for (const key of Object.keys(observed)) {
  for (const [value, expected] of [
    ["missing", "pending"],
    ["failed", "blocked"],
    ["uncertain", "uncertain"],
    ["contradictory", "contradictory"]
  ]) {
    const result = assess("care_single_assign", {
      ...observed,
      [key]: value
    });
    assert.equal(result.status, expected);
    assert.equal(result.reconciliationRequired, true);
    nonAuthorizing(result);
  }
}

const lostAck = assess("care_single_assign", {
  ...observed,
  ledger: "uncertain",
  profile: "missing"
});
assert.equal(lostAck.status, "uncertain");
assert.equal(lostAck.retryPermitted, false);
assert.equal(lostAck.automaticRecoveryPermitted, false);

const partialWrite = assess("engagement_assignment_event", {
  ...observed,
  profile: "failed"
});
assert.equal(partialWrite.status, "blocked");
assert.equal(partialWrite.authorizationPermitted, false);

const accessor = Object.defineProperty(
  { writerPath: "care_single_assign" },
  "acknowledgments",
  { enumerable: true, get() { throw new Error("unsafe getter"); } }
);
assert.equal(
  assessFormationAssignmentWriterParticipation(accessor).inputRejected,
  true
);

const revoked = Proxy.revocable({}, {});
revoked.revoke();
assert.equal(
  assessFormationAssignmentWriterParticipation(revoked.proxy).inputRejected,
  true
);

const inherited = Object.create({ writerPath: "care_single_assign" });
inherited.acknowledgments = observed;
assert.equal(
  assessFormationAssignmentWriterParticipation(inherited).inputRejected,
  true
);

// Independent expectations: do not derive these from returned pathClass.
const expectedClasses = {
  care_single_assign: "event_backed",
  care_single_unassign: "event_backed",
  care_bulk_assign: "direct_profile",
  care_bulk_unassign: "direct_profile",
  activity_intelligence_assign: "event_backed",
  engagement_assignment_event: "event_backed",
  formation_event_api: "event_backed",
  legacy_formation_route: "event_backed",
  formation_profile_rebuild: "projection_rebuild"
} as const;

assert.deepEqual(
  [...FORMATION_ASSIGNMENT_WRITER_PATHS],
  Object.keys(expectedClasses)
);

for (const [writerPath, expectedClass] of Object.entries(expectedClasses)) {
  const result = assess(writerPath);
  assert.equal(result.pathClass, expectedClass);
  assert.equal(
    result.status,
    expectedClass === "event_backed"
      ? "observed_consistent_not_complete"
      : "blocked"
  );
  nonAuthorizing(result);
}

// Status escalation must be deterministic.
const mixedContradictory = assess("care_single_assign", {
  ledger: "contradictory",
  formationEvent: "uncertain",
  globalTimeline: "failed",
  profile: "observed"
});
assert.equal(mixedContradictory.status, "contradictory");
nonAuthorizing(mixedContradictory);

const mixedUncertain = assess("care_single_assign", {
  ledger: "failed",
  formationEvent: "uncertain",
  globalTimeline: "missing",
  profile: "observed"
});
assert.equal(mixedUncertain.status, "uncertain");
nonAuthorizing(mixedUncertain);

// Nested acknowledgment evidence must consist of own data properties.
const inheritedAcknowledgments = Object.create({ ledger: "observed" });
Object.assign(inheritedAcknowledgments, {
  formationEvent: "observed",
  globalTimeline: "observed",
  profile: "observed"
});

const nestedAccessor = Object.defineProperty(
  { ...observed },
  "ledger",
  { enumerable: true, get() { throw new Error("unsafe nested getter"); } }
);

const symbolAcknowledgments = {
  ...observed,
  [Symbol("unexpected")]: "observed"
};

const additionalInvalid = [
  { writerPath: "care_single_assign", acknowledgments: inheritedAcknowledgments },
  { writerPath: "care_single_assign", acknowledgments: nestedAccessor },
  { writerPath: "care_single_assign", acknowledgments: symbolAcknowledgments },
  { writerPath: "care_single_assign", acknowledgments: [] },
  { writerPath: "care_single_assign", acknowledgments: null }
];

for (const evidence of additionalInvalid) {
  const result = assessFormationAssignmentWriterParticipation(evidence);
  assert.equal(result.inputRejected, true);
  assert.equal(result.status, "contradictory");
  nonAuthorizing(result);
}

const revokedNested = Proxy.revocable({}, {});
revokedNested.revoke();
const revokedNestedResult = assessFormationAssignmentWriterParticipation({
  writerPath: "care_single_assign",
  acknowledgments: revokedNested.proxy
});
assert.equal(revokedNestedResult.inputRejected, true);
nonAuthorizing(revokedNestedResult);

const sparseArray = new Array(2);
const sparseResult = assessFormationAssignmentWriterParticipation(sparseArray);
assert.equal(sparseResult.inputRejected, true);
nonAuthorizing(sparseResult);
console.log(
  "Formation assignment writer participation contract assertions passed."
);
