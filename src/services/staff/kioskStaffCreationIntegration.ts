import type { StaffEvent } from "../../domain/staff/projectStaffDirectory";
import {
  inspectStaffCreationEvidence,
  type StaffCreationEvidenceReadPort
} from "../../repositories/inspectStaffCreationEvidence";
import {
  reconcileStaffCreationEvidence,
  type StaffCreationReconciliationResult
} from "./reconcileStaffCreationEvidence";
import type {
  OAuthStaffSecurityStorageRepository
} from "../../repositories/oauthStaffSecurityStorageRepository";
import {
  submitStaffScopedAtomicCreation,
  type StaffCreationTransactionPort
} from "../../repositories/staffScopedAtomicCreation";
import {
  coordinateStaffCreation,
  type StaffCreationCoordinationResult
} from "./coordinateStaffCreation";

/**
 * Test-only integration of existing Staff creation components.
 *
 * No default storage client, live HTTP route, Graph operation,
 * production permission, automatic retry, or reservation release.
 *
 * Not a global writer fence. Cross-partition transactions remain
 * non-atomic and require independent reconciliation.
 */
export interface KioskStaffCreationTestPorts {
  security: Pick<
    OAuthStaffSecurityStorageRepository,
    "reserveBinding" | "inspectReservation"
  >;
  canonical: StaffCreationTransactionPort;
}

function disabled(): StaffCreationCoordinationResult {
  return {
    status: "denied",
    stage: "not_started",
    reconciliationRequired: false,
    authoritative: false,
    executionPermitted: false,
    retryPermitted: false,
    automaticRecoveryPermitted: false,
    productionWriterFenced: false,
    productionRolloutPermitted: false
  };
}

export async function integrateKioskStaffCreationTestOnly(
  event: StaffEvent,
  operationId: string,
  ports: KioskStaffCreationTestPorts,
  testOnlyEnabled = false
): Promise<StaffCreationCoordinationResult> {
  if (
    testOnlyEnabled !== true ||
    process.env.NODE_ENV !== "test" ||
    process.env.HOPE_KIOSK_BOOTSTRAP_TEST_ONLY !== "true" ||
    process.env.WEBSITE_SITE_NAME
  ) {
    return disabled();
  }

  if (
    !ports ||
    !ports.security ||
    typeof ports.security.reserveBinding !== "function" ||
    typeof ports.security.inspectReservation !== "function" ||
    !ports.canonical ||
    typeof ports.canonical.submitTransaction !== "function"
  ) {
    return disabled();
  }

  return coordinateStaffCreation(
    event,
    operationId,
    {
      reserveBinding: request =>
        ports.security.reserveBinding(request),

      inspectReservation: request =>
        ports.security.inspectReservation(request),

      createCanonical: creation =>
        submitStaffScopedAtomicCreation(
          creation,
          ports.canonical,
          true
        )
    },
    true,
    true
  );
}
/**
 * Read-only interruption inspection for an isolated test caller.
 * No recovery writes, reservations, retries, or authorization.
 * Sequential evidence reads are not an atomic snapshot.
 */
export async function reconcileKioskStaffCreationTestOnly(
  event: StaffEvent,
  operationId: string,
  security: KioskStaffCreationTestPorts["security"],
  canonicalRead: StaffCreationEvidenceReadPort,
  testOnlyEnabled = false
): Promise<StaffCreationReconciliationResult> {
  const enabled =
    testOnlyEnabled === true &&
    process.env.NODE_ENV === "test" &&
    process.env.HOPE_KIOSK_BOOTSTRAP_TEST_ONLY === "true" &&
    !process.env.WEBSITE_SITE_NAME;

  return reconcileStaffCreationEvidence(
    event,
    operationId,
    {
      inspectReservation: request =>
        security.inspectReservation(request),
      inspectCanonical: creation =>
        inspectStaffCreationEvidence(
          creation,
          canonicalRead,
          true
        )
    },
    enabled
  );
}
