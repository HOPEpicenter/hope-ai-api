import {
  type OAuthSensitiveOperationV1
} from "../../contracts/oauthSessionPossession.v1";

/**
 * Trusted expected values must come from server-side challenge
 * issuance and authorization context, NOT untrusted client claims.
 *
 * A challenge digest is a correlation/integrity value, not proof
 * of secret possession.
 */
export interface OAuthReplayConsumptionRequest {
  challengeId: string;
  sessionBindingId: string;
  operation: OAuthSensitiveOperationV1;
  expectedChallengeDigest: string;
  expectedRevision: number;
  nowMilliseconds: number;
}

/**
 * Storage adapter obligation:
 *
 * The check and update MUST be one atomic conditional mutation,
 * evaluated against the authoritative stored record.
 *
 * The adapter must require:
 * - schemaVersion === 1 and exact valid V1 record
 * - exact challengeId, sessionBindingId, operation and digest
 * - revision === expectedRevision
 * - consumedAt === null
 * - issuedAt <= nowMilliseconds < expiresAt
 *
 * On success it must durably set:
 * - consumedAt = canonical UTC time from nowMilliseconds
 * - revision = expectedRevision + 1
 *
 * It must return true ONLY after the conditional mutation commits.
 * A mismatch, missing record, conflict, or storage uncertainty must
 * return false or throw. It MUST NOT use read-then-write.
 *
 * This interface does not itself implement storage atomicity.
 */
export interface OAuthReplayChallengeAtomicRepository {
  consumeIfAvailable(
    request: Readonly<OAuthReplayConsumptionRequest>
  ): Promise<boolean>;
}

export interface OAuthReplayConsumptionDependencies {
  repository: OAuthReplayChallengeAtomicRepository;
}

export type OAuthReplayConsumptionDecision =
  | { consumed: true }
  | {
      consumed: false;
      reason: "replay_challenge_denied";
    };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const DIGEST = /^[0-9a-f]{64}$/;

function isOperation(
  value: unknown
): value is OAuthSensitiveOperationV1 {
  return value === "credential_read" ||
    value === "credential_rotate" ||
    value === "credential_revoke";
}

function isValidRequest(
  value: unknown
): value is OAuthReplayConsumptionRequest {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  const request = value as Record<string, unknown>;

  return typeof request.challengeId === "string" &&
    UUID.test(request.challengeId) &&
    typeof request.sessionBindingId === "string" &&
    UUID.test(request.sessionBindingId) &&
    isOperation(request.operation) &&
    typeof request.expectedChallengeDigest === "string" &&
    DIGEST.test(request.expectedChallengeDigest) &&
    typeof request.expectedRevision === "number" &&
    Number.isSafeInteger(request.expectedRevision) &&
    request.expectedRevision >= 0 &&
    request.expectedRevision < Number.MAX_SAFE_INTEGER &&
    typeof request.nowMilliseconds === "number" &&
    Number.isSafeInteger(request.nowMilliseconds) &&
    request.nowMilliseconds >= 0 &&
    request.nowMilliseconds <= 8640000000000000;
}

/**
 * Consume a challenge through a trusted atomic repository.
 *
 * This primitive does NOT establish Entra identity, verify
 * cryptographic possession, authorize credential ownership,
 * or permit the requested OAuth operation.
 *
 * Repository implementation and authorization composition
 * are intentionally separate security milestones.
 */
export async function consumeOAuthReplayChallenge(
  input: unknown,
  dependencies: OAuthReplayConsumptionDependencies
): Promise<OAuthReplayConsumptionDecision> {
  const denied: OAuthReplayConsumptionDecision = {
    consumed: false,
    reason: "replay_challenge_denied"
  };

  if (!isValidRequest(input)) return denied;

  if (
    !dependencies ||
    !dependencies.repository ||
    typeof dependencies.repository.consumeIfAvailable !== "function"
  ) {
    return denied;
  }

  try {
    const committed = await dependencies.repository
      .consumeIfAvailable(Object.freeze({ ...input }));

    return committed === true ? { consumed: true } : denied;
  } catch {
    // Storage uncertainty is never interpreted as success.
    return denied;
  }
}
