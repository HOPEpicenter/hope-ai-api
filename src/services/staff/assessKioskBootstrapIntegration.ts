import {
  assessKioskFirstAdminBootstrap,
  type KioskBootstrapEvidence
} from "./assessKioskFirstAdminBootstrap";

import {
  assessKioskBootstrapReservation,
  type BootstrapReservationEvidence
} from "./assessKioskBootstrapReservation";

import {
  planKioskAtomicBootstrap,
  type KioskAtomicBootstrapInput
} from "./planKioskAtomicBootstrap";

import {
  assessDisabledStaffAuthorityProposal
} from "../../domain/staff/disabledStaffAuthorityContract";

/**
 * Read-only composition of established Staff and kiosk contracts.
 * Caller-supplied evidence cannot confer authority.
 *
 * This function deliberately never invokes the existing
 * coordinateStaffCreation writer prototype.
 */
export function assessKioskBootstrapIntegration(input: {
  identity: KioskBootstrapEvidence | null;
  reservation: BootstrapReservationEvidence | null;
  atomic: KioskAtomicBootstrapInput | null;
} | null) {
  const identity = assessKioskFirstAdminBootstrap(
    input?.identity
  );

  const reservation = assessKioskBootstrapReservation(
    input?.reservation
  );

  const atomic = planKioskAtomicBootstrap(
    input?.atomic
  );

  const authority = assessDisabledStaffAuthorityProposal(null);

  const reviewEligible =
    identity.eligibleForReview &&
    reservation.reviewEligible &&
    atomic.status === "review_only";

  return {
    reviewEligible,
    reason: !identity.eligibleForReview
      ? identity.reason
      : !reservation.reviewEligible
        ? reservation.reason
        : atomic.status !== "review_only"
          ? atomic.reason
          : "STAFF_AUTHORITY_DISABLED",
    staffAuthorityStatus: authority.status,
    globalBindingUniquenessProven: false as const,
    executionPermitted: false as const,
    authorizationGranted: false as const,
    staffCreationPermitted: false as const,
    retryPermitted: false as const,
    deploymentPermitted: false as const
  };
}
