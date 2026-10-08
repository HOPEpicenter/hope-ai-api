import type { CanonicalStaffIdentity } from "../../domain/staff/projectStaffDirectory";
import { normalizeEntraStaffBinding } from "../../domain/staff/projectStaffDirectory";
import { readCanonicalStaffDirectory } from "../staff/readCanonicalStaffDirectory";
import {
  verifyEntraStaffAccessToken,
  type EntraStaffTokenVerificationConfiguration,
  type VerifiedEntraStaffAccessToken
} from "./verifyEntraStaffAccessToken";
import type { JWTVerifyGetKey } from "jose";

export type ResolvedEntraStaffIdentity = {
  staffId: string;
  tenantId: string;
  objectId: string;
};

export type ResolveVerifiedEntraStaffIdentityDependencies = {
  readStaffDirectory?: () => Promise<CanonicalStaffIdentity[]>;
  resolveSigningKey?: JWTVerifyGetKey;
};

/**
 * Verifies the raw token before reading canonical staff. This is the only
 * exported resolution entry point; verified claim objects are never accepted
 * as caller-supplied identity evidence. Configuration must be supplied from
 * trusted server configuration, not derived from token claims or user input.
 *
 * The result establishes canonical identity only. It does not grant staff,
 * pastor, ministry-leader, or administrator permissions.
 */
export async function resolveVerifiedEntraStaffIdentity(
  accessToken: string,
  configuration: EntraStaffTokenVerificationConfiguration,
  dependencies: ResolveVerifiedEntraStaffIdentityDependencies = {}
): Promise<ResolvedEntraStaffIdentity> {
  const verifiedToken: VerifiedEntraStaffAccessToken =
    await verifyEntraStaffAccessToken(
      accessToken,
      configuration,
      dependencies.resolveSigningKey
    );
  const binding = normalizeEntraStaffBinding(
    verifiedToken.tenantId,
    verifiedToken.objectId
  );

  if (!binding) {
    throw new Error("Verified token does not contain a valid staff binding");
  }

  const staffDirectory = await (
    dependencies.readStaffDirectory ?? readCanonicalStaffDirectory
  )();
  const matchingStaff = staffDirectory.filter(staff => {
    const staffBinding = normalizeEntraStaffBinding(
      staff.entraTenantId,
      staff.entraObjectId
    );

    return (
      staffBinding?.entraTenantId === binding.entraTenantId &&
      staffBinding.entraObjectId === binding.entraObjectId
    );
  });

  if (matchingStaff.length === 0) {
    throw new Error("No canonical staff identity matches the verified token");
  }

  if (matchingStaff.length !== 1) {
    throw new Error("Multiple canonical staff identities match the verified token");
  }

  const [staff] = matchingStaff;

  if (staff.status !== "active") {
    throw new Error("Matching canonical staff identity is not active");
  }

  return {
    staffId: staff.staffId,
    tenantId: binding.entraTenantId,
    objectId: binding.entraObjectId
  };
}
