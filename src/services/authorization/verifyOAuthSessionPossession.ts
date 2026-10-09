import {
  createHash,
  randomBytes,
  timingSafeEqual
} from "node:crypto";

import {
  isOAuthPossessionVerifierActiveV1
} from "../../contracts/oauthSessionPossession.v1";

/**
 * Versioned digest domain for high-entropy session credentials.
 *
 * Digest = SHA256(
 *   ASCII(domain) || 0x00 ||
 *   ASCII(canonicalSessionBindingId) || 0x00 ||
 *   32 raw random credential bytes
 * )
 *
 * The domain and binding ID prevent reuse across protocols or
 * different sessions. This is not a password hashing scheme:
 * callers must supply 256-bit cryptographically random secrets.
 */
const DOMAIN = "HOPE/OAUTH/SESSION-POSSESSION/V1";

const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const DIGEST_HEX = /^[0-9a-f]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]{43}$/;

export const OAUTH_SESSION_SECRET_BYTES = 32 as const;

function decodeCredential(value: unknown): Buffer | null {
  if (typeof value !== "string" || !BASE64URL.test(value)) {
    return null;
  }

  const bytes = Buffer.from(value, "base64url");

  // Reject noncanonical encodings, including nonzero pad bits.
  if (
    bytes.length !== OAUTH_SESSION_SECRET_BYTES ||
    bytes.toString("base64url") !== value
  ) {
    return null;
  }

  return bytes;
}

/**
 * Generate a fresh, high-entropy secret.
 *
 * This is an isolated primitive. It must never log credentials,
 * write plaintext credentials to durable storage, or issue cookies.
 */
export function generateOAuthSessionPossessionSecret(): string {
  return randomBytes(OAUTH_SESSION_SECRET_BYTES)
    .toString("base64url");
}

/**
 * Create a one-way, session-bound verifier digest.
 *
 * Return null on invalid inputs. The caller must not treat a digest
 * as an authentication credential or accept it in place of a secret.
 */
export function deriveOAuthSessionPossessionDigest(
  sessionBindingId: unknown,
  credential: unknown
): string | null {
  if (
    typeof sessionBindingId !== "string" ||
    !CANONICAL_UUID.test(sessionBindingId)
  ) {
    return null;
  }

  const bytes = decodeCredential(credential);

  if (!bytes) return null;

  return createHash("sha256")
    .update(DOMAIN, "ascii")
    .update(Buffer.from([0]))
    .update(sessionBindingId, "ascii")
    .update(Buffer.from([0]))
    .update(bytes)
    .digest("hex");
}

export interface OAuthSessionPossessionVerificationInput {
  sessionBindingId: string;
  credential: string;
  verifier: unknown;
  nowMilliseconds: number;
}

export type OAuthSessionPossessionDecision =
  | { verified: true }
  | {
      verified: false;
      reason: "session_possession_denied";
    };

/**
 * Verify possession of a 256-bit secret against an active record.
 *
 * sessionBindingId must originate from a trusted backend context.
 * This primitive does NOT check authoritative session state,
 * Entra identity, staff status, credential ownership or operation
 * replay protection.
 *
 * Comparison is constant-time for two valid 32-byte digests.
 * Input validation can return earlier and is not constant-time.
 */
export function verifyOAuthSessionPossession(
  input: OAuthSessionPossessionVerificationInput
): OAuthSessionPossessionDecision {
  const denied: OAuthSessionPossessionDecision = {
    verified: false,
    reason: "session_possession_denied"
  };

  if (!input || typeof input !== "object") return denied;

  const {
    sessionBindingId,
    credential,
    verifier,
    nowMilliseconds
  } = input;

  if (
    typeof sessionBindingId !== "string" ||
    !CANONICAL_UUID.test(sessionBindingId) ||
    !isOAuthPossessionVerifierActiveV1(
      verifier,
      nowMilliseconds
    ) ||
    verifier.sessionBindingId !== sessionBindingId ||
    !DIGEST_HEX.test(verifier.credentialVerifierDigest)
  ) {
    return denied;
  }

  const derived = deriveOAuthSessionPossessionDigest(
    sessionBindingId,
    credential
  );

  if (!derived) return denied;

  const storedBytes = Buffer.from(
    verifier.credentialVerifierDigest,
    "hex"
  );
  const derivedBytes = Buffer.from(derived, "hex");

  if (
    storedBytes.length !== 32 ||
    derivedBytes.length !== 32 ||
    !timingSafeEqual(storedBytes, derivedBytes)
  ) {
    return denied;
  }

  return { verified: true };
}
