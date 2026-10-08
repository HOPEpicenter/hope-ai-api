/**
 * OAuth credential storage contract v1.
 *
 * Contract only. No persistence, encryption implementation, live token
 * acquisition, HTTP endpoint, or authentication feature activation.
 *
 * Records must be stored in a dedicated, access-restricted namespace.
 * Credential identifiers are independent of canonical staff identifiers.
 */

export const OAUTH_CREDENTIAL_STORAGE_SCHEMA_VERSION = 1 as const;

export type OAuthCredentialStatus =
  | "active"
  | "revoked"
  | "expired";

export type OAuthCredentialEncryptionAlgorithm = "AES-256-GCM";

export interface OAuthCredentialOwnerV1 {
  tenantId: string;
  entraObjectId: string;
  canonicalStaffId: string;
  sessionBindingId: string;
}

export interface OAuthEncryptedCredentialEnvelopeV1 {
  algorithm: OAuthCredentialEncryptionAlgorithm;
  keyReference: string;
  keyVersion: string;
  nonce: string;
  ciphertext: string;
  authenticationTag: string;
}

export interface OAuthCredentialRecordV1 {
  schemaVersion: typeof OAUTH_CREDENTIAL_STORAGE_SCHEMA_VERSION;
  credentialId: string;
  owner: OAuthCredentialOwnerV1;
  status: OAuthCredentialStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  revision: number;
  encryptedCredential: OAuthEncryptedCredentialEnvelopeV1;
}

export type OAuthCredentialAuditActionV1 =
  | "created"
  | "rotated"
  | "revoked"
  | "expired";

export interface OAuthCredentialAuditV1 {
  schemaVersion: typeof OAUTH_CREDENTIAL_STORAGE_SCHEMA_VERSION;
  credentialId: string;
  action: OAuthCredentialAuditActionV1;
  revision: number;
  occurredAt: string;
  correlationId: string;
}

/**
 * A future repository must enforce expectedVersion as an Azure Table ETag.
 * A rotation must atomically replace the credential and write its safe audit.
 * Stale versions and mismatched owner bindings must fail closed.
 */
export interface OAuthCredentialMutationPreconditionV1 {
  credentialId: string;
  owner: OAuthCredentialOwnerV1;
  expectedVersion: string;
  expectedRevision: number;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_STATUSES = new Set<string>(["active", "revoked", "expired"]);

function isNonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isUuid(value: unknown): boolean {
  return isNonempty(value) && UUID_PATTERN.test(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value);
}

/**
 * Pure shape validation only. Does not prove token authenticity, session
 * ownership, encryption validity, or Azure Storage concurrency.
 *
 * Callers must separately authorize the authenticated actor and validate
 * every request against the trusted canonical session binding.
 */
function hasExactlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[]
): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length &&
    actual.every(key => keys.includes(key));
}

function isCanonicalUtcTimestamp(value: unknown): value is string {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString() === value;
}

/**
 * Structural validation only. Does not verify actual encryption,
 * session ownership, token authenticity or ETag concurrency.
 */
