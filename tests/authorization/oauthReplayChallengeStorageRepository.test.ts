import assert from "node:assert/strict";

import {
  OAuthReplayChallengeStorageRepository,
  OAUTH_REPLAY_CHALLENGE_TABLE_NAME,
  OAUTH_REPLAY_CHALLENGE_PARTITION_KEY,
  type OAuthReplayChallengeTableEntity,
  type OAuthReplayChallengeTablePort,
  type OAuthReplayChallengeWriteEntity
} from "../../src/repositories/oauthReplayChallengeStorageRepository";

import {
  consumeOAuthReplayChallenge,
  type OAuthReplayConsumptionRequest
} from "../../src/services/authorization/consumeOAuthReplayChallenge";

import type {
  OAuthOperationReplayChallengeV1
} from "../../src/contracts/oauthSessionPossession.v1";

const CHALLENGE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SESSION = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const DIGEST = "a".repeat(64);

const ISSUED = Date.parse("2026-01-01T12:00:00.000Z");
const NOW = Date.parse("2026-01-01T12:02:00.000Z");
const EXPIRES = Date.parse("2026-01-01T12:05:00.000Z");

const denied = {
  consumed: false,
  reason: "replay_challenge_denied"
};

function record(): OAuthOperationReplayChallengeV1 {
  return {
    schemaVersion: 1,
    challengeId: CHALLENGE,
    sessionBindingId: SESSION,
    operation: "credential_rotate",
    challengeDigest: DIGEST,
    issuedAt: new Date(ISSUED).toISOString(),
    expiresAt: new Date(EXPIRES).toISOString(),
    consumedAt: null,
    revision: 0
  };
}

function request(): OAuthReplayConsumptionRequest {
  return {
    challengeId: CHALLENGE,
    sessionBindingId: SESSION,
    operation: "credential_rotate",
    expectedChallengeDigest: DIGEST,
    expectedRevision: 0,
    nowMilliseconds: NOW
  };
}

function storageError(statusCode: number): Error {
  return Object.assign(
    new Error("Synthetic storage failure"),
    { statusCode }
  );
}

/**
 * Synthetic ETag compare-and-swap model.
 *
 * This models atomic If-Match behavior but is NOT an integration
 * test against Azure Table Storage or Azurite.
 */
class FakeTable implements OAuthReplayChallengeTablePort {
  entity: OAuthReplayChallengeTableEntity | null;
  reads = 0;
  updates = 0;
  private version = 1;
  beforeUpdate: (() => void) | null = null;
  failAfterCommit = false;

  constructor(value: OAuthOperationReplayChallengeV1 = record()) {
    this.entity = {
      partitionKey: OAUTH_REPLAY_CHALLENGE_PARTITION_KEY,
      rowKey: value.challengeId,
      challengeJson: JSON.stringify(value),
      etag: "etag-1"
    };
  }

  async getEntity(
    partitionKey: string,
    rowKey: string
  ): Promise<OAuthReplayChallengeTableEntity> {
    this.reads++;

    // Yield so competing requests can all read the old ETag.
    await Promise.resolve();

    if (
      !this.entity ||
      this.entity.partitionKey !== partitionKey ||
      this.entity.rowKey !== rowKey
    ) {
      throw storageError(404);
    }

    return { ...this.entity };
  }

  async updateEntity(
    entity: OAuthReplayChallengeWriteEntity,
    mode: "Replace",
    options: { etag: string }
  ): Promise<void> {
    this.updates++;
    assert.equal(mode, "Replace");

    this.beforeUpdate?.();
    this.beforeUpdate = null;

    if (!this.entity) throw storageError(404);

    if (
      entity.partitionKey !== this.entity.partitionKey ||
      entity.rowKey !== this.entity.rowKey ||
      options.etag !== this.entity.etag
    ) {
      throw storageError(412);
    }

    this.entity = {
      ...entity,
      etag: `etag-${++this.version}`
    };

    if (this.failAfterCommit) {
      throw new Error("Synthetic ambiguous commit");
    }
  }

  current(): OAuthOperationReplayChallengeV1 | null {
    return this.entity
      ? JSON.parse(this.entity.challengeJson) as
          OAuthOperationReplayChallengeV1
      : null;
  }
}

