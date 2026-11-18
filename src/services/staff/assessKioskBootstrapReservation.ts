/**
 * Non-authorizing first-admin bootstrap reservation assessment.
 *
 * Evidence is caller-supplied and therefore untrusted.
 * This function cannot establish durable uniqueness.
 * A future trusted, atomic storage boundary is required.
 */

export type BootstrapReservationEvidence = {
  directoryCount?: unknown;
  matchingBindingCount?: unknown;
  reservationState?: unknown;
  priorOutcome?: unknown;
};

export type BootstrapReservationAssessment = Readonly<{
  reviewEligible: boolean;
  executionPermitted: false;
  retryPermitted: false;
  authorizationGranted: false;
  reason: string;
}>;

function decision(
  reviewEligible: boolean,
  reason: string
): BootstrapReservationAssessment {
  return {
    reviewEligible,
    executionPermitted: false,
    retryPermitted: false,
    authorizationGranted: false,
    reason
  };
}

export function assessKioskBootstrapReservation(
  evidence: BootstrapReservationEvidence | null | undefined
): BootstrapReservationAssessment {
  if (!evidence || typeof evidence !== "object") {
    return decision(false, "EVIDENCE_MISSING");
  }

  if (evidence.directoryCount !== 0) {
    return decision(false, "DIRECTORY_NOT_EMPTY");
  }

  if (evidence.matchingBindingCount !== 0) {
    return decision(false, "BINDING_OWNERSHIP_NOT_CLEAR");
  }

  if (evidence.priorOutcome !== "none") {
    return decision(false, "PRIOR_OUTCOME_NOT_PROVEN_ABSENT");
  }

  if (evidence.reservationState !== "absent") {
    return decision(false, "RESERVATION_NOT_PROVEN_ABSENT");
  }

  return decision(true, "DURABLE_AUTHORIZATION_REVIEW_REQUIRED");
}
