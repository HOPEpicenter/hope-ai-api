import assert from "node:assert/strict";
import {
  assessKioskAtomicCommitBoundary
} from "../../src/services/staff/assessKioskAtomicCommitBoundary";

const base = {
  reservationPartition: "kiosk-first-admin-bootstrap-v1",
  staffEventPartition: "staff-synthetic",
  sameStorageAccount: true,
  sameTable: true,
  singleTransaction: true
};

function main(): void {
  const missing = assessKioskAtomicCommitBoundary(null);

  assert.equal(missing.eligibleForDesignReview, false);
  assert.equal(missing.executionPermitted, false);

  const cross = assessKioskAtomicCommitBoundary(base);

  assert.equal(
    cross.reason,
    "CROSS_PARTITION_TRANSACTION_FORBIDDEN"
  );
  assert.equal(cross.eligibleForDesignReview, false);

  const differentTable = assessKioskAtomicCommitBoundary({
    ...base,
    staffEventPartition: base.reservationPartition,
    sameTable: false
  });

  assert.equal(
    differentTable.reason,
    "ATOMIC_TRANSACTION_NOT_ESTABLISHED"
  );

  const samePartition = assessKioskAtomicCommitBoundary({
    ...base,
    staffEventPartition: base.reservationPartition
  });

  assert.equal(
    samePartition.reason,
    "TRUSTED_TRANSACTION_IMPLEMENTATION_REQUIRED"
  );
  assert.equal(samePartition.eligibleForDesignReview, true);

  for (const result of [
    missing,
    cross,
    differentTable,
    samePartition
  ]) {
    assert.equal(result.atomicityProven, false);
    assert.equal(result.executionPermitted, false);
    assert.equal(result.staffCreationPermitted, false);
    assert.equal(result.authorizationGranted, false);
    assert.equal(result.retryPermitted, false);
  }

  console.log("CROSS_PARTITION_COMMIT_REJECTED=True");
  console.log("SEPARATE_TABLE_COMMIT_REJECTED=True");
  console.log("CALLER_EVIDENCE_NOT_AUTHORITY=True");
  console.log("STAFF_CREATION_ALWAYS_DISABLED=True");
  console.log("K358EO_ATOMICITY_TESTS_PASSED=True");
}

main();
