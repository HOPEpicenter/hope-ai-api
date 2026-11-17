/**
 * Isolated kiosk first-admin atomicity assessment.
 *
 * Offline, non-authorizing contract.
 * Does not create a TableClient, perform transactions,
 * reserve identity ownership, or write StaffEvents.
 *
 * Azure Table transactions cannot cross partition keys.
 * A separate singleton reservation and a StaffEvents
 * entry cannot be described as one atomic commit.
 */

export type KioskAtomicCommitEvidence = Readonly<{
  reservationPartition?: unknown;
  staffEventPartition?: unknown;
  sameStorageAccount?: unknown;
  sameTable?: unknown;
  singleTransaction?: unknown;
}>;

export type KioskAtomicCommitAssessment = Readonly<{
  atomicityProven: false;
  eligibleForDesignReview: boolean;
  executionPermitted: false;
  staffCreationPermitted: false;
  authorizationGranted: false;
  retryPermitted: false;
  reason: string;
}>;

function decision(
  eligibleForDesignReview: boolean,
  reason: string
): KioskAtomicCommitAssessment {
  return {
    atomicityProven: false,
    eligibleForDesignReview,
    executionPermitted: false,
    staffCreationPermitted: false,
    authorizationGranted: false,
    retryPermitted: false,
    reason
  };
}

export function assessKioskAtomicCommitBoundary(
  evidence: KioskAtomicCommitEvidence | null | undefined
): KioskAtomicCommitAssessment {
  if (!evidence || typeof evidence !== "object") {
    return decision(false, "EVIDENCE_MISSING");
  }

  if (
    evidence.sameStorageAccount !== true ||
    evidence.sameTable !== true ||
    evidence.singleTransaction !== true
  ) {
    return decision(false, "ATOMIC_TRANSACTION_NOT_ESTABLISHED");
  }

  const reservation = evidence.reservationPartition;
  const staffEvent = evidence.staffEventPartition;

  if (
    typeof reservation !== "string" ||
    typeof staffEvent !== "string" ||
    reservation.length === 0 ||
    staffEvent.length === 0
  ) {
    return decision(false, "PARTITION_EVIDENCE_INVALID");
  }

  if (reservation !== staffEvent) {
    return decision(false, "CROSS_PARTITION_TRANSACTION_FORBIDDEN");
  }

  // Matching caller-provided metadata is not proof that
  // a real atomic storage transaction exists.
  return decision(true, "TRUSTED_TRANSACTION_IMPLEMENTATION_REQUIRED");
}