export function isOAuthCredentialMetadataV1(
  value: unknown
): value is OAuthCredentialRecordV1 {
  if (!isObject(value)) return false;

  if (!hasExactlyKeys(value, [
    "schemaVersion", "credentialId", "owner", "status",
    "createdAt", "updatedAt", "expiresAt", "revision",
    "encryptedCredential"
  ])) return false;

  if (!isObject(value.owner) ||
      !isObject(value.encryptedCredential)) return false;

  const owner = value.owner;
  const envelope = value.encryptedCredential;

  if (!hasExactlyKeys(owner, [
    "tenantId", "entraObjectId", "canonicalStaffId", "sessionBindingId"
  ])) return false;

  if (!hasExactlyKeys(envelope, [
    "algorithm", "keyReference", "keyVersion",
    "nonce", "ciphertext", "authenticationTag"
  ])) return false;

  if (value.schemaVersion !== OAUTH_CREDENTIAL_STORAGE_SCHEMA_VERSION ||
      !isUuid(value.credentialId) ||
      !isUuid(owner.tenantId) ||
      !isUuid(owner.entraObjectId) ||
      !isNonempty(owner.canonicalStaffId) ||
      !isUuid(owner.sessionBindingId) ||
      !VALID_STATUSES.has(String(value.status)) ||
      !isCanonicalUtcTimestamp(value.createdAt) ||
      !isCanonicalUtcTimestamp(value.updatedAt) ||
      !isCanonicalUtcTimestamp(value.expiresAt) ||
      !Number.isSafeInteger(value.revision) ||
      Number(value.revision) < 0) return false;

  const created = Date.parse(value.createdAt as string);
  const updated = Date.parse(value.updatedAt as string);
  const expires = Date.parse(value.expiresAt as string);

  if (created > updated || updated >= expires) return false;

  return envelope.algorithm === "AES-256-GCM" &&
    isNonempty(envelope.keyReference) &&
    isNonempty(envelope.keyVersion) &&
    isNonempty(envelope.nonce) &&
    isNonempty(envelope.ciphertext) &&
    isNonempty(envelope.authenticationTag);
}
const VALID_AUDIT_ACTIONS = new Set<string>([
  "created", "rotated", "revoked", "expired"
]);

function isOAuthCredentialOwnerV1(
  value: unknown
): value is OAuthCredentialOwnerV1 {
  if (!isObject(value)) return false;

  return hasExactlyKeys(value, [
    "tenantId", "entraObjectId", "canonicalStaffId", "sessionBindingId"
  ]) &&
    isUuid(value.tenantId) &&
    isUuid(value.entraObjectId) &&
    isNonempty(value.canonicalStaffId) &&
    isUuid(value.sessionBindingId);
}

/**
 * Validates the shape of a credential audit event.
 * The repository must generate trustworthy audit identity and ordering.
 * This function does not authorize an actor or prove an event occurred.
 */
export function isOAuthCredentialAuditV1(
  value: unknown
): value is OAuthCredentialAuditV1 {
  if (!isObject(value)) return false;

  return hasExactlyKeys(value, [
    "schemaVersion", "credentialId", "action",
    "revision", "occurredAt", "correlationId"
  ]) &&
    value.schemaVersion === OAUTH_CREDENTIAL_STORAGE_SCHEMA_VERSION &&
    isUuid(value.credentialId) &&
    typeof value.action === "string" &&
    VALID_AUDIT_ACTIONS.has(value.action) &&
    Number.isSafeInteger(value.revision) &&
    Number(value.revision) >= 0 &&
    isCanonicalUtcTimestamp(value.occurredAt) &&
    isUuid(value.correlationId);
}

/**
 * Validates caller-supplied precondition structure only.
 *
 * The repository must obtain the authoritative owner from trusted
 * authentication context, compare it with the stored record, and use
 * Azure Table Storage ETag conditional writes. Never treat a valid
 * precondition object as proof of authorization.
 */
export function isOAuthCredentialMutationPreconditionV1(
  value: unknown
): value is OAuthCredentialMutationPreconditionV1 {
  if (!isObject(value)) return false;

  if (!hasExactlyKeys(value, [
    "credentialId", "owner", "expectedVersion", "expectedRevision"
  ])) return false;

  return isUuid(value.credentialId) &&
    isOAuthCredentialOwnerV1(value.owner) &&
    isNonempty(value.expectedVersion) &&
    value.expectedVersion.length <= 256 &&
    value.expectedVersion === value.expectedVersion.trim() &&
    value.expectedVersion !== "*" &&
    !/[\r\n]/.test(value.expectedVersion) &&
    Number.isSafeInteger(value.expectedRevision) &&
    Number(value.expectedRevision) >= 0;
}
