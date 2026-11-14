import {
  createHopeTableClient
} from "../shared/storage/createHopeTableClient";

import {
  PhaseCRecoveryReservationRepository
} from "./phaseCRecoveryReservationRepository";

/**
 * Private Phase C storage wiring foundation.
 *
 * This function is not connected to a runtime endpoint.
 * It performs no storage request, credential acquisition,
 * table provisioning or job creation.
 *
 * Configuration is injected by trusted runtime code only.
 * It is never an authorization decision.
 */

export type PhaseCRecoveryStorageConfig = Readonly<{
  enabled?: string;
  tableName?: string;
  endpoint?: string;
  managedIdentityClientId?: string;
}>;

const TABLE_NAME = /^[A-Za-z][A-Za-z0-9]{2,62}$/;

export function createPhaseCRecoveryReservationRepository(
  config: PhaseCRecoveryStorageConfig
): PhaseCRecoveryReservationRepository | null {
  if (!config || config.enabled !== "true") {
    return null;
  }

  if (
    typeof config.tableName !== "string" ||
    !TABLE_NAME.test(config.tableName)
  ) {
    throw new Error("PHASE_C_RECOVERY_TABLE_INVALID");
  }

  const table = createHopeTableClient(config.tableName, {
    mode: "managed-identity",
    endpoint: config.endpoint,
    managedIdentityClientId:
      config.managedIdentityClientId
  });

  return new PhaseCRecoveryReservationRepository(table);
}
