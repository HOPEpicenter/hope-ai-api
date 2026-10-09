import { randomUUID } from "node:crypto";

import {
  isOAuthAuthoritativeSessionV1,
  type OAuthAuthoritativeSessionV1
} from "../../contracts/oauthAuthoritativeSession.v1";

import {
  normalizeEntraStaffBinding
} from "../../domain/staff/projectStaffDirectory";

import type {
  ResolvedEntraStaffIdentity
} from "./resolveVerifiedEntraStaffIdentity";

/**
 * Trusted infrastructure adapter.
 *
 * Must atomically create a record only when the binding ID does
 * not exist. It must return false for a collision and must not
 * overwrite another session.
 *
 * Callers must not supply a request-controlled implementation.
 */
export type OAuthSessionAtomicCreator = (
  record: OAuthAuthoritativeSessionV1
) => Promise<boolean>;

export interface OAuthSessionEstablishmentDependencies {
  createIfAbsent: OAuthSessionAtomicCreator;
  generateSessionBindingId?: () => string;
}

export interface OAuthSessionEstablishmentContext {
  identity: ResolvedEntraStaffIdentity;
  nowMilliseconds: number;
  lifetimeMilliseconds: number;
}

export type OAuthSessionEstablishmentResult =
  | {
      created: true;
      record: OAuthAuthoritativeSessionV1;
    }
  | {
      created: false;
      reason: "session_establishment_denied";
    };

const MAX_LIFETIME_MS = 60 * 60 * 1000;

function validStaffId(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    value === value.trim() &&
    !/[\r\n]/.test(value);
}

/**
 * Synthetic-only session-record establishment.
 *
 * identity must originate from the verified Entra resolver.
 * The clock and atomic creator must come from trusted backend
 * infrastructure. Neither this service nor the returned ID
 * authenticates a request or establishes possession of a session.
 *
 * Production session issuance requires a separate authenticated
 * entry point and an authoritative atomic repository.
 */
export async function establishOAuthTrustedSessionBinding(
  context: OAuthSessionEstablishmentContext,
  dependencies: OAuthSessionEstablishmentDependencies
): Promise<OAuthSessionEstablishmentResult> {
  const denied = {
    created: false as const,
    reason: "session_establishment_denied" as const
  };

  if (!context || typeof context !== "object" ||
      !dependencies || typeof dependencies !== "object" ||
      typeof dependencies.createIfAbsent !== "function") {
    return denied;
  }

  const identity = context.identity;

  const normalized = identity &&
    normalizeEntraStaffBinding(
      identity.tenantId,
      identity.objectId
    );

  if (!normalized ||
      normalized.entraTenantId !== identity.tenantId ||
      normalized.entraObjectId !== identity.objectId ||
      !validStaffId(identity.staffId) ||
      !Number.isSafeInteger(context.nowMilliseconds) ||
      context.nowMilliseconds < 0 ||
      !Number.isSafeInteger(context.lifetimeMilliseconds) ||
      context.lifetimeMilliseconds <= 0 ||
      context.lifetimeMilliseconds > MAX_LIFETIME_MS) {
    return denied;
  }

  const expiry = context.nowMilliseconds +
    context.lifetimeMilliseconds;

  if (!Number.isSafeInteger(expiry)) {
    return denied;
  }

  let bindingId: string;

  try {
    bindingId = (
      dependencies.generateSessionBindingId ?? randomUUID
    )();
  } catch {
    return denied;
  }

  const record: OAuthAuthoritativeSessionV1 = {
    schemaVersion: 1,
    sessionBindingId: bindingId,
    tenantId: normalized.entraTenantId,
    entraObjectId: normalized.entraObjectId,
    canonicalStaffId: identity.staffId,
    status: "active",
    createdAt: new Date(context.nowMilliseconds).toISOString(),
    expiresAt: new Date(expiry).toISOString(),
    revokedAt: null,
    revision: 0
  };

  if (!isOAuthAuthoritativeSessionV1(record)) {
    return denied;
  }

  try {
    const created = await dependencies.createIfAbsent(record);

    if (created !== true) {
      return denied;
    }
  } catch {
    return denied;
  }

  return { created: true, record };
}
