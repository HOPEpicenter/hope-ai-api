/**
 * OAuth authoritative session evidence contract v1.
 *
 * CONTRACT ONLY:
 * - Not an authentication token.
 * - Not proof of a live session.
 * - No session creation, storage, lookup, or mutation.
 * - No credential authorization or encryption integration.
 *
 * A future trusted repository must produce this record from
 * server-controlled state. Client-submitted records or IDs
 * are never authoritative session evidence.
 */

export const OAUTH_SESSION_EVIDENCE_SCHEMA_VERSION = 1 as const;

export type OAuthSessionStatusV1 =
  | "active"
  | "revoked"
  | "expired";

export interface OAuthAuthoritativeSessionV1 {
  schemaVersion: typeof OAUTH_SESSION_EVIDENCE_SCHEMA_VERSION;
  sessionBindingId: string;
  tenantId: string;
  entraObjectId: string;
  canonicalStaffId: string;
  status: OAuthSessionStatusV1;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revision: number;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const KEYS = [
  "schemaVersion",
  "sessionBindingId",
  "tenantId",
  "entraObjectId",
  "canonicalStaffId",
  "status",
  "createdAt",
  "expiresAt",
  "revokedAt",
  "revision"
] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function isStaffId(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    value === value.trim() &&
    !/[\r\n]/.test(value);
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }

  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) &&
    new Date(milliseconds).toISOString() === value;
}

/**
 * Validates shape and internally consistent timestamps only.
 *
 * A valid record is NOT authenticated evidence unless it was
 * obtained from a trusted, authoritative session repository.
 */
export function isOAuthAuthoritativeSessionV1(
  value: unknown
): value is OAuthAuthoritativeSessionV1 {
  if (!isObject(value)) return false;

  const keys = Object.keys(value);

  if (
    keys.length !== KEYS.length ||
    keys.some(key => !KEYS.includes(key as typeof KEYS[number]))
  ) {
    return false;
  }

  if (
    value.schemaVersion !== OAUTH_SESSION_EVIDENCE_SCHEMA_VERSION ||
    !isUuid(value.sessionBindingId) ||
    !isUuid(value.tenantId) ||
    !isUuid(value.entraObjectId) ||
    !isStaffId(value.canonicalStaffId) ||
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) < 0 ||
    !isTimestamp(value.createdAt) ||
    !isTimestamp(value.expiresAt)
  ) {
    return false;
  }

  if (Date.parse(value.createdAt) >= Date.parse(value.expiresAt)) {
    return false;
  }

  if (
    value.status !== "active" &&
    value.status !== "revoked" &&
    value.status !== "expired"
  ) {
    return false;
  }

  if (value.status === "revoked") {
    return isTimestamp(value.revokedAt) &&
      Date.parse(value.revokedAt) >= Date.parse(value.createdAt);
  }

  return value.revokedAt === null;
}

/**
 * Evaluates a validated, trusted session snapshot at an explicit
 * backend-supplied time. Never use a client-supplied clock.
 *
 * It cannot prove that revocation has not occurred since
 * the authoritative snapshot was read.
 */
export function isOAuthSessionCurrentlyActiveV1(
  value: unknown,
  nowMilliseconds: number
): value is OAuthAuthoritativeSessionV1 {
  if (
    !isOAuthAuthoritativeSessionV1(value) ||
    !Number.isSafeInteger(nowMilliseconds) ||
    nowMilliseconds < 0 ||
    value.status !== "active"
  ) {
    return false;
  }

  return Date.parse(value.createdAt) <= nowMilliseconds &&
    nowMilliseconds < Date.parse(value.expiresAt);
}
