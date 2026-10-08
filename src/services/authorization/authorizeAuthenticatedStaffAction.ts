import {
  MINISTRY_AUTHORIZATION_ACTIONS
} from "../../contracts/ministryAuthorizationPolicy.v1";
import { normalizeEntraStaffBinding } from "../../domain/staff/projectStaffDirectory";
import { readCanonicalStaffIdentity } from "../staff/readCanonicalStaffDirectory";
import type { CanonicalStaffIdentity } from "../../domain/staff/projectStaffDirectory";
import {
  resolveVerifiedEntraStaffIdentity,
  type ResolveVerifiedEntraStaffIdentityDependencies
} from "./resolveVerifiedEntraStaffIdentity";
import type { EntraStaffTokenVerificationConfiguration } from "./verifyEntraStaffAccessToken";

const KNOWN_ACTIONS = new Set<string>(MINISTRY_AUTHORIZATION_ACTIONS);
const SUPPORTED_ACTIONS = new Set<string>(["system.admin"]);

export type AuthenticatedStaffAuthorizationConfiguration = {
  administratorStaffIds?: readonly string[];
};

export type AuthorizeAuthenticatedStaffActionDependencies = Pick<
  ResolveVerifiedEntraStaffIdentityDependencies,
  "readStaffDirectory" | "resolveSigningKey"
> & {
  readCanonicalStaffIdentity?: (
    staffId: string
  ) => Promise<CanonicalStaffIdentity | null>;
};

export type AuthenticatedStaffActionDecision =
  | {
      allowed: true;
      authenticatedStaffId: string;
      action: "system.admin";
    }
  | {
      allowed: false;
      reason:
        | "unsupported_action"
        | "authentication_failed"
        | "actor_mismatch"
        | "staff_identity_unavailable"
        | "staff_binding_mismatch"
        | "administrator_configuration_missing"
        | "insufficient_authority";
    };

function configuredAdministratorIds(
  ids: readonly string[] | undefined
): Set<string> {
  if (!Array.isArray(ids)) {
    return new Set();
  }

  return new Set(
    ids
      .filter((staffId): staffId is string => typeof staffId === "string")
      .map(staffId => staffId.trim())
      .filter(Boolean)
  );
}

/**
 * Authenticates an Entra token, resolves its canonical staff binding, then
 * authorizes only the narrow system.admin action. Verification and directory
 * configuration must come from trusted server settings; dependencies are
 * trusted infrastructure hooks for tests, never request-derived inputs.
 *
 * Entra roles/scopes and canonical display labels do not grant HOPE
 * administrator, pastoral, or ministry-area permissions. HOPE administrator
 * membership comes only from configured canonical staff IDs.
 */
export async function authorizeAuthenticatedStaffAction(
  accessToken: string,
  verificationConfiguration: EntraStaffTokenVerificationConfiguration,
  action: unknown,
  authorizationConfiguration: AuthenticatedStaffAuthorizationConfiguration = {},
  claimedActorId?: unknown,
  dependencies: AuthorizeAuthenticatedStaffActionDependencies = {}
): Promise<AuthenticatedStaffActionDecision> {
  if (
    typeof action !== "string" ||
    !KNOWN_ACTIONS.has(action) ||
    !SUPPORTED_ACTIONS.has(action)
  ) {
    return { allowed: false, reason: "unsupported_action" };
  }

  let resolvedIdentity;
  try {
    resolvedIdentity = await resolveVerifiedEntraStaffIdentity(
      accessToken,
      verificationConfiguration,
      {
        readStaffDirectory: dependencies.readStaffDirectory,
        resolveSigningKey: dependencies.resolveSigningKey
      }
    );
  } catch {
    return { allowed: false, reason: "authentication_failed" };
  }

  if (
    claimedActorId !== undefined &&
    claimedActorId !== resolvedIdentity.staffId
  ) {
    return { allowed: false, reason: "actor_mismatch" };
  }

  let canonicalStaff;
  try {
    canonicalStaff = await (
      dependencies.readCanonicalStaffIdentity ??
      readCanonicalStaffIdentity
    )(resolvedIdentity.staffId);
  } catch {
    return {
      allowed: false,
      reason: "staff_identity_unavailable"
    };
  }

  if (
    !canonicalStaff ||
    canonicalStaff.staffId !== resolvedIdentity.staffId ||
    canonicalStaff.status !== "active"
  ) {
    return {
      allowed: false,
      reason: "staff_identity_unavailable"
    };
  }

  const currentBinding = normalizeEntraStaffBinding(
    canonicalStaff.entraTenantId,
    canonicalStaff.entraObjectId
  );

  if (
    !currentBinding ||
    currentBinding.entraTenantId !== resolvedIdentity.tenantId ||
    currentBinding.entraObjectId !== resolvedIdentity.objectId
  ) {
    return {
      allowed: false,
      reason: "staff_binding_mismatch"
    };
  }

  const administratorIds = configuredAdministratorIds(
    authorizationConfiguration?.administratorStaffIds
  );

  if (administratorIds.size === 0) {
    return {
      allowed: false,
      reason: "administrator_configuration_missing"
    };
  }

  if (!administratorIds.has(resolvedIdentity.staffId)) {
    return {
      allowed: false,
      reason: "insufficient_authority"
    };
  }

  return {
    allowed: true,
    authenticatedStaffId: resolvedIdentity.staffId,
    action: "system.admin"
  };
}
