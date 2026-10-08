/**
 * OAuth encrypted credential envelope v2.
 *
 * Contract only: this module does not encrypt, decrypt, persist,
 * authorize access to, or refresh credentials.
 *
 * The deployed v1 contract remains unchanged.
 */

export const OAUTH_ENCRYPTED_ENVELOPE_SCHEMA_VERSION = 2 as const;
export const OAUTH_ENCRYPTED_AAD_VERSION = 1 as const;

export interface OAuthEncryptedEnvelopeV2 {
  schemaVersion: typeof OAUTH_ENCRYPTED_ENVELOPE_SCHEMA_VERSION;
  algorithm: "AES-256-GCM";
  wrappingAlgorithm: "RSA-OAEP-256";
  keyReference: string;
  wrappedDataKey: string;
  nonce: string;
  ciphertext: string;
  authenticationTag: string;
  aadVersion: typeof OAUTH_ENCRYPTED_AAD_VERSION;
}

export interface OAuthEncryptedAadBindingV1 {
  credentialId: string;
  tenantId: string;
  entraObjectId: string;
  canonicalStaffId: string;
  sessionBindingId: string;
}

const envelopeKeys = [
  "schemaVersion",
  "algorithm",
  "wrappingAlgorithm",
  "keyReference",
  "wrappedDataKey",
  "nonce",
  "ciphertext",
  "authenticationTag",
  "aadVersion"
] as const;

const bindingKeys = [
  "credentialId",
  "tenantId",
  "entraObjectId",
  "canonicalStaffId",
  "sessionBindingId"
] as const;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const keyReferencePattern =
  /^https:\/\/[a-z0-9-]+\.vault\.azure\.net\/keys\/[a-z0-9-]+\/[0-9a-f]{32}$/;

const base64urlPattern = /^[A-Za-z0-9_-]+$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[]
): boolean {
  const actual = Object.keys(value);
  return (
    actual.length === keys.length &&
    actual.every((key) => keys.includes(key))
  );
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

/**
 * Validates canonical, unpadded base64url at the contract boundary.
 *
 * A decoding/canonicalization check is necessary because syntactically
 * plausible base64url strings may contain invalid trailing pad bits.
 */
function decodeCanonicalBase64url(value: unknown): Buffer | null {
  if (
    typeof value !== "string" ||
    !base64urlPattern.test(value) ||
    value.length % 4 === 1
  ) {
    return null;
  }

  const bytes = Buffer.from(value, "base64url");

  if (bytes.toString("base64url") !== value) {
    return null;
  }

  return bytes;
}

export function isOAuthEncryptedEnvelopeV2(
  value: unknown
): value is OAuthEncryptedEnvelopeV2 {
  if (!isObject(value) || !hasExactKeys(value, envelopeKeys)) {
    return false;
  }

  if (
    value.schemaVersion !== OAUTH_ENCRYPTED_ENVELOPE_SCHEMA_VERSION ||
    value.algorithm !== "AES-256-GCM" ||
    value.wrappingAlgorithm !== "RSA-OAEP-256" ||
    value.aadVersion !== OAUTH_ENCRYPTED_AAD_VERSION ||
    typeof value.keyReference !== "string" ||
    !keyReferencePattern.test(value.keyReference)
  ) {
    return false;
  }

  const wrappedKey = decodeCanonicalBase64url(value.wrappedDataKey);
  const nonce = decodeCanonicalBase64url(value.nonce);
  const ciphertext = decodeCanonicalBase64url(value.ciphertext);
  const tag = decodeCanonicalBase64url(value.authenticationTag);

  return (
    wrappedKey !== null &&
    wrappedKey.length >= 128 &&
    wrappedKey.length <= 1024 &&
    nonce !== null &&
    nonce.length === 12 &&
    ciphertext !== null &&
    ciphertext.length > 0 &&
    tag !== null &&
    tag.length === 16
  );
}

export function isOAuthEncryptedAadBindingV1(
  value: unknown
): value is OAuthEncryptedAadBindingV1 {
  if (!isObject(value) || !hasExactKeys(value, bindingKeys)) {
    return false;
  }

  return bindingKeys.every((key) => isUuid(value[key]));
}

/**
 * Canonical AAD format:
 *
 * UTF-8 bytes of a JSON array in the fixed sequence:
 * [
 *   "hope-oauth-credential-aad",
 *   1,
 *   2,
 *   credentialId,
 *   tenantId,
 *   entraObjectId,
 *   canonicalStaffId,
 *   sessionBindingId
 * ]
 *
 * All identifiers must already be canonical lowercase UUIDs.
 * This function must be used identically by future encryption and
 * decryption adapters. Never accept a caller-supplied AAD override.
 */
export function buildOAuthEncryptedAadV1(
  binding: OAuthEncryptedAadBindingV1
): Buffer {
  if (!isOAuthEncryptedAadBindingV1(binding)) {
    throw new Error("Invalid OAuth credential AAD binding");
  }

  return Buffer.from(
    JSON.stringify([
      "hope-oauth-credential-aad",
      OAUTH_ENCRYPTED_AAD_VERSION,
      OAUTH_ENCRYPTED_ENVELOPE_SCHEMA_VERSION,
      binding.credentialId,
      binding.tenantId,
      binding.entraObjectId,
      binding.canonicalStaffId,
      binding.sessionBindingId
    ]),
    "utf8"
  );
}
