import assert from "node:assert/strict";

import type {
  StaffCreationReconciliationResult,
  StaffCreationReconciliationStatus
} from "../../src/services/staff/reconcileStaffCreationEvidence";

import {
  classifyStaffCreationRecoveryDecision,
  type StaffCreationRecoveryDecision,
  type StaffCreationReviewAction
} from "../../src/services/staff/classifyStaffCreationRecoveryDecision";

function evidence(
  status: StaffCreationReconciliationStatus
): StaffCreationReconciliationResult {
  return {
    status,
    reconciliationRequired: true,
    authoritative: false,
    executionPermitted: false,
    retryPermitted: false,
    automaticRecoveryPermitted: false,
    reservationReleasePermitted: false,
    productionWriterFenced: false,
    productionRolloutPermitted: false
  };
}

function noAuthority(value: StaffCreationRecoveryDecision): void {
  assert.equal(value.manualReviewRequired, true);
  assert.equal(value.reconciliationRequired, true);
  assert.equal(value.authoritative, false);
  assert.equal(value.executionPermitted, false);
  assert.equal(value.retryPermitted, false);
  assert.equal(value.automaticRecoveryPermitted, false);
  assert.equal(value.reservationReleasePermitted, false);
  assert.equal(value.productionWriterFenced, false);
  assert.equal(value.productionRolloutPermitted, false);
  assert.equal(value.graphInvitationPermitted, false);
  assert.equal(value.oauthExecutionPermitted, false);
  assert.equal(value.identityMutationPermitted, false);
}

function verify(
  status: StaffCreationReconciliationStatus,
  expected: StaffCreationReviewAction
): void {
  const result = classifyStaffCreationRecoveryDecision(
    evidence(status),
    true
  );

  assert.equal(result.reconciliationStatus, status);
  assert.equal(result.recommendedReview, expected);
  noAuthority(result);
  assert.equal(Object.isFrozen(result), true);
}

function main(): void {
  {
    const result = classifyStaffCreationRecoveryDecision(
      evidence("observed_both")
    );

    assert.equal(result.reconciliationStatus, "not_evaluated");
    assert.equal(result.recommendedReview, "no_inspection");
    noAuthority(result);
    console.log("[PASS] Default-disabled never interprets evidence");
  }

  verify("observed_both", "review_observed_evidence");
  console.log("[PASS] Both observations require human review");

  verify("historical_binding", "investigate_binding_ownership");
  console.log("[PASS] Historical ownership requires investigation");

  verify(
    "incomplete_or_unavailable",
    "reinspect_after_storage_review"
  );
  console.log("[PASS] Missing evidence never triggers recovery");

  verify("conflicting", "escalate_conflict");
  console.log("[PASS] Conflicting evidence escalates");

  verify("uncertain", "investigate_uncertainty");
  console.log("[PASS] Uncertainty remains non-authorizing");

  verify("invalid_input", "correct_input");
  console.log("[PASS] Invalid inputs require correction");

  verify("not_evaluated", "no_inspection");
  console.log("[PASS] Unevaluated evidence gives no authority");

  {
    const invalid = {
      ...evidence("observed_both"),
      executionPermitted: true
    };

    const result = classifyStaffCreationRecoveryDecision(
      invalid,
      true
    );

    assert.equal(result.reconciliationStatus, "invalid_evidence");
    assert.equal(result.recommendedReview, "investigate_uncertainty");
    noAuthority(result);
    console.log("[PASS] Forged authority rejected");
  }

  {
    const invalid = {
      ...evidence("observed_both"),
      productionWriterFenced: true
    };

    const result = classifyStaffCreationRecoveryDecision(
      invalid,
      true
    );

    assert.equal(result.reconciliationStatus, "invalid_evidence");
    noAuthority(result);
    console.log("[PASS] Unsupported writer-fencing claim rejected");
  }

  {
    const result = classifyStaffCreationRecoveryDecision(
      null,
      true
    );

    assert.equal(result.reconciliationStatus, "invalid_evidence");
    noAuthority(result);
    console.log("[PASS] Missing evidence fails closed");
  }

  {
    const result = classifyStaffCreationRecoveryDecision(
      {
        ...evidence("observed_both"),
        status: "invented_authorization"
      },
      true
    );

    assert.equal(result.reconciliationStatus, "invalid_evidence");
    noAuthority(result);
    console.log("[PASS] Unknown evidence classification rejected");
  }

  console.log("[PASS] All 12 recovery decision regressions");
}

main();