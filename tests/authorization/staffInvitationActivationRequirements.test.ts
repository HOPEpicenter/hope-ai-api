import assert from "node:assert/strict";
import {
  assessStaffInvitationActivationRequirements,
  type ActivationRequirementsEvidence,
  type ActivationRequirementsAssessment
} from "../../src/domain/staff/staffInvitationActivationRequirements";

const tenant = "783ef4b1-7e96-4a71-80dd-06865b015da9";
const object = "c1717a19-c719-4ed2-8b72-e013800095de";
const other = "58f1f21f-2fcb-43ab-85c4-741d8cc59a7f";

function baseline(): ActivationRequirementsEvidence {
  return {
    tokenVerification: "verified",
    principalTenantId: tenant,
    principalObjectId: object,
    invitedTenantId: tenant,
    invitedObjectId: object,
    canonicalStatus: "pending",
    concurrentDeactivation: false,
    persistenceOutcome: "not_attempted"
  };
}

function assertNonAuthorizing(
  result: ActivationRequirementsAssessment
): void {
  assert.equal(result.advisoryOnly, true);
  assert.equal(result.authoritative, false);
  assert.equal(result.identityIndependentlyVerified, false);
  assert.equal(result.activationPermitted, false);
  assert.equal(result.executionPermitted, false);
  assert.equal(result.retryPermitted, false);
  assert.equal(result.automaticRecoveryPermitted, false);
  assert.equal(result.productionRolloutPermitted, false);
}

// Complete caller-supplied evidence is only review eligible.
{
  const result = assessStaffInvitationActivationRequirements(baseline());
  assert.equal(result.status, "eligible_for_architecture_review");
  assertNonAuthorizing(result);
}

// An API key alone is not verified Entra principal evidence.
for (const verification of ["unverified", "failed"] as const) {
  const result = assessStaffInvitationActivationRequirements({
    ...baseline(),
    tokenVerification: verification
  });
  assert.equal(result.status, "not_ready");
  assert.ok(result.diagnostics.includes("verified_entra_principal_required"));
  assertNonAuthorizing(result);
}

// Neither tenant mismatch nor object mismatch is acceptable.
for (const change of [
  { principalTenantId: other },
  { principalObjectId: other }
]) {
  const result = assessStaffInvitationActivationRequirements({
    ...baseline(), ...change
  });
  assert.equal(result.status, "not_ready");
  assert.ok(
    result.diagnostics.includes("principal_invitation_binding_mismatch")
  );
  assertNonAuthorizing(result);
}

// Only a pending canonical identity qualifies for architecture review.
for (const canonicalStatus of [
  "active", "inactive", "missing", "conflict"
] as const) {
  const result = assessStaffInvitationActivationRequirements({
    ...baseline(),
    canonicalStatus
  });
  assert.equal(result.status, "not_ready");
  assertNonAuthorizing(result);
}

// Race and persistence ambiguity never enable automatic retries.
for (const change of [
  { concurrentDeactivation: true },
  { persistenceOutcome: "uncertain" as const },
  { persistenceOutcome: "failed" as const },
  { persistenceOutcome: "committed" as const }
]) {
  const result = assessStaffInvitationActivationRequirements({
    ...baseline(), ...change
  });
  assert.equal(result.status, "reconciliation_required");
  assertNonAuthorizing(result);
}

// Invalid or untrusted inputs fail closed without invoking accessors.
for (const bad of [
  null,
  undefined,
  {},
  [],
  { ...baseline(), extra: "verified" },
  { ...baseline(), principalObjectId: "not-a-guid" },
  { ...baseline(), concurrentDeactivation: "false" }
]) {
  const result = assessStaffInvitationActivationRequirements(bad);
  assert.equal(result.status, "input_rejected");
  assertNonAuthorizing(result);
}

{
  let accessed = false;
  const hostile = { ...baseline() };
  Object.defineProperty(hostile, "tokenVerification", {
    get() {
      accessed = true;
      throw new Error("sensitive_value");
    }
  });

  const result = assessStaffInvitationActivationRequirements(hostile);
  assert.equal(accessed, false);
  assert.equal(result.status, "input_rejected");
  assertNonAuthorizing(result);
}

{
  const revoked = Proxy.revocable(baseline(), {});
  revoked.revoke();

  const result = assessStaffInvitationActivationRequirements(revoked.proxy);
  assert.equal(result.status, "input_rejected");
  assertNonAuthorizing(result);
}

// Case-insensitive normalized GUID equality is acceptable for review.
{
  const result = assessStaffInvitationActivationRequirements({
    ...baseline(),
    principalTenantId: tenant.toUpperCase(),
    principalObjectId: object.toUpperCase()
  });

  assert.equal(result.status, "eligible_for_architecture_review");
  assertNonAuthorizing(result);
}

// Invalid input must take precedence over concurrency/recovery claims.
{
  const result = assessStaffInvitationActivationRequirements({
    ...baseline(),
    principalObjectId: "invalid-guid",
    concurrentDeactivation: true,
    persistenceOutcome: "uncertain"
  });

  assert.equal(result.status, "input_rejected");
  assertNonAuthorizing(result);
}

// Conflicting identity plus uncertain persistence must not be review eligible.
{
  const result = assessStaffInvitationActivationRequirements({
    ...baseline(),
    principalObjectId: other,
    persistenceOutcome: "uncertain"
  });

  assert.equal(result.status, "reconciliation_required");
  assert.ok(
    result.diagnostics.includes("principal_invitation_binding_mismatch")
  );
  assertNonAuthorizing(result);
}

// Conflicting canonical identity and concurrent deactivation
// cannot establish safe activation.
{
  const result = assessStaffInvitationActivationRequirements({
    ...baseline(),
    canonicalStatus: "conflict",
    concurrentDeactivation: true
  });

  assert.equal(result.status, "reconciliation_required");
  assertNonAuthorizing(result);
}

// Hostile ownKeys reflection must fail closed without leaking details.
{
  const hostile = new Proxy(baseline(), {
    ownKeys() {
      throw new Error("private_synthetic_detail");
    }
  });

  const result = assessStaffInvitationActivationRequirements(hostile);

  assert.equal(result.status, "input_rejected");
  assertNonAuthorizing(result);
  assert.ok(
    !JSON.stringify(result.diagnostics).includes(
      "private_synthetic_detail"
    )
  );
}

// A complete set of caller-supplied claims never grants authority.
{
  const result = assessStaffInvitationActivationRequirements(baseline());

  assert.equal(result.identityIndependentlyVerified, false);
  assert.equal(result.activationPermitted, false);
  assert.equal(result.executionPermitted, false);
  assert.equal(result.retryPermitted, false);
  assert.equal(result.productionRolloutPermitted, false);
}
console.log("Staff invitation activation requirements tests passed");