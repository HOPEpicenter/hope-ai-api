import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { TableClient } from "@azure/data-tables";

import {
  PhaseCRecoveryReservationRepository
} from "../../src/repositories/phaseCRecoveryReservationRepository";

import {
  assessPhaseCProtectedOperationAuthority,
  phaseCProtectedAuthorityVerifierAvailable
} from "../../src/services/authorization/assessPhaseCProtectedOperationAuthority";

async function main(): Promise<void> {
  let transactionCount = 0;

  const table = {
    async submitTransaction(actions: unknown[]) {
      transactionCount += 1;
      assert.equal(actions.length, 2);
    }
  } as unknown as TableClient;

  const repository =
    new PhaseCRecoveryReservationRepository(table);

  const operationId = randomUUID();
  const requestId = randomUUID();

  const reservation = await repository.reserve({
    operationId,
    requestId,
    createdUtc: 1000
  });

  assert.equal(reservation.status, "reserved");
  assert.equal(reservation.executionAuthorized, false);
  assert.equal(reservation.retryAuthorized, false);
  assert.equal(transactionCount, 1);

  console.log("PASS=RESERVATION_NOT_EXECUTION_AUTHORITY");

  const scope = {
    operationId,
    requestId,
    resourceScope: "synthetic-private-resource",
    runbookName: "synthetic-operation-aware-runbook",
    expiresUtc: 9999999999,
    approvalProvenance: "synthetic-approval",
    oneTimeUse: true
  };

  const decision = assessPhaseCProtectedOperationAuthority(
    scope,
    {
      reservationStatus: reservation.status,
      approved: true,
      issuer: "trusted",
      replayClear: true
    },
    true
  );

  assert.deepEqual(decision, {
    status: "TRUSTED_OPERATION_AUTHORITY_NOT_CONNECTED",
    executionAuthorized: false,
    retryAuthorized: false
  });

  console.log("PASS=RESERVED_OPERATION_STILL_DENIED");

  const adminDecision = assessPhaseCProtectedOperationAuthority(
    scope,
    {
      systemAdmin: true,
      environmentApproved: true,
      reservationStatus: "reserved"
    },
    true
  );

  assert.equal(adminDecision.executionAuthorized, false);
  assert.equal(adminDecision.retryAuthorized, false);

  console.log("PASS=ADMIN_CANNOT_BYPASS_AUTHORITY");

  assert.equal(
    phaseCProtectedAuthorityVerifierAvailable(),
    false
  );

  assert.equal(transactionCount, 1);

  console.log("PASS=VERIFIER_UNAVAILABLE");
  console.log("PASS=NO_ADDITIONAL_STORAGE_TRANSACTION");
  console.log("PHASE_C_AUTHORITY_RESERVATION_TESTS_PASSED=True");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
