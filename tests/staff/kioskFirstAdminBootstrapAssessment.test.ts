import assert from "node:assert/strict";
import {
  assessKioskFirstAdminBootstrap
} from "../../src/services/staff/assessKioskFirstAdminBootstrap";

const candidate = {
  siteName: "hope-kiosk-frontend-20261122",
  backendUrl: "https://hope-kiosk-acceptance-api.azurewebsites.net/api",
  canonicalStaffCount: 0,
  writerMode: "legacy",
  tenantId: "11111111-1111-4111-8111-111111111111",
  objectId: "22222222-2222-4222-8222-222222222222",
  identityVerified: true
};

function verifyDenied(
  evidence: Parameters<typeof assessKioskFirstAdminBootstrap>[0],
  expectedReason: string
): void {
  const actual = assessKioskFirstAdminBootstrap(evidence);

  assert.equal(actual.eligibleForReview, false);
  assert.equal(actual.executionPermitted, false);
  assert.equal(actual.authorizationGranted, false);
  assert.equal(actual.staffMutationPermitted, false);
  assert.equal(actual.reason, expectedReason);
}

function main(): void {
  verifyDenied(null, "EVIDENCE_MISSING");
  verifyDenied(
    { ...candidate, siteName: "hope-ai-api-staging" },
    "ISOLATION_MISMATCH"
  );
  verifyDenied(
    { ...candidate, backendUrl: "https://example.invalid/api" },
    "ISOLATION_MISMATCH"
  );
  verifyDenied(
    { ...candidate, canonicalStaffCount: 1 },
    "DIRECTORY_NOT_PROVEN_EMPTY"
  );
  verifyDenied(
    { ...candidate, canonicalStaffCount: undefined },
    "DIRECTORY_NOT_PROVEN_EMPTY"
  );
  verifyDenied(
    { ...candidate, writerMode: "migration_hold" },
    "WRITER_MODE_NOT_ELIGIBLE"
  );
  verifyDenied(
    { ...candidate, writerMode: "coordinated" },
    "WRITER_MODE_NOT_ELIGIBLE"
  );
  verifyDenied(
    { ...candidate, tenantId: "invalid" },
    "IDENTITY_FORMAT_INVALID"
  );
  verifyDenied(
    { ...candidate, objectId: "invalid" },
    "IDENTITY_FORMAT_INVALID"
  );
  verifyDenied(
    { ...candidate, identityVerified: false },
    "IDENTITY_NOT_VERIFIED"
  );

  const ready = assessKioskFirstAdminBootstrap(candidate);

  assert.equal(ready.eligibleForReview, true);
  assert.equal(ready.reason, "REVIEW_REQUIRED");
  assert.equal(ready.executionPermitted, false);
  assert.equal(ready.authorizationGranted, false);
  assert.equal(ready.staffMutationPermitted, false);

  console.log("DEFAULT_DENY_TESTS_PASSED=True");
  console.log("ISOLATION_GUARDS_PASSED=True");
  console.log("EMPTY_DIRECTORY_GUARD_PASSED=True");
  console.log("WRITER_MODE_GUARD_PASSED=True");
  console.log("IDENTITY_FORMAT_GUARD_PASSED=True");
  console.log("REVIEW_NEVER_AUTHORIZES_EXECUTION=True");
  console.log("K304D_OFFLINE_TESTS_PASSED=True");
}

main();
