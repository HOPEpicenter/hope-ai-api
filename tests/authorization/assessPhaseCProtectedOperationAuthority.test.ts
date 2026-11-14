import assert from "node:assert/strict";
import {
  assessPhaseCProtectedOperationAuthority,
  phaseCProtectedAuthorityVerifierAvailable,
  type PhaseCProtectedOperationScope
} from "../../src/services/authorization/assessPhaseCProtectedOperationAuthority";

function main(): void {
  const denied = {
    status: "TRUSTED_OPERATION_AUTHORITY_NOT_CONNECTED",
    executionAuthorized: false,
    retryAuthorized: false
  };

  assert.deepEqual(
    assessPhaseCProtectedOperationAuthority(),
    denied
  );
  console.log("PASS=DEFAULT_DENY");

  const scope: PhaseCProtectedOperationScope = {
    operationId: "synthetic-operation",
    resourceScope: "synthetic-resource",
    runbookName: "synthetic-runbook",
    requestId: "synthetic-request",
    expiresUtc: 9999999999,
    approvalProvenance: "synthetic-approval",
    oneTimeUse: true
  };

  assert.deepEqual(
    assessPhaseCProtectedOperationAuthority(
      scope,
      {
        approved: true,
        verified: true,
        issuer: "trusted",
        replayClear: true
      },
      true
    ),
    denied
  );
  console.log("PASS=CALLER_AUTHORITY_DENIED");

  assert.deepEqual(
    assessPhaseCProtectedOperationAuthority(
      scope,
      { administrator: true, environment: "production" },
      true
    ),
    denied
  );
  console.log("PASS=ADMIN_AND_ENVIRONMENT_DENIED");

  assert.deepEqual(
    assessPhaseCProtectedOperationAuthority(
      scope,
      { reservationStatus: "reserved" },
      true
    ),
    denied
  );
  console.log("PASS=RESERVATION_NOT_AUTHORITY");

  assert.deepEqual(
    assessPhaseCProtectedOperationAuthority(
      null,
      null,
      true
    ),
    denied
  );
  console.log("PASS=MISSING_EVIDENCE_DENIED");

  assert.equal(
    phaseCProtectedAuthorityVerifierAvailable(),
    false
  );
  console.log("PASS=VERIFIER_UNAVAILABLE");

  console.log("PHASE_C_PROTECTED_AUTHORITY_TESTS_PASSED=True");
}

main();
