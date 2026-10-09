import {
  isOAuthAuthoritativeSessionV1,
  isOAuthSessionCurrentlyActiveV1,
  type OAuthAuthoritativeSessionV1
} from "../../contracts/oauthAuthoritativeSession.v1";

import type {
  ResolvedEntraStaffIdentity
} from "./resolveVerifiedEntraStaffIdentity";

/**
 * A trusted infrastructure adapter must perform an authoritative,
 * uncached read and return ALL records with this binding.
 *
 * The caller must NOT supply a browser-controlled implementation.
 * Duplicate records must remain visible to this resolver.
 */
export type OAuthSessionEvidenceReader = (
  sessionBindingId: string
) => Promise<readonly unknown[]>;

/**
 * Every field below must be established by trusted backend code.
 *
 * identity: output of verified Entra-to-canonical-staff resolution.
 * sessionBindingId: established by a separate authenticated
 * session boundary, NOT copied from request body or URL.
 *
 * minimumRevision: trusted lower bound when a revision is known.
 * It does not establish freshness or prevent later revocation.
 */
export interface OAuthSessionResolutionContext {
  identity: ResolvedEntraStaffIdentity;
  sessionBindingId: string;
  minimumRevision?: number;
}

export type OAuthSessionResolutionDecision =
  | {
      allowed: true;
      evidence: OAuthAuthoritativeSessionV1;
    }
  | {
      allowed: false;
      reason: "session_evidence_denied";
    };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function validUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function validStaffId(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    value === value.trim() &&
    !/[\r\n]/.test(value);
}

function validContext(
  context: OAuthSessionResolutionContext
): boolean {
  if (!context || typeof context !== "object") return false;

  const identity = context.identity;

  return !!identity &&
    validUuid(identity.tenantId) &&
    validUuid(identity.objectId) &&
    validStaffId(identity.staffId) &&
    validUuid(context.sessionBindingId) &&
    (
      context.minimumRevision === undefined ||
      (
        Number.isSafeInteger(context.minimumRevision) &&
        context.minimumRevision >= 0
      )
    );
}

/**
 * Resolves an authoritative session snapshot.
 *
 * This is NOT a complete authentication or credential-access entry
 * point. Trust in the verified identity, session binding, reader,
 * and clock must be established outside this primitive.
 *
 * A future operation must recheck session state at its
 * authorization/commit boundary to address concurrent revocation.
 */
export async function resolveOAuthSessionEvidence(
  reader: OAuthSessionEvidenceReader,
  context: OAuthSessionResolutionContext,
  nowMilliseconds: number
): Promise<OAuthSessionResolutionDecision> {
  const denied = {
    allowed: false as const,
    reason: "session_evidence_denied" as const
  };

  if (
    typeof reader !== "function" ||
    !validContext(context) ||
    !Number.isSafeInteger(nowMilliseconds) ||
    nowMilliseconds < 0
  ) {
    return denied;
  }

  try {
    const records = await reader(context.sessionBindingId);

    if (!Array.isArray(records) || records.length !== 1) {
      return denied;
    }

    const record: unknown = records[0];

    if (
      !isOAuthAuthoritativeSessionV1(record) ||
      !isOAuthSessionCurrentlyActiveV1(record, nowMilliseconds)
    ) {
      return denied;
    }

    if (
      record.sessionBindingId !== context.sessionBindingId ||
      record.tenantId !== context.identity.tenantId ||
      record.entraObjectId !== context.identity.objectId ||
      record.canonicalStaffId !== context.identity.staffId ||
      (
        context.minimumRevision !== undefined &&
        record.revision < context.minimumRevision
      )
    ) {
      return denied;
    }

    return {
      allowed: true,
      evidence: { ...record }
    };
  } catch {
    // Repository errors must never enable access.
    return denied;
  }
}
