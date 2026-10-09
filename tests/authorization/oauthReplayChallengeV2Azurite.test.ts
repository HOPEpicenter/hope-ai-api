import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { TableClient } from "@azure/data-tables";

import {
  OAuthReplayChallengeV2StorageRepository
} from "../../src/repositories/oauthReplayChallengeV2StorageRepository";

import {
  OAUTH_REPLAY_CHALLENGE_PARTITION_KEY,
  type OAuthReplayChallengeTablePort,
  type OAuthReplayChallengeTableEntity
} from "../../src/repositories/oauthReplayChallengeStorageRepository";

import {
  consumeOAuthReplayChallengeV2,
  type OAuthReplayConsumptionRequestV2
} from "../../src/services/authorization/consumeOAuthReplayChallengeV2";

import type {
  OAuthOperationReplayChallengeV2
} from "../../src/contracts/oauthOperationReplayChallenge.v2";

/**
 * Integration test ONLY. Never use a remotely configured endpoint.
 * The fixed emulator connection string is intentional.
 */
if (process.env.STORAGE_CONNECTION_STRING !== "UseDevelopmentStorage=true") {
  throw new Error("Azurite integration requires local emulator configuration");
}

// Only the standard CI port or our isolated loopback test port.
const tablePort = process.env.HOPE_OAUTH_AZURITE_TABLE_PORT ?? "10002";
if (tablePort !== "10002" && tablePort !== "11002") {
  throw new Error("Unapproved Azurite Table port");
}

const connectionString = tablePort === "10002"
  ? "UseDevelopmentStorage=true"
  : [
      "DefaultEndpointsProtocol=http",
      "AccountName=devstoreaccount1",
      "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==",
      "TableEndpoint=http://127.0.0.1:11002/devstoreaccount1"
    ].join(";");

const CHALLENGE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SESSION = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CREDENTIAL = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const OTHER_CREDENTIAL = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const DIGEST = "a".repeat(64);

const NOW = Date.parse("2026-01-01T12:02:00.000Z");
const ISSUED = "2026-01-01T12:00:00.000Z";
const EXPIRES = "2026-01-01T12:05:00.000Z";

const denied = {
  consumed: false,
  reason: "replay_challenge_denied"
};

function record(): OAuthOperationReplayChallengeV2 {
  return {
    schemaVersion: 2,
    challengeId: CHALLENGE,
    sessionBindingId: SESSION,
    credentialId: CREDENTIAL,
    operation: "credential_rotate",
    challengeDigest: DIGEST,
    issuedAt: ISSUED,
    expiresAt: EXPIRES,
    consumedAt: null,
    revision: 0
  };
}

function request(): OAuthReplayConsumptionRequestV2 {
  return {
    challengeId: CHALLENGE,
    sessionBindingId: SESSION,
    credentialId: CREDENTIAL,
    operation: "credential_rotate",
    expectedChallengeDigest: DIGEST,
    expectedRevision: 0,
    nowMilliseconds: NOW
  };
}

