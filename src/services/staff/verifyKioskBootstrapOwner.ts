import {
  verifyEntraStaffAccessToken,
  type EntraStaffTokenVerificationConfiguration,
  type VerifiedEntraStaffAccessToken
} from "../authorization/verifyEntraStaffAccessToken";

export type KioskOwnerVerificationConfiguration =
  EntraStaffTokenVerificationConfiguration & Readonly<{
    expectedOwnerObjectId: string;
  }>;

export type OwnerTokenVerifier = (
  token: string,
  configuration: EntraStaffTokenVerificationConfiguration
) => Promise<VerifiedEntraStaffAccessToken>;

export type OwnerVerificationResult = Readonly<{
  verified: boolean;
  status: "OWNER_TOKEN_VERIFIED_EXECUTION_DISABLED" | "NOT_VERIFIED";
  executionPermitted: false;
  staffCreationPermitted: false;
  authorizationGranted: false;
  approvalConsumptionPermitted: false;
}>;

function result(verified: boolean): OwnerVerificationResult {
  return {
    verified,
    status: verified
      ? "OWNER_TOKEN_VERIFIED_EXECUTION_DISABLED"
      : "NOT_VERIFIED",
    executionPermitted: false,
    staffCreationPermitted: false,
    authorizationGranted: false,
    approvalConsumptionPermitted: false
  };
}

/**
 * Only a trusted server-side caller may provide configuration.
 * A successfully verified access token is identity evidence,
 * not administrator authorization or Staff creation permission.
 *
 * Deliberately returns no identifiers or token claims.
 */
export async function verifyKioskBootstrapOwner(
  token: unknown,
  configuration: KioskOwnerVerificationConfiguration | null,
  enabled = false,
  verifier: OwnerTokenVerifier = verifyEntraStaffAccessToken
): Promise<OwnerVerificationResult> {
  if (
    enabled !== true ||
    typeof token !== "string" ||
    token.length < 20 ||
    token.length > 16384 ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token) ||
    !configuration ||
    !Array.isArray(configuration.allowedClientApplicationIds) ||
    configuration.allowedClientApplicationIds.length === 0 ||
    !configuration.tenantId ||
    typeof configuration.expectedOwnerObjectId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      .test(configuration.expectedOwnerObjectId) ||
    !configuration.audience ||
    !configuration.requiredPermissions ||
    (
      !configuration.requiredPermissions.scopes?.length &&
      !configuration.requiredPermissions.roles?.length
    )
  ) {
    return result(false);
  }

  try {
    const identity = await verifier(token, configuration);
    const tenantMatches =
      identity.tenantId.toLowerCase() ===
      configuration.tenantId.toLowerCase();

    const ownerMatches =
      typeof identity.objectId === "string" &&
      identity.objectId.toLowerCase() ===
        configuration.expectedOwnerObjectId.toLowerCase();

    return result(tenantMatches && ownerMatches);
  } catch {
    return result(false);
  }
}
