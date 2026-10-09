import {
  createCipheriv,
  createDecipheriv,
  randomBytes
} from "node:crypto";

import {
  OAuthEncryptedAadBindingV1
} from "../../contracts/oauthEncryptedEnvelope.v2";

import {
  OAuthEncryptedEnvelopeV3,
  buildOAuthEncryptedAadV2,
  isOAuthEncryptedEnvelopeV3
} from "../../contracts/oauthEncryptedEnvelope.v3";

import {
  OAuthKeyWrapClient,
  OAuthKeyWrapPolicy,
  unwrapOAuthDataKey,
  wrapOAuthDataKey
} from "./oauthKeyVaultWrapping";

const MAX_BYTES = 1024 * 1024;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

function decode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

/**
 * Synthetic-only envelope v3 encryption.
 *
 * The approved key policy and identity binding must originate from
 * trusted backend authorization and configuration boundaries.
 *
 * The wrapped key is created BEFORE AES encryption so its exact
 * bytes and key reference can be included in authenticated AAD.
 *
 * No storage, HTTP routes, Azure SDK, or live credential handling.
 */
export async function encryptOAuthCredentialEnvelopeV3(
  client: OAuthKeyWrapClient,
  policy: OAuthKeyWrapPolicy,
  plaintext: Buffer,
  binding: OAuthEncryptedAadBindingV1
): Promise<OAuthEncryptedEnvelopeV3> {
  if (
    !Buffer.isBuffer(plaintext) ||
    plaintext.length === 0 ||
    plaintext.length > MAX_BYTES
  ) {
    throw new Error("Invalid OAuth v3 plaintext");
  }

  const dataKey = randomBytes(32);

  try {
    const wrapped = await wrapOAuthDataKey(client, policy, dataKey);

    const metadata = {
      algorithm: "AES-256-GCM" as const,
      wrappingAlgorithm: wrapped.wrappingAlgorithm,
      keyReference: wrapped.keyReference,
      wrappedDataKey: wrapped.wrappedDataKey
    };

    const aad = buildOAuthEncryptedAadV2(binding, metadata);
    const nonce = randomBytes(NONCE_BYTES);

    const cipher = createCipheriv("aes-256-gcm", dataKey, nonce, {
      authTagLength: TAG_BYTES
    });

    cipher.setAAD(aad);

    const ciphertext = Buffer.concat([
      cipher.update(plaintext),
      cipher.final()
    ]);

    const envelope: OAuthEncryptedEnvelopeV3 = {
      schemaVersion: 3,
      aadVersion: 2,
      ...metadata,
      nonce: nonce.toString("base64url"),
      ciphertext: ciphertext.toString("base64url"),
      authenticationTag: cipher.getAuthTag().toString("base64url")
    };

    if (!isOAuthEncryptedEnvelopeV3(envelope)) {
      throw new Error("Invalid OAuth v3 envelope");
    }

    return envelope;
  } catch {
    throw new Error("OAuth v3 envelope encryption failed");
  } finally {
    dataKey.fill(0);
  }
}

/**
 * This primitive is not session authorization.
 *
 * Envelope validation occurs before any key-unwrapping operation.
 * The approved key policy is enforced by unwrapOAuthDataKey.
 * AES-GCM authenticates exact wrapping metadata and owner AAD.
 */
export async function decryptOAuthCredentialEnvelopeV3(
  client: OAuthKeyWrapClient,
  policy: OAuthKeyWrapPolicy,
  envelope: unknown,
  binding: OAuthEncryptedAadBindingV1
): Promise<Buffer> {
  if (!isOAuthEncryptedEnvelopeV3(envelope)) {
    throw new Error("Invalid OAuth v3 envelope");
  }

  let dataKey: Buffer | undefined;

  try {
    // Reject invalid owner bindings before calling the key service.
    const aad = buildOAuthEncryptedAadV2(binding, {
      algorithm: envelope.algorithm,
      wrappingAlgorithm: envelope.wrappingAlgorithm,
      keyReference: envelope.keyReference,
      wrappedDataKey: envelope.wrappedDataKey
    });

    dataKey = await unwrapOAuthDataKey(client, policy, {
      keyReference: envelope.keyReference,
      wrappingAlgorithm: envelope.wrappingAlgorithm,
      wrappedDataKey: envelope.wrappedDataKey
    });

    const decipher = createDecipheriv(
      "aes-256-gcm",
      dataKey,
      decode(envelope.nonce),
      { authTagLength: TAG_BYTES }
    );

    decipher.setAAD(aad);
    decipher.setAuthTag(decode(envelope.authenticationTag));

    return Buffer.concat([
      decipher.update(decode(envelope.ciphertext)),
      decipher.final()
    ]);
  } catch {
    throw new Error("OAuth v3 envelope decryption failed");
  } finally {
    dataKey?.fill(0);
  }
}
