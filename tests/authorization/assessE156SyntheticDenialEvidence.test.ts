import assert from "node:assert/strict";
import {
  assessE156SyntheticDenialEvidence,
  type E156ProbeAssessment
} from "../../src/domain/staff/assessE156SyntheticDenialEvidence";

const base = {
  identityMatched: true,
  privateRouteVerified: true,
  httpStatus: 403,
  serviceErrorCode: "AuthorizationPermissionMismatch"
} as const;

function check(input: unknown,
  classification: E156ProbeAssessment["classification"],
  reason: E156ProbeAssessment["reason"]): void {
  const outcome = assessE156SyntheticDenialEvidence(input);
  assert.equal(outcome.classification, classification);
  assert.equal(outcome.reason, reason);
  assert.deepEqual(Object.keys(outcome).sort(), [
    "classification", "reason", "liveProbePermitted",
    "storageConnectionPermitted", "authorityWritePermitted",
    "retryPermitted", "executionPermitted",
    "effectivePermissionIsolationVerified"
  ].sort());
  assert.equal(outcome.liveProbePermitted, false);
  assert.equal(outcome.storageConnectionPermitted, false);
  assert.equal(outcome.authorityWritePermitted, false);
  assert.equal(outcome.retryPermitted, false);
  assert.equal(outcome.executionPermitted, false);
  assert.equal(outcome.effectivePermissionIsolationVerified, false);
}
check(base, "candidate_permission_denial", "permission_mismatch_candidate");
check({ ...base, identityMatched: false }, "inconclusive", "identity_not_verified");
check({ ...base, privateRouteVerified: false }, "inconclusive", "network_not_verified");
check({ ...base, httpStatus: 403, serviceErrorCode: "AuthorizationFailure" },
  "inconclusive", "network_or_policy_denial");
check({ ...base, httpStatus: 403, serviceErrorCode: null },
  "inconclusive", "network_or_policy_denial");
check({ ...base, httpStatus: 401, serviceErrorCode: "AuthenticationFailed" },
  "inconclusive", "authentication_failure");
check({ ...base, httpStatus: 404, serviceErrorCode: null },
  "inconclusive", "target_not_found");
check({ ...base, httpStatus: 200, serviceErrorCode: null },
  "inconclusive", "unexpected_success");
check({ ...base, httpStatus: 500, serviceErrorCode: null },
  "inconclusive", "other_service_response");
check({ ...base, httpStatus: 403, serviceErrorCode: "AuthenticationFailed" },
  "inconclusive", "authentication_failure");
check({ ...base, token: "must-not-be-accepted" },
  "invalid_evidence", "invalid_or_extra_fields");
check({ ...base, responseBody: {} },
  "invalid_evidence", "invalid_or_extra_fields");
check({ ...base, principalId: "forbidden" },
  "invalid_evidence", "invalid_or_extra_fields");
check({ ...base, httpStatus: "403" },
  "invalid_evidence", "invalid_or_extra_fields");
check({ ...base, serviceErrorCode: "UnknownCode" },
  "invalid_evidence", "invalid_or_extra_fields");
check({ ...base, httpStatus: NaN },
  "invalid_evidence", "invalid_or_extra_fields");
check(null, "invalid_evidence", "invalid_or_extra_fields");
check({}, "invalid_evidence", "invalid_or_extra_fields");

let getterExecuted = false;
const hostile = Object.defineProperty({ ...base }, "httpStatus", {
  get() { getterExecuted = true; throw Error("getter must not run"); }
});
check(hostile, "invalid_evidence", "invalid_or_extra_fields");
assert.equal(getterExecuted, false);

const revoked = Proxy.revocable({}, {});
revoked.revoke();
check(revoked.proxy, "invalid_evidence", "invalid_or_extra_fields");

console.log("E156 inert status-only denial evidence classifier regressions passed");
