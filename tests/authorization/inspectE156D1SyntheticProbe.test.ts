import assert from "node:assert/strict";
import { inspectE156D1SyntheticProbe } from "../../src/domain/staff/inspectE156D1SyntheticProbe";

const evidence = {
  identityMatched: true, privateRouteVerified: true,
  httpStatus: 403, serviceErrorCode: "AuthorizationPermissionMismatch"
};
const plan = {
  mode: "synthetic-only", enabled: false, attemptLimit: 1,
  operation: "table-list-read-only", evidence
} as const;

function assertDenied(input: unknown, expectedClassification: "synthetic_only" | "blocked"): void {
  const result = inspectE156D1SyntheticProbe(input);
  assert.equal(result.classification, expectedClassification);
  assert.equal(result.target, "synthetic_table_read");
  assert.equal(result.requestedAttempts, 0);
  assert.equal(result.networkRequestPermitted, false);
  assert.equal(result.tokenRequestPermitted, false);
  assert.equal(result.storageConnectionPermitted, false);
  assert.equal(result.authorityWritePermitted, false);
  assert.equal(result.retryPermitted, false);
  assert.equal(result.deploymentPermitted, false);
  assert.equal(result.liveExecutionPermitted, false);
  assert.equal(result.effectivePermissionIsolationVerified, false);
  assert.equal(Object.isFrozen(result), true);
}
assertDenied(plan, "synthetic_only");
assert.equal(inspectE156D1SyntheticProbe(plan).evidence?.classification, "candidate_permission_denial");
assertDenied({ ...plan, evidence: { ...evidence, httpStatus: 200, serviceErrorCode: null } }, "synthetic_only");
assert.equal(inspectE156D1SyntheticProbe({
  ...plan, evidence: { ...evidence, httpStatus: 200, serviceErrorCode: null }
}).evidence?.reason, "unexpected_success");
assertDenied({ ...plan, enabled: true }, "blocked");
assertDenied({ ...plan, mode: "live" }, "blocked");
assertDenied({ ...plan, attemptLimit: 2 }, "blocked");
assertDenied({ ...plan, attemptLimit: 0 }, "blocked");
assertDenied({ ...plan, operation: "table-create" }, "blocked");
assertDenied({ ...plan, token: "forbidden" }, "blocked");
assertDenied({ ...plan, endpoint: "https://not-allowed.test" }, "blocked");
assertDenied({ ...plan, evidence: { ...evidence, accessToken: "forbidden" } }, "synthetic_only");
assert.equal(inspectE156D1SyntheticProbe({
  ...plan, evidence: { ...evidence, accessToken: "forbidden" }
}).evidence?.classification, "invalid_evidence");
assertDenied(null, "blocked");
assertDenied({}, "blocked");

let getterCalled = false;
const getter = Object.defineProperty({ ...plan }, "enabled", {
  get() { getterCalled = true; throw new Error("getter must not run"); }
});
assertDenied(getter, "blocked");
assert.equal(getterCalled, false);
const revoked = Proxy.revocable({}, {});
revoked.revoke();
assertDenied(revoked.proxy, "blocked");

console.log("E156-D1 disabled diagnostic harness synthetic regressions passed");
