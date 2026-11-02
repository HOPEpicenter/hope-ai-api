import assert from "node:assert/strict";
import {
  assessStaffInvitationEvidenceVerificationBoundary,
  type StaffInvitationEvidenceVerificationAssessmentV1
} from "../../src/contracts/staffInvitationEvidenceVerificationBoundary.v1";

function valid(): any {
  return {
    schemaVersion: 1,
    issuerAuthenticatedClaim: true,
    trustedClockClaim: true,
    resourceBindingClaim: true,
    integrityVerifiedClaim: true,
    replayExcludedClaim: true,
    contradictoryEvidenceClaim: false,
    controls: {
      scopedStorageIdentityVerified: true,
      leastPrivilegeVerified: true,
      atRestProtectionVerified: true,
      diagnosticRedactionVerified: true,
      retentionPolicyApproved: true,
      accessAuditVerified: true
    }
  };
}

function safe(
  value: StaffInvitationEvidenceVerificationAssessmentV1
): void {
  assert.equal(Object.isFrozen(value), true);
  assert.equal(Object.isFrozen(value.diagnostics), true);
  assert.equal(Object.isFrozen(value.sensitiveFields), true);

  assert.deepEqual(value.sensitiveFields, [
    "displayName",
    "recipientEmail"
  ]);

  assert.equal(value.advisoryOnly, true);

  for (const key of [
    "authoritative",
    "issuerIndependentlyVerified",
    "freshnessIndependentlyVerified",
    "resourceIndependentlyVerified",
    "integrityIndependentlyVerified",
    "controlsIndependentlyVerified",
    "storageAccessPermitted",
    "executionPermitted",
    "retryPermitted",
    "automaticRecoveryPermitted",
    "graphOutcomeVerified",
    "productionRolloutPermitted"
  ] as const) {
    assert.equal(value[key], false, key);
  }

  assert.equal(
    JSON.stringify(value).includes("private@example.org"),
    false
  );
}

const inspect = assessStaffInvitationEvidenceVerificationBoundary;

// Positive caller claims must never produce actual trusted evidence.
{
  const value = inspect(valid());
  assert.equal(value.status, "claims_complete_unverified");
  assert.ok(value.diagnostics.includes(
    "caller_claims_not_authenticated"
  ));
  safe(value);
  console.log("PASS complete synthetic claims never authorize");
}

// Each independently unverified trust assumption must fail closed.
for (const key of [
  "issuerAuthenticatedClaim",
  "trustedClockClaim",
  "resourceBindingClaim",
  "integrityVerifiedClaim",
  "replayExcludedClaim"
]) {
  const input = valid();
  input[key] = false;

  const value = inspect(input);
  assert.equal(value.status, "claims_incomplete");
  assert.ok(value.diagnostics.includes(`unverified_claim_${key}`));
  safe(value);
}
console.log("PASS each missing trust claim fails closed");

// Each of the six Azure-control claims must fail closed.
for (const key of Object.keys(valid().controls)) {
  const input = valid();
  input.controls[key] = false;

  const value = inspect(input);
  assert.equal(value.status, "claims_incomplete");
  assert.ok(value.diagnostics.includes(`unverified_control_${key}`));
  safe(value);
}
console.log("PASS all six missing control claims fail closed");

// Contradictions take priority over missing claims.
{
  const input = valid();
  input.contradictoryEvidenceClaim = true;
  input.issuerAuthenticatedClaim = false;

  const value = inspect(input);
  assert.equal(value.status, "evidence_conflicting");
  safe(value);
  console.log("PASS contradictory claims take priority");
}

// Malformed structure must not be interpreted as trustworthy.
for (const input of [
  null,
  [],
  {},
  { ...valid(), schemaVersion: 2 },
  { ...valid(), extra: "private@example.org" },
  { ...valid(), trustedClockClaim: "true" },
  { ...valid(), controls: null },
  { ...valid(), controls: { ...valid().controls, extra: true } },
  new Proxy(valid(), {})
]) {
  const value = inspect(input);
  assert.equal(value.status, "input_rejected");
  safe(value);
}
console.log("PASS malformed input and proxies rejected");

// Hostile accessors must not execute.
{
  const input = valid();
  let getterCalled = false;

  Object.defineProperty(input.controls, "accessAuditVerified", {
    enumerable: true,
    get() {
      getterCalled = true;
      throw Error("getter must not run");
    }
  });

  const value = inspect(input);
  assert.equal(value.status, "input_rejected");
  assert.equal(getterCalled, false);
  safe(value);
  console.log("PASS nested accessors rejected without execution");
}

// Revoked proxies must fail closed without leaking exceptions.
{
  const revoked = Proxy.revocable(valid(), {});
  revoked.revoke();

  const value = inspect(revoked.proxy);
  assert.equal(value.status, "input_rejected");
  safe(value);
  console.log("PASS revoked proxy rejected");
}

// Caller-provided labels, PII and other extra fields cannot
// become authenticated issuer, time or Azure-resource evidence.
{
  const input = {
    ...valid(),
    recipientEmail: "private@example.org"
  };

  const value = inspect(input);
  assert.equal(value.status, "input_rejected");
  safe(value);
  console.log("PASS unexpected personal information rejected");
}

// Multiple missing requirements produce safe diagnostics.
{
  const input = valid();
  input.trustedClockClaim = false;
  input.replayExcludedClaim = false;
  input.controls.leastPrivilegeVerified = false;

  const value = inspect(input);
  assert.equal(value.status, "claims_incomplete");
  assert.equal(value.diagnostics.length, 3);
  safe(value);
  console.log("PASS multiple gaps reported safely");
}

console.log("PASS D6-B4 evidence-verification boundary tests");
