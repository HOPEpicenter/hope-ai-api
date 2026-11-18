import assert from "node:assert/strict";

import {
  assessKioskBootstrapIntegration
} from "../../src/services/staff/assessKioskBootstrapIntegration";

const candidate = {
  identity: {
    siteName: "hope-kiosk-frontend-20261122",
    backendUrl: "https://hope-kiosk-acceptance-api.azurewebsites.net/api",
    canonicalStaffCount: 0,
    writerMode: "legacy",
    tenantId: "11111111-1111-4111-8111-111111111111",
    objectId: "22222222-2222-4222-8222-222222222222",
    identityVerified: true
  },
  reservation: {
    directoryCount: 0,
    matchingBindingCount: 0,
    reservationState: "absent",
    priorOutcome: "none"
  },
  atomic: {
    environment: "hope-kiosk-frontend-20261122",
    backend: "https://hope-kiosk-acceptance-api.azurewebsites.net/api",
    directoryCount: 0,
    writerMode: "legacy",
    staffPartition: "staff-0123456789abcdef",
    reservationPartition: "staff-0123456789abcdef",
    operationId: "33333333-3333-4333-8333-333333333333",
    ownerIdentityVerified: true
  }
};

function assertNoAuthority(result: ReturnType<
  typeof assessKioskBootstrapIntegration
>): void {
  assert.equal(result.executionPermitted, false);
  assert.equal(result.authorizationGranted, false);
  assert.equal(result.staffCreationPermitted, false);
  assert.equal(result.retryPermitted, false);
  assert.equal(result.deploymentPermitted, false);
  assert.equal(result.globalBindingUniquenessProven, false);
  assert.equal(result.staffAuthorityStatus, "disabled");
}

const missing = assessKioskBootstrapIntegration(null);
assert.equal(missing.reviewEligible, false);
assertNoAuthority(missing);

const ready = assessKioskBootstrapIntegration(candidate);
assert.equal(ready.reviewEligible, true);
assert.equal(ready.reason, "STAFF_AUTHORITY_DISABLED");
assertNoAuthority(ready);

const duplicate = assessKioskBootstrapIntegration({
  ...candidate,
  reservation: {
    ...candidate.reservation,
    matchingBindingCount: 1
  }
});

assert.equal(duplicate.reviewEligible, false);
assert.equal(
  duplicate.reason,
  "BINDING_OWNERSHIP_NOT_CLEAR"
);
assertNoAuthority(duplicate);

const crossPartition = assessKioskBootstrapIntegration({
  ...candidate,
  atomic: {
    ...candidate.atomic,
    reservationPartition: "different-partition"
  }
});

assert.equal(crossPartition.reviewEligible, false);
assert.equal(
  crossPartition.reason,
  "CROSS_PARTITION_TRANSACTION_DENIED"
);
assertNoAuthority(crossPartition);

console.log("KIOSK_CONTRACT_INTEGRATION_PASSED=True");
console.log("DUPLICATE_BINDING_DENIED=True");
console.log("CROSS_PARTITION_DENIED=True");
console.log("STAFF_AUTHORITY_REMAINS_DISABLED=True");
console.log("NO_EXECUTABLE_CREATION_PATH=True");
console.log("K358EV_TESTS_PASSED=True");
