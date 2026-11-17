import assert from "node:assert/strict";
import {
  assessKioskBootstrapReservation
} from "../../src/services/staff/assessKioskBootstrapReservation";

const candidate = {
  directoryCount: 0,
  matchingBindingCount: 0,
  reservationState: "absent",
  priorOutcome: "none"
};

function denied(
  evidence: Parameters<typeof assessKioskBootstrapReservation>[0],
  reason: string
): void {
  const result = assessKioskBootstrapReservation(evidence);
  assert.equal(result.reviewEligible, false);
  assert.equal(result.reason, reason);
  assert.equal(result.executionPermitted, false);
  assert.equal(result.retryPermitted, false);
  assert.equal(result.authorizationGranted, false);
}

denied(null, "EVIDENCE_MISSING");
denied(
  { ...candidate, directoryCount: 1 },
  "DIRECTORY_NOT_EMPTY"
);
denied(
  { ...candidate, directoryCount: undefined },
  "DIRECTORY_NOT_EMPTY"
);
denied(
  { ...candidate, matchingBindingCount: 1 },
  "BINDING_OWNERSHIP_NOT_CLEAR"
);
denied(
  { ...candidate, matchingBindingCount: undefined },
  "BINDING_OWNERSHIP_NOT_CLEAR"
);

for (const priorOutcome of [
  "committed", "denied", "uncertain", "pending", undefined
]) {
  denied(
    { ...candidate, priorOutcome },
    "PRIOR_OUTCOME_NOT_PROVEN_ABSENT"
  );
}

for (const reservationState of [
  "reserved", "consumed", "expired", "unknown", undefined
]) {
  denied(
    { ...candidate, reservationState },
    "RESERVATION_NOT_PROVEN_ABSENT"
  );
}

const review = assessKioskBootstrapReservation(candidate);
assert.equal(review.reviewEligible, true);
assert.equal(review.reason, "DURABLE_AUTHORIZATION_REVIEW_REQUIRED");
assert.equal(review.executionPermitted, false);
assert.equal(review.retryPermitted, false);
assert.equal(review.authorizationGranted, false);

console.log("DUPLICATE_DIRECTORY_GUARD_PASSED=True");
console.log("BINDING_CONFLICT_GUARD_PASSED=True");
console.log("PRIOR_OUTCOME_GUARD_PASSED=True");
console.log("RESERVATION_STATE_GUARD_PASSED=True");
console.log("EXECUTION_ALWAYS_DENIED=True");
console.log("RETRY_ALWAYS_DENIED=True");
console.log("K307_OFFLINE_REGRESSIONS_PASSED=True");
