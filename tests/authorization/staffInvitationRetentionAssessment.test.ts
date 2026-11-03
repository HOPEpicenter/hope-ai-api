import assert from "node:assert/strict";
import {
  assessStaffInvitationRetention
} from "../../src/contracts/staffInvitationRetentionAssessment.v1";

const valid = {
  schemaVersion: 1,
  createdAt: "2026-11-01T00:00:00.000Z",
  expiresAt: "2026-11-02T00:00:00.000Z",
  observedAt: "2026-11-03T00:00:00.000Z",
  policyApprovedClaim: true,
  holdStatus: "none"
};

function check(input: unknown, status: string): void {
  const result = assessStaffInvitationRetention(input);
  assert.equal(result.status, status);
  assert.equal(result.advisoryOnly, true);

  for (const key of [
    "authoritative",
    "policyIndependentlyVerified",
    "deletionPermitted",
    "storageAccessPermitted",
    "executionPermitted",
    "retryPermitted",
    "productionRolloutPermitted"
  ] as const) {
    assert.equal(result[key], false, key);
  }

  assert.ok(Object.isFrozen(result));

  const output = JSON.stringify(result);
  assert.ok(!output.includes("recipientEmail"));
  assert.ok(!output.includes("displayName"));
}

check(valid, "candidate_due_unverified");
console.log("PASS due synthetic claim never authorizes deletion");

check(
  { ...valid, policyApprovedClaim: false },
  "policy_unverified"
);
console.log("PASS missing policy claim fails closed");

check({ ...valid, holdStatus: "active" }, "hold_or_unknown");
check({ ...valid, holdStatus: "unknown" }, "hold_or_unknown");
console.log("PASS active and unknown holds block eligibility");

check(
  { ...valid, observedAt: "2026-11-01T12:00:00.000Z" },
  "not_due"
);
console.log("PASS record not due remains non-authorizing");

check(
  { ...valid, expiresAt: "2026-10-31T00:00:00.000Z" },
  "input_rejected"
);
check(
  { ...valid, observedAt: "bad-date" },
  "input_rejected"
);
check(
  { ...valid, unexpected: "synthetic@example.invalid" },
  "input_rejected"
);
console.log("PASS malformed and extra-key inputs rejected");

let getterExecuted = false;
const hostile: Record<string, unknown> = { ...valid };

Object.defineProperty(hostile, "holdStatus", {
  enumerable: true,
  get() {
    getterExecuted = true;
    return "none";
  }
});

check(hostile, "input_rejected");
assert.equal(getterExecuted, false);
console.log("PASS hostile accessor never executed");

const revoked = Proxy.revocable({ ...valid }, {});
revoked.revoke();
check(revoked.proxy, "input_rejected");
console.log("PASS revoked proxy fails closed");

console.log("PASS C5 synthetic retention assessment tests");
