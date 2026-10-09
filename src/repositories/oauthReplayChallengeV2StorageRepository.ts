import {
  isOAuthOperationReplayChallengeV2,
  type OAuthOperationReplayChallengeV2
} from "../contracts/oauthOperationReplayChallenge.v2";

import type {
  OAuthReplayChallengeAtomicRepositoryV2,
  OAuthReplayConsumptionRequestV2
} from "../services/authorization/consumeOAuthReplayChallengeV2";

import {
  OAUTH_REPLAY_CHALLENGE_PARTITION_KEY,
  type OAuthReplayChallengeTableEntity,
  type OAuthReplayChallengeTablePort
} from "./oauthReplayChallengeStorageRepository";

/**
 * V2-only ETag-conditional adapter.
 *
 * The table port must be created by trusted infrastructure.
 * This module performs no provisioning or credential operations.
 */
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function trustedTime(value: number): boolean {
  return Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 8640000000000000;
}

function validRequest(
  request: Readonly<OAuthReplayConsumptionRequestV2>
): boolean {
  return !!request &&
    typeof request === "object" &&
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
    Number.isSafeInteger(request.expectedRevision) &&
    request.expectedRevision >= 0 &&
    request.expectedRevision < Number.MAX_SAFE_INTEGER &&
    trustedTime(request.nowMilliseconds);
}

function matches(
  stored: OAuthOperationReplayChallengeV2,
  request: Readonly<OAuthReplayConsumptionRequestV2>,
  now: number
): boolean {
  return stored.schemaVersion === 2 &&
    stored.challengeId === request.challengeId &&
    stored.sessionBindingId === request.sessionBindingId &&
    stored.credentialId === request.credentialId &&
    stored.operation === request.operation &&
    stored.challengeDigest === request.expectedChallengeDigest &&
    stored.revision === request.expectedRevision &&
    stored.consumedAt === null &&
    Date.parse(stored.issuedAt) <= now &&
    now < Date.parse(stored.expiresAt);
}

function expectedStorageFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const value = error as {
    statusCode?: unknown;
    status?: unknown;
    code?: unknown;
  };

  const status = Number(value.statusCode ?? value.status ?? 0);
  const code = String(value.code ?? "");

  return status === 404 ||
    status === 412 ||
    code === "ResourceNotFound" ||
    code === "EntityNotFound" ||
    code === "UpdateConditionNotSatisfied";
}

/**
 * V2 never downgrades to V1.
 *
 * Conditional Replace enforces single-winner ETag concurrency,
 * provided the injected table honors If-Match.
 *
 * Clock checks before and after storage acknowledgement deny
 * expired consumption. They do not establish Azure commit time
 * or an atomic storage-side expiry predicate.
 */
export class OAuthReplayChallengeV2StorageRepository
implements OAuthReplayChallengeAtomicRepositoryV2 {
  constructor(
    private readonly table: OAuthReplayChallengeTablePort,
    private readonly clock: () => number = Date.now
  ) {}

  async consumeIfAvailableV2(
    request: Readonly<OAuthReplayConsumptionRequestV2>
  ): Promise<boolean> {
    if (!validRequest(request) ||
        !this.table ||
        typeof this.table.getEntity !== "function" ||
        typeof this.table.updateEntity !== "function") {
      return false;
    }

    let entity: OAuthReplayChallengeTableEntity;

    try {
      entity = await this.table.getEntity(
        OAUTH_REPLAY_CHALLENGE_PARTITION_KEY,
        request.challengeId
      );
    } catch (error) {
      if (expectedStorageFailure(error)) return false;
      throw error;
    }

    if (!entity ||
        entity.partitionKey !==
          OAUTH_REPLAY_CHALLENGE_PARTITION_KEY ||
        entity.rowKey !== request.challengeId ||
        typeof entity.etag !== "string" ||
        !entity.etag.trim() ||
        entity.etag === "*" ||
        typeof entity.challengeJson !== "string") {
      return false;
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(entity.challengeJson);
    } catch {
      return false;
    }

    if (!isOAuthOperationReplayChallengeV2(parsed)) {
      return false;
    }

    const checkedAt = this.clock();

    if (!trustedTime(checkedAt) ||
        !matches(parsed, request, checkedAt)) {
      return false;
    }

    const commitCheckAt = this.clock();

    if (!trustedTime(commitCheckAt) ||
        commitCheckAt < checkedAt ||
        !matches(parsed, request, commitCheckAt)) {
      return false;
    }

    const next: OAuthOperationReplayChallengeV2 = {
      ...parsed,
      consumedAt: new Date(commitCheckAt).toISOString(),
      revision: parsed.revision + 1
    };

    if (!isOAuthOperationReplayChallengeV2(next)) {
      return false;
    }

    try {
      await this.table.updateEntity(
        {
          partitionKey: entity.partitionKey,
          rowKey: entity.rowKey,
          challengeJson: JSON.stringify(next)
        },
        "Replace",
        { etag: entity.etag }
      );

      const confirmedAt = this.clock();

      if (!trustedTime(confirmedAt) ||
          confirmedAt < commitCheckAt ||
          confirmedAt >= Date.parse(parsed.expiresAt)) {
        return false;
      }

      return true;
    } catch (error) {
      if (expectedStorageFailure(error)) return false;
      throw error;
    }
  }
}
