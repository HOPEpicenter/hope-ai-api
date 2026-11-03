import assert from "node:assert/strict";
import {
  assessStaffInvitationAccessAudit,
  type AuditAssessmentStatus
} from "../../src/contracts/staffInvitationAccessAudit.v1";

const valid = {
  schemaVersion: 1,
  operation: "create_attempt",
  outcome: "acknowledged",
  operationId: "c4653c42-9c4b-4c4e-b214-647d42125120",
  actorCorrelationId: "a8f20139-bbd7-4d1f-8ceb-3a183113e84d",
  occurredAt: "2026-11-03T00:00:00.000Z"
};

function check(
  input: unknown,
  expected: AuditAssessmentStatus
): void {
  const assessment = assessStaffInvitationAccessAudit(input);

  assert.equal(assessment.status, expected);
  assert.equal(assessment.advisoryOnly, true);

  for (const key of [
    "authoritative",
    "auditEventEmitted",
    "actorIndependentlyVerified",
    "outcomeIndependentlyVerified",
    "accessAuditVerified",
    "storageAccessPermitted",
    "executionPermitted",
    "retryPermitted",
    "productionRolloutPermitted"
  ] as const) {
    assert.equal(assessment[key], false, key);
  }

  assert.ok(Object.isFrozen(assessment));

  const output = JSON.stringify(assessment);

  assert.ok(!output.includes(valid.operationId));
  assert.ok(!output.includes(valid.actorCorrelationId));
  assert.ok(!output.includes("recipientEmail"));
  assert.ok(!output.includes("displayName"));
}

for (const operation of [
  "create_attempt",
  "read_attempt"
] as const) {
  for (const outcome of [
    "acknowledged",
    "denied",
    "failed"
  ] as const) {
    check(
      { ...valid, operation, outcome },
      "candidate_unverified"
    );
  }
}

console.log("PASS create/read outcome claims remain unverified");

check(
  { ...valid, outcome: "uncertain" },
  "outcome_uncertain"
);
console.log("PASS uncertain storage outcome stays uncertain");

check(
  { ...valid, actorCorrelationId: "" },
  "actor_unverified"
);
check(
  { ...valid, actorCorrelationId: "synthetic@example.org" },
  "actor_unverified"
);
console.log("PASS missing or invalid actor attribution rejected");

check({ ...valid, operation: "delete" }, "input_rejected");
check({ ...valid, outcome: "success" }, "input_rejected");
check({ ...valid, operationId: "invalid" }, "input_rejected");
check({ ...valid, occurredAt: "invalid" }, "input_rejected");
check(
  { ...valid, recipientEmail: "synthetic@example.org" },
  "input_rejected"
);
console.log("PASS unsupported and sensitive input shapes rejected");

let getterExecuted = false;

const hostile: Record<string, unknown> = { ...valid };

Object.defineProperty(hostile, "operation", {
  enumerable: true,
  get() {
    getterExecuted = true;
    return "create_attempt";
  }
});

check(hostile, "input_rejected");
assert.equal(getterExecuted, false);
console.log("PASS hostile accessor not executed");

const revoked = Proxy.revocable({ ...valid }, {});
revoked.revoke();

check(revoked.proxy, "input_rejected");
console.log("PASS revoked proxy fails closed");

check(null, "input_rejected");
check([], "input_rejected");
console.log("PASS invalid structures fail closed");

console.log("PASS C6 synthetic audit assessment tests");
