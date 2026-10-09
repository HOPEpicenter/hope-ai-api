import {
  createCipheriv,
  createDecipheriv,
  randomBytes
} from "node:crypto";

import {
  buildOAuthEncryptedAadV1,
  OAuthEncryptedAadBindingV1
} from "../../contracts/oauthEncryptedEnvelope.v2";

/**
 * Internal, in-memory AES-256-GCM payload.
 *
 * This is NOT a persistable OAuthEncryptedEnvelopeV2.
 * A separate, trusted key-wrapping component is required first.
 */
export interface OAuthLocalEncryptedPayload {
  nonce: string;
  ciphertext: string;
  authenticationTag: string;
}

const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const MAX_PLAINTEXT_BYTES = 1024 * 1024;

const ENCODING = /^[A-Za-z0-9_-]+$/;

function assertKey(key: Buffer): void {
  if (!Buffer.isBuffer(key) || key.length !== KEY_BYTES) {
    throw new Error("Invalid OAuth encryption key");
  }
}

function decodeCanonical(
  encoded: unknown,
  expectedLength?: number
): Buffer {
  if (
    typeof encoded !== "string" ||
    encoded.length === 0 ||
    encoded.length % 4 === 1 ||
    !ENCODING.test(encoded)
  ) {
    throw new Error("Invalid OAuth encrypted payload");
  }

  const decoded = Buffer.from(encoded, "base64url");

  if (
    decoded.toString("base64url") !== encoded ||
    (expectedLength !== undefined &&
      decoded.length !== expectedLength)
  ) {
    throw new Error("Invalid OAuth encrypted payload");
  }

  return decoded;
}

function validatePayload(
  value: unknown
): asserts value is OAuthLocalEncryptedPayload {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error("Invalid OAuth encrypted payload");
  }

  const record = value as Record<string, unknown>;
  const fields = Object.keys(record);

  if (
    fields.length !== 3 ||
    !fields.every((field) =>
      ["nonce", "ciphertext", "authenticationTag"].includes(field)
    )
  ) {
    throw new Error("Invalid OAuth encrypted payload");
  }

  decodeCanonical(record.nonce, NONCE_BYTES);
  decodeCanonical(record.authenticationTag, TAG_BYTES);

  const encrypted = decodeCanonical(record.ciphertext);

  if (
    encrypted.length === 0 ||
    encrypted.length > MAX_PLAINTEXT_BYTES
  ) {
    throw new Error("Invalid OAuth encrypted payload");
  }
}

/**
 * Encrypts a synthetic/test credential with a caller-owned 256-bit key.
 * The caller must obtain the AAD binding from trusted identity context.
 */
export function encryptOAuthLocalPayload(
  key: Buffer,
  plaintext: Buffer,
  binding: OAuthEncryptedAadBindingV1
): OAuthLocalEncryptedPayload {
  assertKey(key);

  if (
    !Buffer.isBuffer(plaintext) ||
    plaintext.length === 0 ||
    plaintext.length > MAX_PLAINTEXT_BYTES
  ) {
    throw new Error("Invalid OAuth plaintext");
  }

  const aad = buildOAuthEncryptedAadV1(binding);
  const nonce = randomBytes(NONCE_BYTES);

  const cipher = createCipheriv("aes-256-gcm", key, nonce, {
    authTagLength: TAG_BYTES
  });

  cipher.setAAD(aad);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext),
    cipher.final()
  ]);

  return {
    nonce: nonce.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    authenticationTag: cipher.getAuthTag().toString("base64url")
  };
}

/**
 * Decrypts only after validating the encoded payload and canonical AAD.
 * Authentication failures intentionally return a generic error.
 */
export function decryptOAuthLocalPayload(
  key: Buffer,
  payload: OAuthLocalEncryptedPayload,
  binding: OAuthEncryptedAadBindingV1
): Buffer {
  assertKey(key);
  validatePayload(payload);

  const aad = buildOAuthEncryptedAadV1(binding);

  const nonce = decodeCanonical(payload.nonce, NONCE_BYTES);
  const tag = decodeCanonical(payload.authenticationTag, TAG_BYTES);
  const ciphertext = decodeCanonical(payload.ciphertext);

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, nonce, {
      authTagLength: TAG_BYTES
    });

    decipher.setAAD(aad);
    decipher.setAuthTag(tag);

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]);
  } catch {
    throw new Error("OAuth credential authentication failed");
  }
}
