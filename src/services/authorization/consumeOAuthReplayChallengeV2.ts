import type {
  OAuthSensitiveOperationV1
} from "../../contracts/oauthSessionPossession.v1";

/**
 * Trusted expected values must come from backend authorization
 * context. This is not an HTTP request contract.
 *
 * The digest is NOT a proof of session possession.
 */
export interface OAuthReplayConsumptionRequestV2 {
  challengeId: string;
  sessionBindingId: string;
  credentialId: string;
  operation: OAuthSensitiveOperationV1;
  expectedChallengeDigest: string;
  expectedRevision: number;
  nowMilliseconds: number;
}

export interface OAuthReplayChallengeAtomicRepositoryV2 {
  consumeIfAvailableV2(
    request: Readonly<OAuthReplayConsumptionRequestV2>
  ): Promise<boolean>;
}

export type OAuthReplayConsumptionDecisionV2 =
  | { consumed: true }
  | {
      consumed: false;
      reason: "replay_challenge_denied";
    };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function isValidRequest(
  value: unknown
): value is OAuthReplayConsumptionRequestV2 {
  if (!value || typeof value !== "object" ||
      Array.isArray(value)) {
    return false;
  }

  const request = value as Record<string, unknown>;
  const keys = [
    "challengeId",
    "sessionBindingId",
    "credentialId",
    "operation",
    "expectedChallengeDigest",
    "expectedRevision",
    "nowMilliseconds"
  ];

  return Object.keys(request).length === keys.length &&
    keys.every(key =>
      Object.prototype.hasOwnProperty.call(request, key)
    ) &&
    typeof request.challengeId === "string" &&
    UUID.test(request.challengeId) &&
    typeof request.sessionBindingId === "string" &&
    UUID.test(request.sessionBindingId) &&
    typeof request.credentialId === "string" &&
    UUID.test(request.credentialId) &&
    (
      request.operation === "credential_read" ||
      request.operation === "credential_rotate" ||
      request.operation === "credential_revoke"
    ) &&
    typeof request.expectedChallengeDigest === "string" &&
    /^[0-9a-f]{64}$/.test(request.expectedChallengeDigest) &&
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
 * Isolated V2 replay consumption boundary.
 *
 * No authentication, ownership, issuance or credential operation
 * is established by successful consumption.
 */
export async function consumeOAuthReplayChallengeV2(
  input: unknown,
  dependencies: {
    repository: OAuthReplayChallengeAtomicRepositoryV2;
  }
): Promise<OAuthReplayConsumptionDecisionV2> {
  const denied: OAuthReplayConsumptionDecisionV2 = {
    consumed: false,
    reason: "replay_challenge_denied"
  };

  if (!isValidRequest(input) ||
      !dependencies ||
      typeof dependencies.repository?.consumeIfAvailableV2 !==
        "function") {
    return denied;
  }

  try {
    const committed = await dependencies.repository
      .consumeIfAvailableV2(Object.freeze({ ...input }));

    return committed === true ? { consumed: true } : denied;
  } catch {
    return denied;
  }
}
