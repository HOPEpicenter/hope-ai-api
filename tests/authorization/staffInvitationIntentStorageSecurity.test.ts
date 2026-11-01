import assert from "node:assert/strict";
import {
  assessStaffInvitationStorageSecurity,
  type StaffInvitationStorageSecurityAssessment
} from "../../src/contracts/staffInvitationIntentStorageSecurity.v1";

const valid = {
  schemaVersion: 1,
  scopedStorageIdentityVerified: true,
  leastPrivilegeVerified: true,
  atRestProtectionVerified: true,
  diagnosticRedactionVerified: true,
  retentionPolicyApproved: true,
  accessAuditVerified: true
};

function safe(
  result: StaffInvitationStorageSecurityAssessment
): void {
  assert.equal(result.advisoryOnly, true);

  for (const key of [
    "authoritative",
    "controlsIndependentlyVerified",
    "storageAccessPermitted",
    "executionPermitted",
    "retryPermitted",
    "automaticRecoveryPermitted",
    "graphOutcomeVerified",
    "productionRolloutPermitted"
  ] as const) {
    assert.equal(result[key], false, key);
  }

  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.diagnostics), true);
  assert.equal(Object.isFrozen(result.sensitiveFields), true);

  assert.deepEqual(result.sensitiveFields, [
    "displayName",
    "recipientEmail"
  ]);

  assert.equal(Object.prototype.hasOwnProperty.call(result, "recipientEmail"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, "displayName"), false);
}

const complete = assessStaffInvitationStorageSecurity(valid);
assert.equal(complete.status, "claims_complete_unverified");
assert.ok(
  complete.diagnostics.includes(
    "caller_claims_not_independently_verified"
  )
);
safe(complete);
console.log("PASS affirmative claims do not authorize");

const requirements = [
  "scopedStorageIdentityVerified",
  "leastPrivilegeVerified",
  "atRestProtectionVerified",
  "diagnosticRedactionVerified",
  "retentionPolicyApproved",
  "accessAuditVerified"
] as const;

for (const key of requirements) {
  const negative = assessStaffInvitationStorageSecurity({
    ...valid,
    [key]: false
  });

  assert.equal(negative.status, "requirements_missing");
  assert.ok(
    negative.diagnostics.includes(`unverified_requirement_${key}`)
  );
  safe(negative);
}
console.log("PASS every denied security requirement fails closed");

for (const input of [
  null,
  [],
  {},
  { ...valid, schemaVersion: 2 },
  { ...valid, unexpected: true },
  { ...valid, retentionPolicyApproved: "true" },
  { ...valid, accessAuditVerified: 1 },
  Object.create({ ...valid }),
  new Proxy(valid, {}),
  new Proxy(valid, { ownKeys() { throw Error("hostile"); } }),
  { ...valid, recipientEmail: "private@example.org" }
]) {
  const result = assessStaffInvitationStorageSecurity(input);
  assert.equal(result.status, "input_rejected");
  safe(result);
}
console.log("PASS malformed, extra-key and proxy inputs rejected");

const hostile: Record<string, unknown> = { ...valid };
Object.defineProperty(hostile, "accessAuditVerified", {
  enumerable: true,
  get() {
    throw Error("getter must not execute");
  }
});

const getterResult = assessStaffInvitationStorageSecurity(hostile);
assert.equal(getterResult.status, "input_rejected");
safe(getterResult);
console.log("PASS getters are not executed");

const revoked = Proxy.revocable(valid, {});
revoked.revoke();

const revokedResult = assessStaffInvitationStorageSecurity(revoked.proxy);
assert.equal(revokedResult.status, "input_rejected");
safe(revokedResult);
console.log("PASS revoked proxies fail closed");

const negativeAll = assessStaffInvitationStorageSecurity({
  ...valid,
  scopedStorageIdentityVerified: false,
  diagnosticRedactionVerified: false,
  retentionPolicyApproved: false
});

assert.equal(negativeAll.status, "requirements_missing");
assert.equal(negativeAll.diagnostics.length, 3);
safe(negativeAll);
console.log("PASS multiple gaps reported without sensitive values");

console.log("PASS D6 storage security contract tests");
