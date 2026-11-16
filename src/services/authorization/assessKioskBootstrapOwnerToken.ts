import type { JWTVerifyGetKey } from "jose";

import {
  verifyEntraStaffAccessToken
} from "./verifyEntraStaffAccessToken";

/**
 * Isolated kiosk first-Staff owner token assessment.
 *
 * This verifies identity and token permissions only.
 * It does not establish Staff authority, owner approval,
 * key custody, or permission to execute any write.
 *
 * No API handler, environment credential loading,
 * Staff directory access, or Azure write exists here.
 */

export type KioskBootstrapOwnerTokenConfiguration = {
  tenantId: string;
  ownerObjectId: string;
  audience: string;
  requiredScope: string;
  allowedClientApplicationId: string;
};

export type KioskBootstrapOwnerTokenAssessment = Readonly<{
  status: string;
  identityMatched: boolean;
  tokenPermissionVerified: boolean;
  executionPermitted: false;
  staffCreationPermitted: false;
  approvalConsumptionPermitted: false;
  authorizationGranted: false;
}>;

const GUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const EXPECTED_TENANT =
  "783ef4b1-7e96-4a71-80dd-06865b015da9";

function deny(
  status: string,
  identityMatched = false,
  tokenPermissionVerified = false
): KioskBootstrapOwnerTokenAssessment {
  return Object.freeze({
    status,
    identityMatched,
    tokenPermissionVerified,
    executionPermitted: false,
    staffCreationPermitted: false,
    approvalConsumptionPermitted: false,
    authorizationGranted: false
  });
}

function validConfiguration(
  value: unknown
): value is KioskBootstrapOwnerTokenConfiguration {
  if (!value || typeof value !== "object" ||
      Array.isArray(value)) {
    return false;
  }

  const config =
    value as Partial<KioskBootstrapOwnerTokenConfiguration>;

  return (
    config.tenantId === EXPECTED_TENANT &&
    typeof config.ownerObjectId === "string" &&
    GUID.test(config.ownerObjectId) &&
    config.ownerObjectId === config.ownerObjectId.toLowerCase() &&
    typeof config.allowedClientApplicationId === "string" &&
    GUID.test(config.allowedClientApplicationId) &&
    config.allowedClientApplicationId ===
      config.allowedClientApplicationId.toLowerCase() &&
    typeof config.audience === "string" &&
    config.audience.length > 0 &&
    config.audience.length <= 256 &&
    config.audience.trim() === config.audience &&
    typeof config.requiredScope === "string" &&
    /^[A-Za-z][A-Za-z0-9._-]{2,127}$/.test(config.requiredScope)
  );
}

/**
 * Configuration must be supplied by a trusted executor,
 * never by an HTTP caller.
 *
 * resolveSigningKey exists for synthetic signed-JWT tests.
 * Production must rely on the existing Entra signing-key
 * resolver, not a request-provided key.
 */
export async function assessKioskBootstrapOwnerToken(
  accessToken: unknown,
  trustedConfiguration: unknown,
  resolveSigningKey?: JWTVerifyGetKey
): Promise<KioskBootstrapOwnerTokenAssessment> {
  if (!validConfiguration(trustedConfiguration)) {
    return deny("BOOTSTRAP_TOKEN_CONFIGURATION_NOT_VERIFIED");
  }

  if (
    typeof accessToken !== "string" ||
    accessToken.length < 20 ||
    accessToken.length > 16384
  ) {
    return deny("BOOTSTRAP_ACCESS_TOKEN_INVALID");
  }

  try {
    const verified = await verifyEntraStaffAccessToken(
      accessToken,
      {
        tenantId: trustedConfiguration.tenantId,
        audience: trustedConfiguration.audience,
        requiredPermissions: {
          scopes: [trustedConfiguration.requiredScope]
        },
        allowedClientApplicationIds: [
          trustedConfiguration.allowedClientApplicationId
        ]
      },
      resolveSigningKey
    );

    if (
      verified.tenantId !== trustedConfiguration.tenantId ||
      verified.objectId !== trustedConfiguration.ownerObjectId
    ) {
      return deny("BOOTSTRAP_OWNER_IDENTITY_MISMATCH");
    }

    if (
      !verified.scopes.includes(
        trustedConfiguration.requiredScope
      )
    ) {
      return deny("BOOTSTRAP_PERMISSION_NOT_VERIFIED");
    }

    return deny(
      "VERIFIED_OWNER_TOKEN_EXECUTION_DISABLED",
      true,
      true
    );
  } catch {
    // Do not expose tokens, signing-key details, or claims.
    return deny("BOOTSTRAP_TOKEN_VERIFICATION_FAILED");
  }
}