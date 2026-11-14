/**
 * Offline Phase C pinned signing-key resolver.
 *
 * Trusted backend infrastructure must independently provision
 * the expected public key, fingerprint, and key ID.
 *
 * Never populate this configuration from an HTTP request,
 * JWT header, administrator session, or caller approval claim.
 *
 * This module does not authorize execution, issue credentials,
 * discover remote keys, or connect to an endpoint.
 */

import {
  createHash,
  createPublicKey
} from "node:crypto";

import type { JWTVerifyGetKey } from "jose";

const FINGERPRINT = /^[0-9a-f]{64}$/;
const KEY_ID = /^[A-Za-z0-9_-]{1,128}$/;

export type PhaseCPinnedSigningKeyConfiguration = Readonly<{
  publicKeyPem: string;
  publicKeySha256: string;
  keyId: string;
}>;

export function createPhaseCPinnedSigningKeyResolver(
  config: PhaseCPinnedSigningKeyConfiguration
): JWTVerifyGetKey {
  if (
    !config ||
    typeof config.publicKeyPem !== "string" ||
    !config.publicKeyPem.startsWith(
      "-----BEGIN PUBLIC KEY-----"
    ) ||
    typeof config.publicKeySha256 !== "string" ||
    !FINGERPRINT.test(config.publicKeySha256) ||
    typeof config.keyId !== "string" ||
    !KEY_ID.test(config.keyId)
  ) {
    throw new Error("PHASE_C_TRUST_ANCHOR_INVALID");
  }

  let publicKey;

  try {
    publicKey = createPublicKey(config.publicKeyPem);
  } catch {
    throw new Error("PHASE_C_TRUST_ANCHOR_INVALID");
  }

  if (
    publicKey.asymmetricKeyType !== "rsa" ||
    (publicKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048
  ) {
    throw new Error("PHASE_C_TRUST_ANCHOR_KEY_INVALID");
  }

  const actualFingerprint = createHash("sha256")
    .update(
      publicKey.export({
        type: "spki",
        format: "der"
      })
    )
    .digest("hex");

  if (actualFingerprint !== config.publicKeySha256) {
    throw new Error("PHASE_C_TRUST_ANCHOR_PIN_MISMATCH");
  }

  const expectedKeyId = config.keyId;

  // The JWT may identify the key, but never supply or redirect
  // the verifier to a different signing key.
  return async header => {
    if (
      header.alg !== "RS256" ||
      header.kid !== expectedKeyId ||
      header.jwk !== undefined ||
      header.jku !== undefined ||
      header.x5u !== undefined ||
      header.x5c !== undefined ||
      header.crit !== undefined ||
      header.b64 !== undefined
    ) {
      throw new Error("PHASE_C_UNTRUSTED_KEY_HEADER");
    }

    return publicKey;
  };
}
