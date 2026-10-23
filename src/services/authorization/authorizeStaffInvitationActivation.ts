import {
  verifyEntraStaffAccessToken,
  type EntraStaffTokenVerificationConfiguration,
  type VerifiedEntraStaffAccessToken
} from "./verifyEntraStaffAccessToken";

const GUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type StaffInvitationActivationAuthorizationResult =
  | {
      allowed: true;
      tenantId: string;
      objectId: string;
    }
  | {
      allowed: false;
      reason:
        | "invalid_target"
        | "authentication_failed"
        | "identity_mismatch";
    };

export type VerifyStaffInvitationActivationToken = (
  accessToken: string,
  configuration: EntraStaffTokenVerificationConfiguration
) => Promise<VerifiedEntraStaffAccessToken>;

export async function authorizeStaffInvitationActivation(
  accessToken: string,
  targetTenantId: string,
  targetObjectId: string,
  configuration: EntraStaffTokenVerificationConfiguration,
  verifyToken: VerifyStaffInvitationActivationToken =
    verifyEntraStaffAccessToken
): Promise<StaffInvitationActivationAuthorizationResult> {
  if (
    typeof targetTenantId !== "string" ||
    typeof targetObjectId !== "string" ||
    !GUID_PATTERN.test(targetTenantId) ||
    !GUID_PATTERN.test(targetObjectId)
  ) {
    return {
      allowed: false,
      reason: "invalid_target"
    };
  }

  if (
    typeof accessToken !== "string" ||
    accessToken.trim() !== accessToken ||
    accessToken.length === 0 ||
    !configuration ||
    typeof configuration !== "object" ||
    !GUID_PATTERN.test(configuration.tenantId ?? "") ||
    configuration.tenantId.toLowerCase() !== targetTenantId.toLowerCase() ||
    typeof configuration.audience !== "string" ||
    configuration.audience.trim().length === 0 ||
    configuration.audience.trim() !== configuration.audience ||
    !configuration.requiredPermissions ||
    typeof configuration.requiredPermissions !== "object" ||
    !(
      (Array.isArray(configuration.requiredPermissions.scopes) &&
        configuration.requiredPermissions.scopes.some(
          permission =>
            typeof permission === "string" &&
            permission.trim().length > 0
        )) ||
      (Array.isArray(configuration.requiredPermissions.roles) &&
        configuration.requiredPermissions.roles.some(
          permission =>
            typeof permission === "string" &&
            permission.trim().length > 0
        ))
    )
  ) {
    return {
      allowed: false,
      reason: "authentication_failed"
    };
  }

  let verified: VerifiedEntraStaffAccessToken;

  try {
    verified = await verifyToken(accessToken, configuration);
  } catch {
    return {
      allowed: false,
      reason: "authentication_failed"
    };
  }

  if (
    !verified ||
    typeof verified.tenantId !== "string" ||
    typeof verified.objectId !== "string" ||
    !GUID_PATTERN.test(verified.tenantId) ||
    !GUID_PATTERN.test(verified.objectId)
  ) {
    return {
      allowed: false,
      reason: "authentication_failed"
    };
  }

  if (
    verified.tenantId.toLowerCase() !== targetTenantId.toLowerCase() ||
    verified.objectId.toLowerCase() !== targetObjectId.toLowerCase()
  ) {
    return {
      allowed: false,
      reason: "identity_mismatch"
    };
  }

  return {
    allowed: true,
    tenantId: verified.tenantId.toLowerCase(),
    objectId: verified.objectId.toLowerCase()
  };
}
