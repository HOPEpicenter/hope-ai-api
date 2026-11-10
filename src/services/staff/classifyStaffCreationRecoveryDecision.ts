import type {
  StaffCreationReconciliationResult,
  StaffCreationReconciliationStatus
} from "./reconcileStaffCreationEvidence";

/**
 * Advisory classification only.
 *
 * Does not inspect storage, authorize execution, schedule
 * retries, release bindings, mutate Staff identities, or
 * interact with Microsoft Graph, OAuth, or Azure.
 *
 * Historical reconciliation observations are not an
 * atomic snapshot or an authorization fence.
 */

export type StaffCreationReviewAction =
  | "no_inspection"
  | "correct_input"
  | "review_observed_evidence"
  | "investigate_binding_ownership"
  | "reinspect_after_storage_review"
  | "escalate_conflict"
  | "investigate_uncertainty";

export type StaffCreationRecoveryDecision = Readonly<{
  reconciliationStatus: StaffCreationReconciliationStatus | "invalid_evidence";
  recommendedReview: StaffCreationReviewAction;
  manualReviewRequired: true;
  reconciliationRequired: true;
  authoritative: false;
  executionPermitted: false;
  retryPermitted: false;
  automaticRecoveryPermitted: false;
  reservationReleasePermitted: false;
  productionWriterFenced: false;
  productionRolloutPermitted: false;
  graphInvitationPermitted: false;
  oauthExecutionPermitted: false;
  identityMutationPermitted: false;
}>;

const reviewMap: Readonly<
  Record<StaffCreationReconciliationStatus, StaffCreationReviewAction>
> = Object.freeze({
  not_evaluated: "no_inspection",
  invalid_input: "correct_input",
  observed_both: "review_observed_evidence",
  historical_binding: "investigate_binding_ownership",
  incomplete_or_unavailable: "reinspect_after_storage_review",
  conflicting: "escalate_conflict",
  uncertain: "investigate_uncertainty"
});

function record(value: unknown): Record<string, unknown> | null {
  if (value === null ||
      typeof value !== "object" ||
      Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function isValidEvidence(
  value: Record<string, unknown>
): value is Record<string, unknown> &
  StaffCreationReconciliationResult {
  return (
    value.reconciliationRequired === true &&
    value.authoritative === false &&
    value.executionPermitted === false &&
    value.retryPermitted === false &&
    value.automaticRecoveryPermitted === false &&
    value.reservationReleasePermitted === false &&
    value.productionWriterFenced === false &&
    value.productionRolloutPermitted === false &&
    typeof value.status === "string" &&
    Object.prototype.hasOwnProperty.call(reviewMap, value.status)
  );
}

function decision(
  status: StaffCreationRecoveryDecision["reconciliationStatus"],
  recommendedReview: StaffCreationReviewAction
): StaffCreationRecoveryDecision {
  return Object.freeze({
    reconciliationStatus: status,
    recommendedReview,
    manualReviewRequired: true,
    reconciliationRequired: true,
    authoritative: false,
    executionPermitted: false,
    retryPermitted: false,
    automaticRecoveryPermitted: false,
    reservationReleasePermitted: false,
    productionWriterFenced: false,
    productionRolloutPermitted: false,
    graphInvitationPermitted: false,
    oauthExecutionPermitted: false,
    identityMutationPermitted: false
  });
}

/**
 * Default-disabled pure decision function.
 * No ports, callbacks, network connections, or side effects.
 */
export function classifyStaffCreationRecoveryDecision(
  evidence: unknown,
  prototypeEnabled = false
): StaffCreationRecoveryDecision {
  if (prototypeEnabled !== true) {
    return decision("not_evaluated", "no_inspection");
  }

  const candidate = record(evidence);

  if (!candidate || !isValidEvidence(candidate)) {
    return decision("invalid_evidence", "investigate_uncertainty");
  }

  return decision(
    candidate.status,
    reviewMap[candidate.status]
  );
}