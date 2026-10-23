import assert from "node:assert/strict";
import {
  assessStaffWriterFencingProof
} from "../../src/domain/staff/staffWriterFencingProof";
import type {
  StaffWriterCoordinationEvidence,
  StaffWriterCoordinationRequest
} from "../../src/domain/staff/staffWriterCoordinationContract";

const request: StaffWriterCoordinationRequest = {
  mutationCategory: "identity_creation",
  operationId: "synthetic-operation-a2b2",
  eventId: "synthetic-event-a2b2",
  expectedSecurityRevision: 0,
  expectedStaffId: "synthetic-staff-a2b2",
  expectedStaffState: "absent",
  targetStaffState: "active"
};

function completeEvidence(): StaffWriterCoordinationEvidence {
  return {
    securityDecision: {
      state: "committed",
      operationId: request.operationId,
      eventId: request.eventId,
      staffId: request.expectedStaffId,
      mutationCategory: request.mutationCategory,
      expectedRevision: 0,
      revision: 1,
      previousStaffState: "absent",
      resultingStaffState: "active"
    },
    staffEventsPersistence: {
      state: "committed",
      operationId: request.operationId,
      eventId: request.eventId,
      staffId: request.expectedStaffId,
      mutationCategory: request.mutationCategory
    },
    projection: {
      state: "projected",
      operationId: request.operationId,
      eventId: request.eventId,
      staffId: request.expectedStaffId,
      mutationCategory: request.mutationCategory,
      securityRevision: 1
    },
    invitationSideEffect: "not_applicable"
  };
}

function checkNonAuthorizing(value: ReturnType<
  typeof assessStaffWriterFencingProof
>): void {
  assert.equal(value.authoritative, false);
  assert.equal(value.executionPermitted, false);
  assert.equal(value.retryPermitted, false);
  assert.equal(value.productionWriterFenced, false);
}

function blocked(
  evidence: StaffWriterCoordinationEvidence,
  expectedReason?: string
): void {
  const result = assessStaffWriterFencingProof(request, evidence);
  assert.equal(result.status, "blocked");
  if (expectedReason) {
    assert.equal(result.reason, expectedReason);
  }
  checkNonAuthorizing(result);
}

const complete = completeEvidence();
const consistent = assessStaffWriterFencingProof(request, complete);
assert.equal(consistent.status, "candidate_consistent");
assert.equal(
  consistent.reason,
  "consistent_evidence_non_authorizing"
);
checkNonAuthorizing(consistent);

blocked({
  ...complete,
  securityDecision: { state: "missing" }
}, "missing_or_incomplete_evidence");

blocked({
  ...complete,
  securityDecision: { state: "pending" }
}, "missing_or_incomplete_evidence");

blocked({
  ...complete,
  securityDecision: {
    ...complete.securityDecision,
    expectedRevision: 2
  }
}, "stale_or_contradictory_evidence");

blocked({
  ...complete,
  securityDecision: {
    ...complete.securityDecision,
    operationId: "different-operation"
  }
}, "stale_or_contradictory_evidence");

blocked({
  ...complete,
  securityDecision: { state: "uncertain" }
}, "uncertain_or_unavailable_evidence");

blocked({
  ...complete,
  staffEventsPersistence: { state: "uncertain" }
}, "uncertain_or_unavailable_evidence");

blocked({
  ...complete,
  staffEventsPersistence: { state: "missing" }
}, "missing_or_incomplete_evidence");

// A malformed runtime value must fail closed despite the TypeScript type.
const invalid = assessStaffWriterFencingProof(
  request,
  null as unknown as StaffWriterCoordinationEvidence
);
assert.equal(invalid.status, "blocked");
checkNonAuthorizing(invalid);

// A synthetic legacy writer that consults this non-authorizing assessment
// can never execute its mock persistence callback.
let persistenceCalls = 0;

function attemptSyntheticLegacyWrite(
  evidence: StaffWriterCoordinationEvidence
): boolean {
  const decision = assessStaffWriterFencingProof(request, evidence);

  const runtimePermission: boolean =
    Boolean(decision.executionPermitted);

  if (!runtimePermission) {
    return false;
  }

  persistenceCalls += 1;
  return true;
}

assert.equal(
  attemptSyntheticLegacyWrite({
    ...complete,
    securityDecision: { state: "missing" }
  }),
  false
);

assert.equal(attemptSyntheticLegacyWrite(complete), false);
assert.equal(persistenceCalls, 0);

console.log(
  "Staff writer fencing synthetic regressions passed (non-authorizing)"
);