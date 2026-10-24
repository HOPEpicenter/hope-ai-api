import type { MinistryAuthorizationContextV1 } from "../../contracts/ministryAuthorizationPolicy.v1";
import {
  normalizeEntraStaffBinding,
  type CanonicalStaffIdentity
} from "../../domain/staff/projectStaffDirectory";
import {
  verifyEntraStaffAccessToken,
  type EntraStaffTokenVerificationConfiguration
} from "./verifyEntraStaffAccessToken";
import type { JWTVerifyGetKey } from "jose";
import { resolveTrustedMinistryRole } from "./resolveTrustedMinistryRole";

export type ResolveTrustedMinistryAuthorizationContextDependencies = {
  readStaffDirectory?: () => Promise<CanonicalStaffIdentity[]>;
  resolveSigningKey?: JWTVerifyGetKey;
};

/**
 * Builds ministry authorization context from a verified Entra access token
 * and one canonical staff-directory snapshot.
 *
 * Configuration and dependency providers must come from trusted backend code.
 * Client-supplied staff IDs, roles, ministry scopes, and visitor assignments
 * must never be treated as authorization evidence.
 *
 * This does not authorize HTTP requests. Leadership and assignment scopes
 * deliberately remain empty until independently established.
 */
export async function resolveTrustedMinistryAuthorizationContext(
  accessToken: string,
  configuration: EntraStaffTokenVerificationConfiguration,
  dependencies: ResolveTrustedMinistryAuthorizationContextDependencies = {}
): Promise<MinistryAuthorizationContextV1> {
  // Authentication must succeed before accessing canonical staff data.
  const verifiedToken = await verifyEntraStaffAccessToken(
    accessToken,
    configuration,
    dependencies.resolveSigningKey
  );

  const verifiedBinding = normalizeEntraStaffBinding(
    verifiedToken.tenantId,
    verifiedToken.objectId
  );

  if (!verifiedBinding) {
    throw new Error("Verified token has no valid canonical staff binding");
  }

  const directory = dependencies.readStaffDirectory
    ? await dependencies.readStaffDirectory()
    : await (
        await import("../staff/readCanonicalStaffDirectory")
      ).readCanonicalStaffDirectory();

  if (!Array.isArray(directory)) {
    throw new Error("Canonical staff directory is unavailable");
  }

  const matches = directory.filter(staff => {
    if (!staff || typeof staff.staffId !== "string" ||
        !staff.staffId.trim() ||
        staff.staffId !== staff.staffId.trim()) {
      return false;
    }

    const binding = normalizeEntraStaffBinding(
      staff.entraTenantId,
      staff.entraObjectId
    );

    return (
      binding?.entraTenantId === verifiedBinding.entraTenantId &&
      binding.entraObjectId === verifiedBinding.entraObjectId
    );
  });

  if (matches.length !== 1) {
    throw new Error("Verified token must match exactly one canonical staff identity");
  }

  const staff = matches[0];

  if (staff.status !== "active") {
    throw new Error("Canonical staff identity is not active");
  }

  // An ambiguous canonical staff ID must not acquire another record's role.
  if (directory.filter(item => item?.staffId === staff.staffId).length !== 1) {
    throw new Error("Canonical staff ID is not unique");
  }

  const role = resolveTrustedMinistryRole(staff);

  if (!role) {
    throw new Error("Canonical staff role is not authorized");
  }

  return {
    verifiedStaffId: staff.staffId,
    role,
    active: true,
    ledMinistryAreaIds: [],
    assignedVisitorIds: []
  };
}
