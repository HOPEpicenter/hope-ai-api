import {
  isOAuthOperationReplayChallengeV1,
  type OAuthOperationReplayChallengeV1
} from "./oauthSessionPossession.v1";

/**
 * Credential-specific single-use replay challenge, version 2.
 *
 * V1 remains unchanged. This contract adds a mandatory credential
 * selector, but does not itself establish trusted issuance,
 * cryptographic possession, atomic consumption or authorization.
 */
export const OAUTH_REPLAY_CHALLENGE_SCHEMA_VERSION_V2 = 2 as const;

export type OAuthOperationReplayChallengeV2 =
  Omit<OAuthOperationReplayChallengeV1, "schemaVersion"> & {
    schemaVersion: 2;
    credentialId: string;
  };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const KEYS = [
  "schemaVersion",
  "challengeId",
  "sessionBindingId",
  "credentialId",
  "operation",
  "challengeDigest",
  "issuedAt",
  "expiresAt",
  "consumedAt",
  "revision"
] as const;

export function isOAuthOperationReplayChallengeV2(
  value: unknown
): value is OAuthOperationReplayChallengeV2 {
  if (!value || typeof value !== "object" ||
      Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const actual = Object.keys(record);

  if (
    actual.length !== KEYS.length ||
    !KEYS.every(key =>
      Object.prototype.hasOwnProperty.call(record, key)
    ) ||
    record.schemaVersion !== OAUTH_REPLAY_CHALLENGE_SCHEMA_VERSION_V2 ||
    typeof record.credentialId !== "string" ||
    !UUID.test(record.credentialId)
  ) {
    return false;
  }

  // Reuse all V1 structural, operation, timestamp and lifecycle
  // invariants while enforcing the new V2-only credential binding.
  const { credentialId, ...legacyFields } = record;

  return isOAuthOperationReplayChallengeV1({
    ...legacyFields,
    schemaVersion: 1
  });
}

/**
 * Snapshot availability only. Storage must separately enforce
 * credential, session, operation, revision and ETag predicates.
 */
export function isOAuthReplayChallengeAvailableV2(
  value: unknown,
  nowMilliseconds: number
): value is OAuthOperationReplayChallengeV2 {
  return isOAuthOperationReplayChallengeV2(value) &&
    Number.isSafeInteger(nowMilliseconds) &&
    nowMilliseconds >= 0 &&
    nowMilliseconds <= 8640000000000000 &&
    value.consumedAt === null &&
    Date.parse(value.issuedAt) <= nowMilliseconds &&
    nowMilliseconds < Date.parse(value.expiresAt);
}
