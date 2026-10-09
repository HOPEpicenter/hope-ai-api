import type {
  OAuthCredentialOwnerV1
} from "../../contracts/oauthCredentialStorage.v1";

import type {
  ResolvedEntraStaffIdentity
} from "./resolveVerifiedEntraStaffIdentity";

/**
 * Internal policy input only.
 *
 * The identity MUST be the result of verified Entra access-token
 * resolution, not an untrusted request body.
 *
 * The session MUST be read from an authoritative server-side
 * session store. This function does not verify sessions.
 */
export interface OAuthTrustedSessionEvidence {
  status: "active" | "revoked" | "expired";
  tenantId: string;
  entraObjectId: string;
  canonicalStaffId: string;
  sessionBindingId: string;
}

export interface OAuthCredentialOwnershipInput {
  identity: ResolvedEntraStaffIdentity;
  session: OAuthTrustedSessionEvidence;
  storedOwner: OAuthCredentialOwnerV1;
  staffStatus: "active" | "inactive";
  credentialStatus: "active" | "revoked" | "expired";
}

export type OAuthCredentialOwnershipDecision =
  | { allowed: true }
  | { allowed: false; reason: "credential_access_denied" };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function validUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function validStaffId(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    value.trim() === value &&
    !/[\r\n]/.test(value);
}

/**
 * Pure fail-closed comparison of already trusted evidence.
 *
 * WARNING: This does not authenticate tokens, resolve canonical
 * staff, verify sessions, or grant access by itself. Never expose
 * it directly to client-controlled inputs.
 */
export function evaluateOAuthCredentialOwnership(
  input: OAuthCredentialOwnershipInput
): OAuthCredentialOwnershipDecision {
  const denied = {
    allowed: false as const,
    reason: "credential_access_denied" as const
  };

  if (!input || typeof input !== "object") {
    return denied;
  }

  const { identity, session, storedOwner, staffStatus,
    credentialStatus } = input;

  if (!identity || !session || !storedOwner ||
      staffStatus !== "active" ||
      credentialStatus !== "active" ||
      session.status !== "active") {
    return denied;
  }

  if (
    !validUuid(identity.tenantId) ||
    !validUuid(identity.objectId) ||
    !validStaffId(identity.staffId) ||
    !validUuid(session.tenantId) ||
    !validUuid(session.entraObjectId) ||
    !validUuid(session.sessionBindingId) ||
    !validStaffId(session.canonicalStaffId) ||
    !validUuid(storedOwner.tenantId) ||
    !validUuid(storedOwner.entraObjectId) ||
    !validUuid(storedOwner.sessionBindingId) ||
    !validStaffId(storedOwner.canonicalStaffId)
  ) {
    return denied;
  }

  if (
    identity.tenantId !== session.tenantId ||
    identity.objectId !== session.entraObjectId ||
    identity.staffId !== session.canonicalStaffId ||
    identity.tenantId !== storedOwner.tenantId ||
    identity.objectId !== storedOwner.entraObjectId ||
    identity.staffId !== storedOwner.canonicalStaffId ||
    session.sessionBindingId !== storedOwner.sessionBindingId
  ) {
    return denied;
  }

  return { allowed: true };
}
