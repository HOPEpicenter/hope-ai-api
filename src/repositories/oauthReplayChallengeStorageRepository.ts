import {
  isOAuthOperationReplayChallengeV1,
  type OAuthOperationReplayChallengeV1
} from "../contracts/oauthSessionPossession.v1";

import type {
  OAuthReplayChallengeAtomicRepository,
  OAuthReplayConsumptionRequest
} from "../services/authorization/consumeOAuthReplayChallenge";

/**
 * Storage contract only. This module never creates a table,
 * reads environment secrets, or creates a TableClient.
 *
 * The injected table must already exist and must implement
 * Azure Table Storage ETag conditional Replace semantics.
 */
export const OAUTH_REPLAY_CHALLENGE_TABLE_NAME =
  "OAuthReplayChallenges";

export const OAUTH_REPLAY_CHALLENGE_PARTITION_KEY =
  "OAUTH_REPLAY_CHALLENGES";

export interface OAuthReplayChallengeTableEntity {
  partitionKey: string;
  rowKey: string;
  challengeJson: string;
  etag: string;
}

export type OAuthReplayChallengeWriteEntity = Pick<
  OAuthReplayChallengeTableEntity,
  "partitionKey" | "rowKey" | "challengeJson"
>;

export interface OAuthReplayChallengeTablePort {
  getEntity(
    partitionKey: string,
    rowKey: string
  ): Promise<OAuthReplayChallengeTableEntity>;

  updateEntity(
    entity: OAuthReplayChallengeWriteEntity,
    mode: "Replace",
    options: { etag: string }
  ): Promise<unknown>;
}

function isExpectedStorageFailure(error: unknown): boolean {
  if (
    error === null ||
    typeof error !== "object"
  ) {
    return false;
  }

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

function isTrustedClockValue(value: number): boolean {
  return Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 8640000000000000;
}

function isValidRequest(
  request: Readonly<OAuthReplayConsumptionRequest>
): boolean {
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  return request !== null &&
    typeof request === "object" &&
    typeof request.challengeId === "string" &&
    uuid.test(request.challengeId) &&
    typeof request.sessionBindingId === "string" &&
    uuid.test(request.sessionBindingId) &&
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
    isTrustedClockValue(request.nowMilliseconds);
}

function matches(
  record: OAuthOperationReplayChallengeV1,
  request: Readonly<OAuthReplayConsumptionRequest>,
  now: number
): boolean {
  return record.challengeId === request.challengeId &&
    record.sessionBindingId === request.sessionBindingId &&
    record.operation === request.operation &&
    record.challengeDigest === request.expectedChallengeDigest &&
    record.revision === request.expectedRevision &&
    record.consumedAt === null &&
    Date.parse(record.issuedAt) <= now &&
    now < Date.parse(record.expiresAt);
}

/**
 * Injected, non-provisioning Azure Table Storage adapter.
 *
 * A preliminary read validates the stored record. The final
 * Replace operation MUST be conditional on the read ETag.
 *
 * It is safe against competing updates to the same ETag when
 * the storage implementation honors If-Match semantics.
 *
 * ETag alone does not provide a storage-side time predicate.
 * The trusted clock is checked just before the conditional write;
 * this is not an assertion about Azure's precise commit time.
 *
 * The request's nowMilliseconds is validated but is NOT trusted
 * as the authority for expiry. This adapter uses its own clock.
 */
export class OAuthReplayChallengeStorageRepository
implements OAuthReplayChallengeAtomicRepository {
  constructor(
    private readonly table: OAuthReplayChallengeTablePort,
    private readonly clock: () => number = Date.now
  ) {}

  async consumeIfAvailable(
    request: Readonly<OAuthReplayConsumptionRequest>
  ): Promise<boolean> {
    if (
      !isValidRequest(request) ||
      !this.table ||
      typeof this.table.getEntity !== "function" ||
      typeof this.table.updateEntity !== "function"
    ) {
      return false;
    }

    let entity: OAuthReplayChallengeTableEntity;

    try {
      entity = await this.table.getEntity(
        OAUTH_REPLAY_CHALLENGE_PARTITION_KEY,
        request.challengeId
      );
    } catch (error) {
      if (isExpectedStorageFailure(error)) return false;
      throw error;
    }

    if (
      !entity ||
      entity.partitionKey !== OAUTH_REPLAY_CHALLENGE_PARTITION_KEY ||
      entity.rowKey !== request.challengeId ||
      typeof entity.etag !== "string" ||
      !entity.etag.trim() ||
      entity.etag === "*" ||
      typeof entity.challengeJson !== "string"
    ) {
      return false;
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(entity.challengeJson);
    } catch {
      return false;
    }

    if (!isOAuthOperationReplayChallengeV1(parsed)) {
      return false;
    }

    // The adapter clock, not the request timestamp, controls expiry.
    const checkedAt = this.clock();

    if (
      !isTrustedClockValue(checkedAt) ||
      !matches(parsed, request, checkedAt)
    ) {
      return false;
    }

    // Refresh the trusted clock immediately before conditional write.
    const commitCheckAt = this.clock();

    if (
      !isTrustedClockValue(commitCheckAt) ||
      commitCheckAt < checkedAt ||
      !matches(parsed, request, commitCheckAt)
    ) {
      return false;
    }

    const nextRecord: OAuthOperationReplayChallengeV1 = {
      ...parsed,
      consumedAt: new Date(commitCheckAt).toISOString(),
      revision: parsed.revision + 1
    };

    if (!isOAuthOperationReplayChallengeV1(nextRecord)) {
      return false;
    }

    try {
      await this.table.updateEntity(
        {
          partitionKey: entity.partitionKey,
          rowKey: entity.rowKey,
          challengeJson: JSON.stringify(nextRecord)
        },
        "Replace",
        { etag: entity.etag }
      );

      // Only a confirmed conditional update is accepted.
      return true;
    } catch (error) {
      if (isExpectedStorageFailure(error)) return false;

      // Uncertain writes must not be assumed successful.
      throw error;
    }
  }
}
