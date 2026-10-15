import type { JWTVerifyGetKey } from "jose";
import {
  normalizeEntraStaffBinding,
  type CanonicalStaffIdentity
} from "../../domain/staff/projectStaffDirectory";
import { readCanonicalStaffDirectory } from "../staff/readCanonicalStaffDirectory";
import {
  verifyEntraStaffAccessToken,
  type EntraStaffTokenVerificationConfiguration
} from "./verifyEntraStaffAccessToken";

export type VerifiedPendingStaffIdentityEvidence = Readonly<{
  staffId: string;
  tenantId: string;
  objectId: string;
  canonicalStatus: "pending";
  advisoryOnly: true;
  authoritative: false;
  activationPermitted: false;
  executionPermitted: false;
  retryPermitted: false;
  productionRolloutPermitted: false;
}>;

export type ResolveVerifiedPendingStaffIdentityDependencies = {
  readStaffDirectory?: () => Promise<CanonicalStaffIdentity[]>;
  resolveSigningKey?: JWTVerifyGetKey;
};

/**
 * Resolves a verified access token to exactly one canonical pending
 * Staff identity. This is identity evidence only, not authorization.
 *
 * No registry fallback, StaffEvents append, activation, OAuth
 * execution, storage mutation, or retry is permitted here.
 */
export async function resolveVerifiedPendingStaffIdentity(
  accessToken: string,
  configuration: EntraStaffTokenVerificationConfiguration,
  dependencies: ResolveVerifiedPendingStaffIdentityDependencies = {}
): Promise<VerifiedPendingStaffIdentityEvidence> {
  const verified = await verifyEntraStaffAccessToken(
    accessToken,
    configuration,
    dependencies.resolveSigningKey
  );

  const binding = normalizeEntraStaffBinding(
    verified.tenantId,
    verified.objectId
  );

  if (!binding) {
    throw new Error("Verified token has an invalid Staff binding");
  }

  const directory = await (
    dependencies.readStaffDirectory ?? readCanonicalStaffDirectory
  )();

  const matches = directory.filter(staff => {
    const candidate = normalizeEntraStaffBinding(
      staff.entraTenantId,
      staff.entraObjectId
    );

    return candidate?.entraTenantId === binding.entraTenantId &&
      candidate.entraObjectId === binding.entraObjectId;
  });

  if (matches.length !== 1) {
    throw new Error(
      "Verified token must match exactly one canonical Staff identity"
    );
  }

  const staff = matches[0];

  if (staff.status !== "pending") {
    throw new Error(
      "Matching canonical Staff identity is not pending"
    );
  }

  return {
    staffId: staff.staffId,
    tenantId: binding.entraTenantId,
    objectId: binding.entraObjectId,
    canonicalStatus: "pending",
    advisoryOnly: true,
    authoritative: false,
    activationPermitted: false,
    executionPermitted: false,
    retryPermitted: false,
    productionRolloutPermitted: false
  };
}