/**
 * OAuth session-possession and single-use operation challenge
 * metadata contracts, version 1.
 *
 * These are record schemas only, NOT proof of possession,
 * cryptographic verification, authorization, or replay protection.
 *
 * Credential secrets and plaintext challenge responses must never
 * be placed into either record.
 */
export const OAUTH_SESSION_POSSESSION_SCHEMA_VERSION = 1 as const;

export type OAuthPossessionStatusV1 =
  | "active"
  | "revoked"
  | "expired";

export type OAuthSensitiveOperationV1 =
  | "credential_read"
  | "credential_rotate"
  | "credential_revoke";

export interface OAuthSessionPossessionVerifierV1 {
  schemaVersion: 1;
  sessionBindingId: string;
  credentialVerifierDigest: string;
  status: OAuthPossessionStatusV1;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revision: number;
}

export interface OAuthOperationReplayChallengeV1 {
  schemaVersion: 1;
  challengeId: string;
  sessionBindingId: string;
  operation: OAuthSensitiveOperationV1;
  challengeDigest: string;
  issuedAt: string;
  expiresAt: string;
  consumedAt: string | null;
  revision: number;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const SHA256_HEX = /^[0-9a-f]{64}$/;

const UTC_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function isObject(
  value: unknown
): value is Record<string, unknown> {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[]
): boolean {
  const actual = Object.keys(value);

  return actual.length === expected.length &&
    expected.every(key =>
      Object.prototype.hasOwnProperty.call(value, key)
    );
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function isDigest(value: unknown): value is string {
  return typeof value === "string" && SHA256_HEX.test(value);
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !UTC_TIMESTAMP.test(value)) {
    return false;
  }

  const milliseconds = Date.parse(value);

  return Number.isFinite(milliseconds) &&
    new Date(milliseconds).toISOString() === value;
}

function isRevision(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0;
}

export function isOAuthSessionPossessionVerifierV1(
  value: unknown
): value is OAuthSessionPossessionVerifierV1 {
  if (!isObject(value)) return false;

  if (!hasExactKeys(value, [
    "schemaVersion",
    "sessionBindingId",
    "credentialVerifierDigest",
    "status",
    "createdAt",
    "expiresAt",
    "revokedAt",
    "revision"
  ])) {
    return false;
  }

  if (
    value.schemaVersion !== OAUTH_SESSION_POSSESSION_SCHEMA_VERSION ||
    !isUuid(value.sessionBindingId) ||
    !isDigest(value.credentialVerifierDigest) ||
    !isRevision(value.revision) ||
    !isTimestamp(value.createdAt) ||
    !isTimestamp(value.expiresAt) ||
    Date.parse(value.createdAt) >= Date.parse(value.expiresAt)
  ) {
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

export function isOAuthOperationReplayChallengeV1(
  value: unknown
): value is OAuthOperationReplayChallengeV1 {
  if (!isObject(value)) return false;

  if (!hasExactKeys(value, [
    "schemaVersion",
    "challengeId",
    "sessionBindingId",
    "operation",
    "challengeDigest",
    "issuedAt",
    "expiresAt",
    "consumedAt",
    "revision"
  ])) {
    return false;
  }

  if (
    value.schemaVersion !== OAUTH_SESSION_POSSESSION_SCHEMA_VERSION ||
    !isUuid(value.challengeId) ||
    !isUuid(value.sessionBindingId) ||
    !isDigest(value.challengeDigest) ||
    !isRevision(value.revision) ||
    !isTimestamp(value.issuedAt) ||
    !isTimestamp(value.expiresAt) ||
    Date.parse(value.issuedAt) >= Date.parse(value.expiresAt)
  ) {
    return false;
  }

  if (
    value.operation !== "credential_read" &&
    value.operation !== "credential_rotate" &&
    value.operation !== "credential_revoke"
  ) {
    return false;
  }

  return value.consumedAt === null ||
    (
      isTimestamp(value.consumedAt) &&
      Date.parse(value.consumedAt) >= Date.parse(value.issuedAt)
    );
}

/**
 * Time predicates are snapshot checks only.
 *
 * They do NOT prove cryptographic possession or prevent
 * concurrent consumption, expiry, or revocation.
 */
export function isOAuthPossessionVerifierActiveV1(
  value: unknown,
  nowMilliseconds: number
): value is OAuthSessionPossessionVerifierV1 {
  return isOAuthSessionPossessionVerifierV1(value) &&
    Number.isSafeInteger(nowMilliseconds) &&
    nowMilliseconds >= 0 &&
    value.status === "active" &&
    Date.parse(value.createdAt) <= nowMilliseconds &&
    nowMilliseconds < Date.parse(value.expiresAt);
}

export function isOAuthReplayChallengeAvailableV1(
  value: unknown,
  nowMilliseconds: number
): value is OAuthOperationReplayChallengeV1 {
  return isOAuthOperationReplayChallengeV1(value) &&
    Number.isSafeInteger(nowMilliseconds) &&
    nowMilliseconds >= 0 &&
    value.consumedAt === null &&
    Date.parse(value.issuedAt) <= nowMilliseconds &&
    nowMilliseconds < Date.parse(value.expiresAt);
}
