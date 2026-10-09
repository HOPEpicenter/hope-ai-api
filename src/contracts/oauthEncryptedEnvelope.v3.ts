import {
  OAuthEncryptedAadBindingV1,
  isOAuthEncryptedAadBindingV1
} from "./oauthEncryptedEnvelope.v2";

export const OAUTH_ENVELOPE_V3_VERSION = 3 as const;
export const OAUTH_ENVELOPE_V3_AAD_VERSION = 2 as const;

export interface OAuthEnvelopeMetadataV3 {
  algorithm: "AES-256-GCM";
  wrappingAlgorithm: "RSA-OAEP-256";
  keyReference: string;
  wrappedDataKey: string;
}

export interface OAuthEncryptedEnvelopeV3
  extends OAuthEnvelopeMetadataV3 {
  schemaVersion: typeof OAUTH_ENVELOPE_V3_VERSION;
  aadVersion: typeof OAUTH_ENVELOPE_V3_AAD_VERSION;
  nonce: string;
  ciphertext: string;
  authenticationTag: string;
}

const envelopeKeys = [
  "schemaVersion",
  "aadVersion",
  "algorithm",
  "wrappingAlgorithm",
  "keyReference",
  "wrappedDataKey",
  "nonce",
  "ciphertext",
  "authenticationTag"
] as const;

const metadataKeys = [
  "algorithm",
  "wrappingAlgorithm",
  "keyReference",
  "wrappedDataKey"
] as const;

const keyReferencePattern =
  /^https:\/\/[a-z0-9-]+\.vault\.azure\.net\/keys\/[a-z0-9-]+\/[0-9a-f]{32}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value);
}

function exactKeys(
  record: Record<string, unknown>,
  expected: readonly string[]
): boolean {
  const actual = Object.keys(record);
  return actual.length === expected.length &&
    actual.every((key) => expected.includes(key));
}

function decodeCanonical(value: unknown): Buffer | null {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9_-]+$/.test(value) ||
    value.length % 4 === 1
  ) {
    return null;
  }

  const decoded = Buffer.from(value, "base64url");

  return decoded.toString("base64url") === value
    ? decoded
    : null;
}

function validMetadataFields(
  record: Record<string, unknown>
): boolean {
  if (
    record.algorithm !== "AES-256-GCM" ||
    record.wrappingAlgorithm !== "RSA-OAEP-256" ||
    typeof record.keyReference !== "string" ||
    !keyReferencePattern.test(record.keyReference)
  ) {
    return false;
  }

  const wrapped = decodeCanonical(record.wrappedDataKey);

  return wrapped !== null &&
    wrapped.length >= 128 &&
    wrapped.length <= 1024;
}

export function isOAuthEnvelopeMetadataV3(
  value: unknown
): value is OAuthEnvelopeMetadataV3 {
  return isRecord(value) &&
    exactKeys(value, metadataKeys) &&
    validMetadataFields(value);
}

export function isOAuthEncryptedEnvelopeV3(
  value: unknown
): value is OAuthEncryptedEnvelopeV3 {
  if (
    !isRecord(value) ||
    !exactKeys(value, envelopeKeys) ||
    value.schemaVersion !== OAUTH_ENVELOPE_V3_VERSION ||
    value.aadVersion !== OAUTH_ENVELOPE_V3_AAD_VERSION ||
    !validMetadataFields(value)
  ) {
    return false;
  }

  const nonce = decodeCanonical(value.nonce);
  const tag = decodeCanonical(value.authenticationTag);
  const ciphertext = decodeCanonical(value.ciphertext);

  return nonce !== null &&
    nonce.length === 12 &&
    tag !== null &&
    tag.length === 16 &&
    ciphertext !== null &&
    ciphertext.length > 0 &&
    ciphertext.length <= 1024 * 1024;
}

/**
 * Domain-separated, canonical AAD for a future v3 AES-GCM adapter.
 *
 * The caller must provide trusted, verified identity binding.
 * The exact wrapped data key and versioned key reference are bound
 * to the ciphertext authentication tag via AES-GCM AAD.
 *
 * No caller-provided arbitrary AAD override is supported.
 */
export function buildOAuthEncryptedAadV2(
  binding: OAuthEncryptedAadBindingV1,
  metadata: OAuthEnvelopeMetadataV3
): Buffer {
  if (
    !isOAuthEncryptedAadBindingV1(binding) ||
    !isOAuthEnvelopeMetadataV3(metadata)
  ) {
    throw new Error("Invalid OAuth v3 authenticated metadata");
  }

  return Buffer.from(JSON.stringify([
    "hope-oauth-credential-aad",
    OAUTH_ENVELOPE_V3_AAD_VERSION,
    OAUTH_ENVELOPE_V3_VERSION,
    binding.credentialId,
    binding.tenantId,
    binding.entraObjectId,
    binding.canonicalStaffId,
    binding.sessionBindingId,
    metadata.algorithm,
    metadata.wrappingAlgorithm,
    metadata.keyReference,
    metadata.wrappedDataKey
  ]), "utf8");
}