async function run(): Promise<void> {
  // Azure Table names contain only alphanumerics and are limited
  // to 63 characters. Each test execution gets a unique table.
  const tableName =
    "OauthReplayV2IT" + randomBytes(10).toString("hex");

  const table = TableClient.fromConnectionString(
    connectionString,
    tableName,
    { allowInsecureConnection: true }
  );

  // This is intentionally the ONLY table provisioning call.
  // Its target is the locally configured Azurite emulator.
  await table.createTable();

  try {
    const port: OAuthReplayChallengeTablePort = {
      async getEntity(partitionKey, rowKey) {
        const entity = await table.getEntity<{
          challengeJson: string;
        }>(partitionKey, rowKey);

        return {
          partitionKey: entity.partitionKey,
          rowKey: entity.rowKey,
          challengeJson: entity.challengeJson,
          etag: entity.etag
        } as OAuthReplayChallengeTableEntity;
      },

      async updateEntity(entity, mode, options) {
        return table.updateEntity(
          entity,
          mode,
          options
        );
      }
    };

    await table.createEntity({
      partitionKey: OAUTH_REPLAY_CHALLENGE_PARTITION_KEY,
      rowKey: CHALLENGE,
      challengeJson: JSON.stringify(record())
    });

    // A challenge for another credential must not be consumed.
    const mismatched = await consumeOAuthReplayChallengeV2(
      {
        ...request(),
        credentialId: OTHER_CREDENTIAL
      },
      {
        repository: new OAuthReplayChallengeV2StorageRepository(
          port,
          () => NOW
        )
      }
    );

    assert.deepEqual(mismatched, denied);

    const beforeRaceRecord = await table.getEntity<{
      challengeJson: string;
    }>(
      OAUTH_REPLAY_CHALLENGE_PARTITION_KEY,
      CHALLENGE
    );

    const beforeRaceChallenge = JSON.parse(
      beforeRaceRecord.challengeJson
    ) as OAuthOperationReplayChallengeV2;

    assert.equal(beforeRaceChallenge.revision, 0);
    assert.equal(beforeRaceChallenge.consumedAt, null);
    assert.equal(beforeRaceChallenge.credentialId, CREDENTIAL);
    const consumers = Array.from(
      { length: 30 },
      () => new OAuthReplayChallengeV2StorageRepository(
        port,
        () => NOW
      )
    );

    // Competing SDK operations use actual Azurite ETags.
    const decisions = await Promise.all(
      consumers.map(repository =>
        consumeOAuthReplayChallengeV2(
          request(),
          { repository }
        )
      )
    );

    assert.equal(
      decisions.filter(value => value.consumed).length,
      1,
      "Exactly one request must win the ETag race"
    );

    const stored = await table.getEntity<{
      challengeJson: string;
    }>(
      OAUTH_REPLAY_CHALLENGE_PARTITION_KEY,
      CHALLENGE
    );

    const consumed = JSON.parse(
      stored.challengeJson
    ) as OAuthOperationReplayChallengeV2;

    assert.equal(consumed.schemaVersion, 2);
    assert.equal(consumed.credentialId, CREDENTIAL);
    assert.equal(consumed.revision, 1);
    assert.equal(
      consumed.consumedAt,
      new Date(NOW).toISOString()
    );

    // A second attempt against the committed record is denied.
    assert.deepEqual(
      await consumeOAuthReplayChallengeV2(
        request(),
        {
          repository: new OAuthReplayChallengeV2StorageRepository(
            port,
            () => NOW
          )
        }
      ),
      denied
    );

    // Missing records fail closed through the actual SDK.
    assert.deepEqual(
      await consumeOAuthReplayChallengeV2(
        {
          ...request(),
          challengeId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
        },
        {
          repository: new OAuthReplayChallengeV2StorageRepository(
            port,
            () => NOW
          )
        }
      ),
      denied
    );

    // A stale ETag must receive an HTTP 412 from Azurite.
    const staleEtag = stored.etag;

    await table.updateEntity(
      {
        partitionKey: OAUTH_REPLAY_CHALLENGE_PARTITION_KEY,
        rowKey: CHALLENGE,
        challengeJson: stored.challengeJson
      },
      "Replace",
      { etag: staleEtag }
    );

    let rejectedStaleEtag = false;

    try {
      await table.updateEntity(
        {
          partitionKey: OAUTH_REPLAY_CHALLENGE_PARTITION_KEY,
          rowKey: CHALLENGE,
          challengeJson: stored.challengeJson
        },
        "Replace",
        { etag: staleEtag }
      );
    } catch (error) {
      const value = error as { statusCode?: number };
      rejectedStaleEtag = value.statusCode === 412;
    }

    assert.equal(
      rejectedStaleEtag,
      true,
      "Azurite must reject stale If-Match ETags"
    );

    console.log(
      "OAuth V2 credential-bound Azurite ETag integration tests passed"
    );
  } finally {
    await table.deleteTable();
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
