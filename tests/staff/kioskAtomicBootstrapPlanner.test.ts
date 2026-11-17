import assert from "node:assert/strict";

import {
  planKioskAtomicBootstrap
} from "../../src/services/staff/planKioskAtomicBootstrap";

const candidate = {
  environment: "hope-kiosk-frontend-20261122",
  backend: "https://hope-kiosk-acceptance-api.azurewebsites.net/api",
  directoryCount: 0,
  writerMode: "legacy",
  staffPartition: "staff-0123456789abcdef",
  reservationPartition: "staff-0123456789abcdef",
  operationId: "33333333-3333-4333-8333-333333333333",
  ownerIdentityVerified: true
};

function main(): void {
  const denied = [
    planKioskAtomicBootstrap(null),
    planKioskAtomicBootstrap({}),
    planKioskAtomicBootstrap({
      ...candidate,
      environment: "production"
    }),
    planKioskAtomicBootstrap({
      ...candidate,
      directoryCount: 1
    }),
    planKioskAtomicBootstrap({
      ...candidate,
      writerMode: "migration_hold"
    }),
    planKioskAtomicBootstrap({
      ...candidate,
      ownerIdentityVerified: false
    }),
    planKioskAtomicBootstrap({
      ...candidate,
      operationId: "invalid"
    }),
    planKioskAtomicBootstrap({
      ...candidate,
      reservationPartition: "kiosk-bootstrap-singleton"
    })
  ];

  for (const result of denied) {
    assert.equal(result.status, "denied");
    assert.equal(result.transactionPartition, null);
    assert.deepEqual(result.logicalOperations, []);
  }

  const crossPartition = planKioskAtomicBootstrap({
    ...candidate,
    reservationPartition: "kiosk-bootstrap-singleton"
  });

  assert.equal(
    crossPartition.reason,
    "CROSS_PARTITION_TRANSACTION_DENIED"
  );

  const review = planKioskAtomicBootstrap(candidate);

  assert.equal(review.status, "review_only");
  assert.equal(
    review.reason,
    "TRUSTED_COORDINATOR_REQUIRED"
  );
  assert.equal(
    review.transactionPartition,
    candidate.staffPartition
  );
  assert.deepEqual(review.logicalOperations, [
    "reserve_first_admin",
    "create_canonical_staff"
  ]);

  for (const result of [...denied, review]) {
    assert.equal(result.globalBindingUniquenessProven, false);
    assert.equal(result.projectionCompatibilityProven, false);
    assert.equal(result.writerIsolationProven, false);
    assert.equal(result.executionPermitted, false);
    assert.equal(result.staffCreationPermitted, false);
    assert.equal(result.authorizationGranted, false);
    assert.equal(result.retryPermitted, false);
  }

  console.log("DEFAULT_DENY_TESTS_PASSED=True");
  console.log("ISOLATION_GUARD_PASSED=True");
  console.log("CROSS_PARTITION_REJECTED=True");
  console.log("SINGLE_PARTITION_PLAN_REVIEW_ONLY=True");
  console.log("GLOBAL_UNIQUENESS_NOT_CLAIMED=True");
  console.log("STAFF_CREATION_ALWAYS_DISABLED=True");
  console.log("K358EQ_PLANNER_TESTS_PASSED=True");
}

main();