async function run(): Promise<void> {
  assert.equal(
    OAUTH_REPLAY_CHALLENGE_TABLE_NAME,
    "OAuthReplayChallenges"
  );

  const table = new FakeTable();
  const repository = new OAuthReplayChallengeStorageRepository(
    table,
    () => NOW
  );

  assert.deepEqual(
    await consumeOAuthReplayChallenge(
      request(),
      { repository }
    ),
    { consumed: true }
  );

  assert.equal(table.current()?.revision, 1);
  assert.equal(
    table.current()?.consumedAt,
    new Date(NOW).toISOString()
  );
  assert.equal(table.updates, 1);

  assert.deepEqual(
    await consumeOAuthReplayChallenge(
      request(),
      { repository }
    ),
    denied
  );

  // Forty competing consumers share the same storage row.
  // Only one ETag comparison may succeed.
  const competingTable = new FakeTable();
  const consumers = Array.from(
    { length: 40 },
    () => new OAuthReplayChallengeStorageRepository(
      competingTable,
      () => NOW
    )
  );

  const results = await Promise.all(
    consumers.map(candidate =>
      consumeOAuthReplayChallenge(
        request(),
        { repository: candidate }
      )
    )
  );

  assert.equal(
    results.filter(result => result.consumed).length,
    1
  );
  assert.equal(competingTable.current()?.revision, 1);
  assert.equal(
    competingTable.current()?.consumedAt,
    new Date(NOW).toISOString()
  );

  // Wrong metadata and revision must not modify storage.
  const mismatches: Array<Partial<OAuthReplayConsumptionRequest>> = [
    { challengeId: OTHER },
    { sessionBindingId: OTHER },
    { operation: "credential_read" },
    { expectedChallengeDigest: "b".repeat(64) },
    { expectedRevision: 1 }
  ];

  for (const override of mismatches) {
    const candidate = new FakeTable();
    const adapter = new OAuthReplayChallengeStorageRepository(
      candidate,
      () => NOW
    );

    assert.deepEqual(
      await consumeOAuthReplayChallenge(
        { ...request(), ...override },
        { repository: adapter }
      ),
      denied
    );

    assert.equal(candidate.updates, 0);
    assert.equal(candidate.current()?.consumedAt, null);
  }

  // Request time cannot override the adapter's trusted clock.
  for (const clock of [ISSUED - 1, EXPIRES, EXPIRES + 1]) {
    const candidate = new FakeTable();
    const adapter = new OAuthReplayChallengeStorageRepository(
      candidate,
      () => clock
    );

    assert.deepEqual(
      await consumeOAuthReplayChallenge(
        request(),
        { repository: adapter }
      ),
      denied
    );
    assert.equal(candidate.updates, 0);
  }

  // Expiry between reading and writing fails closed.
  const changingClock = new FakeTable();
  let clockReads = 0;
  const expiring = new OAuthReplayChallengeStorageRepository(
    changingClock,
    () => ++clockReads === 1 ? EXPIRES - 1 : EXPIRES
  );

  assert.deepEqual(
    await consumeOAuthReplayChallenge(
      request(),
      { repository: expiring }
    ),
    denied
  );
  assert.equal(changingClock.updates, 0);

  // Missing, malformed, and previously consumed rows.
  const alteredRecords: Array<Partial<OAuthOperationReplayChallengeV1>> = [
    { consumedAt: new Date(NOW).toISOString() },
    { revision: 1 },
    { challengeDigest: "b".repeat(64) },
    { operation: "credential_revoke" },
    { expiresAt: new Date(ISSUED).toISOString() }
  ];

  for (const override of alteredRecords) {
    const candidate = new FakeTable({
      ...record(),
      ...override
    });

    const adapter = new OAuthReplayChallengeStorageRepository(
      candidate,
      () => NOW
    );

    assert.deepEqual(
      await consumeOAuthReplayChallenge(
        request(),
        { repository: adapter }
      ),
      denied
    );
    assert.equal(candidate.updates, 0);
  }

  const missing = new FakeTable();
  missing.entity = null;

  assert.deepEqual(
    await consumeOAuthReplayChallenge(
      request(),
      {
        repository: new OAuthReplayChallengeStorageRepository(
          missing,
          () => NOW
        )
      }
    ),
    denied
  );

  // An empty, missing, or wildcard ETag cannot authorize an update.
  for (const etag of ["", "*"]) {
    const candidate = new FakeTable();
    if (!candidate.entity) throw new Error("Missing fixture");
    candidate.entity.etag = etag;

    assert.deepEqual(
      await consumeOAuthReplayChallenge(
        request(),
        {
          repository: new OAuthReplayChallengeStorageRepository(
            candidate,
            () => NOW
          )
        }
      ),
      denied
    );

    assert.equal(candidate.updates, 0);
  }

  // A concurrent replacement invalidates the previously read ETag.
  const raced = new FakeTable();
  raced.beforeUpdate = () => {
    if (!raced.entity) throw new Error("Missing fixture");
    raced.entity = {
      ...raced.entity,
      etag: "etag-concurrent"
    };
  };

  assert.deepEqual(
    await consumeOAuthReplayChallenge(
      request(),
      {
        repository: new OAuthReplayChallengeStorageRepository(
          raced,
          () => NOW
        )
      }
    ),
    denied
  );

  // Ambiguous commits must never produce a success decision.
  const ambiguous = new FakeTable();
  ambiguous.failAfterCommit = true;

  assert.deepEqual(
    await consumeOAuthReplayChallenge(
      request(),
      {
        repository: new OAuthReplayChallengeStorageRepository(
          ambiguous,
          () => NOW
        )
      }
    ),
    denied
  );

  // Even when the synthetic storage committed, the uncertain
  // outcome cannot be reported as confirmed success.
  assert.equal(ambiguous.current()?.revision, 1);

  // No table provisioning operation exists on this port.
  assert.equal("createTable" in table, false);
  assert.equal("createEntity" in table, false);

  console.log(
    "oauthReplayChallengeStorageRepository synthetic ETag tests passed"
  );
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
