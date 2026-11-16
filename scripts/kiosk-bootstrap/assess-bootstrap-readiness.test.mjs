import test from "node:test";
import assert from "node:assert/strict";

import {
  assessKioskBootstrapReadiness,
  KIOSK_BOOTSTRAP_TARGET
} from "./assess-bootstrap-readiness.mjs";

const expected = () => ({
  target: { ...KIOSK_BOOTSTRAP_TARGET },
  ownerIdentityVerified: true,
  canonicalBindingState: "ABSENT_VERIFIED",
  canonicalWriterMode: "legacy",
  atomicReservationVerified: true,
  auditActorVerified: true,
  ownerExecutionApprovalVerified: true
});

function assertDenied(input, status) {
  const result = assessKioskBootstrapReadiness(input);

  assert.equal(result.status, status);
  assert.equal(result.executionPermitted, false);
  assert.equal(result.staffMutationPermitted, false);
  assert.equal(result.automaticRetryPermitted, false);
  assert.equal(result.authorizationGranted, false);
  assert.equal(result.productionWriterFenced, false);
}

test("missing input is denied", () => {
  assertDenied(undefined, "INVALID_INPUT");
});

test("missing target is denied", () => {
  const input = expected();
  delete input.target;
  assertDenied(input, "TARGET_NOT_VERIFIED");
});

test("production or wrong environment is denied", () => {
  const input = expected();
  input.target.functionApp = "hope-ai-api-production";
  assertDenied(input, "TARGET_NOT_VERIFIED");
});

test("wrong tenant is denied", () => {
  const input = expected();
  input.target.tenantId = "other-tenant";
  assertDenied(input, "TARGET_NOT_VERIFIED");
});

test("unverified owner identity is denied", () => {
  const input = expected();
  input.ownerIdentityVerified = false;
  assertDenied(input, "OWNER_IDENTITY_NOT_VERIFIED");
});

test("unknown existing Staff binding state is denied", () => {
  const input = expected();
  input.canonicalBindingState = "UNKNOWN";
  assertDenied(
    input,
    "CANONICAL_BINDING_NOT_ESTABLISHED_AS_ABSENT"
  );
});

test("restricted Staff writer is denied", () => {
  const input = expected();
  input.canonicalWriterMode = "migration_hold";
  assertDenied(input, "CANONICAL_WRITER_NOT_READY");
});

test("missing atomic reservation evidence is denied", () => {
  const input = expected();
  input.atomicReservationVerified = false;
  assertDenied(input, "ATOMIC_RESERVATION_NOT_VERIFIED");
});

test("missing audit actor evidence is denied", () => {
  const input = expected();
  input.auditActorVerified = false;
  assertDenied(input, "BOOTSTRAP_AUDIT_ACTOR_NOT_VERIFIED");
});

test("missing owner execution approval is denied", () => {
  const input = expected();
  input.ownerExecutionApprovalVerified = false;
  assertDenied(input, "EXECUTION_APPROVAL_NOT_VERIFIED");
});

test("even fully claimed readiness never enables execution", () => {
  assertDenied(
    expected(),
    "DESIGN_ONLY_EXECUTION_DISABLED"
  );
});

test("a claimed override cannot grant authority", () => {
  assertDenied(
    {
      ...expected(),
      bypassAuthorization: true,
      force: true,
      executionPermitted: true
    },
    "DESIGN_ONLY_EXECUTION_DISABLED"
  );
});