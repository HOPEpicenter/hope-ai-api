import {
  createPhaseCRecoveryReservationRepository
} from "../../repositories/createPhaseCRecoveryReservationRepository";

import type {
  PhaseCRecoveryReservationRepository
} from "../../repositories/phaseCRecoveryReservationRepository";

/**
 * Internal, default-disabled Phase C configuration boundary.
 *
 * No HTTP route, job writer, storage request or authorization grant.
 * Runtime code must not treat a repository as an execution permit.
 */
export type PhaseCRecoveryEnvironment = Readonly<{
  HOPE_PHASE_C_RECOVERY_STORAGE_ENABLED?: string;
  HOPE_PHASE_C_RECOVERY_TABLE_NAME?: string;
  HOPE_TABLE_AUTH_MODE?: string;
  HOPE_TABLE_ENDPOINT?: string;
  HOPE_TABLE_MANAGED_IDENTITY_CLIENT_ID?: string;
}>;

export function resolvePhaseCRecoveryStorage(
  environment: PhaseCRecoveryEnvironment
): PhaseCRecoveryReservationRepository | null {
  if (!environment ||
      environment.HOPE_PHASE_C_RECOVERY_STORAGE_ENABLED !== "true") {
    return null;
  }

  if (environment.HOPE_TABLE_AUTH_MODE !== "managed-identity") {
    throw new Error("PHASE_C_MANAGED_IDENTITY_REQUIRED");
  }

  return createPhaseCRecoveryReservationRepository({
    enabled: "true",
    tableName: environment.HOPE_PHASE_C_RECOVERY_TABLE_NAME,
    endpoint: environment.HOPE_TABLE_ENDPOINT,
    managedIdentityClientId:
      environment.HOPE_TABLE_MANAGED_IDENTITY_CLIENT_ID
  });
}
