import { randomBytes } from "node:crypto";

import {
  OAuthEncryptedAadBindingV1,
  OAuthEncryptedEnvelopeV2,
  isOAuthEncryptedEnvelopeV2
} from "../../contracts/oauthEncryptedEnvelope.v2";

import {
  decryptOAuthLocalPayload,
  encryptOAuthLocalPayload
} from "./oauthLocalAesGcm";

import {
  OAuthKeyWrapClient,
  OAuthKeyWrapPolicy,
  unwrapOAuthDataKey,
  wrapOAuthDataKey
} from "./oauthKeyVaultWrapping";

/**
 * Synthetic-only coordination of AES-256-GCM and injected key wrapping.
 *
 * No storage, Key Vault SDK, HTTP routes, or authentication integration.
 * The binding and policy must come from trusted server-side context.
 *
 * This component authenticates the existing canonical owner AAD.
 * Key-reference metadata is NOT part of that AAD; cryptographic
 * binding of key metadata is a separate integration requirement.
 */
export async function encryptOAuthCredentialEnvelope(
  client: OAuthKeyWrapClient,
  policy: OAuthKeyWrapPolicy,
  plaintext: Buffer,
  binding: OAuthEncryptedAadBindingV1
): Promise<OAuthEncryptedEnvelopeV2> {
  const dataKey = randomBytes(32);

  try {
    const encrypted = encryptOAuthLocalPayload(
      dataKey,
      plaintext,
      binding
    );

    const wrapped = await wrapOAuthDataKey(
      client,
      policy,
      dataKey
    );

    const envelope: OAuthEncryptedEnvelopeV2 = {
      schemaVersion: 2,
      algorithm: "AES-256-GCM",
      wrappingAlgorithm: wrapped.wrappingAlgorithm,
      keyReference: wrapped.keyReference,
      wrappedDataKey: wrapped.wrappedDataKey,
      nonce: encrypted.nonce,
      ciphertext: encrypted.ciphertext,
      authenticationTag: encrypted.authenticationTag,
      aadVersion: 1
    };

    if (!isOAuthEncryptedEnvelopeV2(envelope)) {
      throw new Error("Invalid OAuth encrypted envelope");
    }

    return envelope;
  } catch {
    throw new Error("OAuth envelope encryption failed");
  } finally {
    dataKey.fill(0);
  }
}

/**
 * Validate the complete envelope before requesting a key unwrap.
 * The wrapping adapter separately validates allowed key references.
 *
 * This is NOT a session authorization service. Callers must establish
 * the verified binding and approved policy independently.
 */
export async function decryptOAuthCredentialEnvelope(
  client: OAuthKeyWrapClient,
  policy: OAuthKeyWrapPolicy,
  envelope: unknown,
  binding: OAuthEncryptedAadBindingV1
): Promise<Buffer> {
  if (!isOAuthEncryptedEnvelopeV2(envelope)) {
    throw new Error("Invalid OAuth encrypted envelope");
  }

  let dataKey: Buffer | undefined;

  try {
    dataKey = await unwrapOAuthDataKey(client, policy, {
      keyReference: envelope.keyReference,
      wrappingAlgorithm: envelope.wrappingAlgorithm,
      wrappedDataKey: envelope.wrappedDataKey
    });

    return decryptOAuthLocalPayload(dataKey, {
      nonce: envelope.nonce,
      ciphertext: envelope.ciphertext,
      authenticationTag: envelope.authenticationTag
    }, binding);
  } catch {
    throw new Error("OAuth envelope decryption failed");
  } finally {
    dataKey?.fill(0);
  }
}
