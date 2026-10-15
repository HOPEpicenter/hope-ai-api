import assert from "node:assert/strict";
import {
  assessStaffInvitationActivationBinding
} from "../../src/domain/staff/staffInvitationActivationBindingAssessment";

const tenant = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const objectId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const other = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function evidence(): Record<string, unknown> {
  return {
    staffId: "synthetic-staff",
    tenantId: tenant,
    objectId,
    canonicalStatus: "pending",
    advisoryOnly: true,
    authoritative: false,
    activationPermitted: false,
    executionPermitted: false,
    retryPermitted: false,
    productionRolloutPermitted: false
  };
}

function invitation(): Record<string, unknown> {
  return {
    staffId: "synthetic-staff",
    entraTenantId: tenant,
    entraObjectId: objectId
  };
}

function assertNonAuthorizing(
  result: ReturnType<
    typeof assessStaffInvitationActivationBinding
  >
): void {
  assert.equal(result.advisoryOnly, true);
  assert.equal(result.authoritative, false);
  assert.equal(result.identityIndependentlyVerified, false);
  assert.equal(result.activationPermitted, false);
  assert.equal(result.executionPermitted, false);
  assert.equal(result.retryPermitted, false);
  assert.equal(result.productionRolloutPermitted, false);
}

const matched = assessStaffInvitationActivationBinding(
  evidence(), invitation()
);

assert.equal(
  matched.status,
  "binding_matched_for_review"
);
assertNonAuthorizing(matched);

// GUID normalization must be case-insensitive.
const normalized = assessStaffInvitationActivationBinding(
  {
    ...evidence(),
    tenantId: tenant.toUpperCase(),
    objectId: objectId.toUpperCase()
  },
  invitation()
);
assert.equal(
  normalized.status,
  "binding_matched_for_review"
);
assertNonAuthorizing(normalized);

// Each distinct identity mismatch must fail readiness.
for (const changed of [
  { evidence: { staffId: "another-staff" } },
  { invitation: { staffId: "another-staff" } },
  { evidence: { tenantId: other } },
  { evidence: { objectId: other } },
  { invitation: { entraTenantId: other } },
  { invitation: { entraObjectId: other } }
]) {
  const assessment = assessStaffInvitationActivationBinding(
    { ...evidence(), ...(changed.evidence ?? {}) },
    { ...invitation(), ...(changed.invitation ?? {}) }
  );
  assert.equal(assessment.status, "not_ready");
  assertNonAuthorizing(assessment);
}

// Malformed, unexpected, or permissive evidence is rejected.
for (const bad of [
  null,
  undefined,
  {},
  [],
  { ...evidence(), extra: true },
  { ...evidence(), canonicalStatus: "active" },
  { ...evidence(), authoritative: true },
  { ...evidence(), advisoryOnly: false },
  { ...evidence(), activationPermitted: true },
  { ...evidence(), executionPermitted: true },
  { ...evidence(), retryPermitted: true },
  { ...evidence(), productionRolloutPermitted: true },
  { ...evidence(), tenantId: "not-a-guid" },
  { ...evidence(), staffId: " synthetic-staff" }
]) {
  const assessment = assessStaffInvitationActivationBinding(
    bad, invitation()
  );
  assert.equal(assessment.status, "input_rejected");
  assertNonAuthorizing(assessment);
}

for (const badInvitation of [
  {},
  [],
  null,
  { ...invitation(), extra: "unexpected" },
  { ...invitation(), entraTenantId: "invalid" },
  { ...invitation(), staffId: "" }
]) {
  const assessment = assessStaffInvitationActivationBinding(
    evidence(), badInvitation
  );
  assert.equal(assessment.status, "input_rejected");
  assertNonAuthorizing(assessment);
}

// Getter evidence must never be executed.
{
  let getterCalled = false;
  const hostile = evidence();
  Object.defineProperty(hostile, "staffId", {
    get() {
      getterCalled = true;
      throw new Error("private_synthetic_value");
    }
  });

  const assessment = assessStaffInvitationActivationBinding(
    hostile, invitation()
  );

  assert.equal(getterCalled, false);
  assert.equal(assessment.status, "input_rejected");
  assertNonAuthorizing(assessment);
  assert.ok(
    !JSON.stringify(assessment).includes(
      "private_synthetic_value"
    )
  );
}

// Hostile proxies and revoked proxies fail closed.
{
  const hostile = new Proxy(evidence(), {
    ownKeys() {
      throw new Error("private_proxy_value");
    }
  });

  const assessment = assessStaffInvitationActivationBinding(
    hostile, invitation()
  );
  assert.equal(assessment.status, "input_rejected");
  assertNonAuthorizing(assessment);
}

{
  const revocable = Proxy.revocable(evidence(), {});
  revocable.revoke();

  const assessment = assessStaffInvitationActivationBinding(
    revocable.proxy, invitation()
  );
  assert.equal(assessment.status, "input_rejected");
  assertNonAuthorizing(assessment);
}

// A fully matching claim is still not independently verified.
assert.equal(matched.identityIndependentlyVerified, false);
assert.equal(matched.activationPermitted, false);
assert.equal(matched.executionPermitted, false);

console.log(
  "staffInvitationActivationBindingAssessment.test.ts passed"
);