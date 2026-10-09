import assert from "node:assert/strict";

import {
  consumeOAuthReplayChallengeV2,
  type OAuthReplayConsumptionRequestV2
} from "../../src/services/authorization/consumeOAuthReplayChallengeV2";

import {
  OAuthReplayChallengeV2StorageRepository
} from "../../src/repositories/oauthReplayChallengeV2StorageRepository";

import {
  OAUTH_REPLAY_CHALLENGE_PARTITION_KEY,
  type OAuthReplayChallengeTablePort,
  type OAuthReplayChallengeTableEntity,
  type OAuthReplayChallengeWriteEntity
} from "../../src/repositories/oauthReplayChallengeStorageRepository";

const CHALLENGE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SESSION = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CREDENTIAL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const ISSUED = Date.parse("2026-01-01T12:00:00.000Z");
const NOW = Date.parse("2026-01-01T12:02:00.000Z");
const EXPIRES = Date.parse("2026-01-01T12:05:00.000Z");
const DIGEST = "a".repeat(64);

function record() {
  return {
    schemaVersion: 2,
    challengeId: CHALLENGE,
    sessionBindingId: SESSION,
    credentialId: CREDENTIAL,
    operation: "credential_read",
    challengeDigest: DIGEST,
    issuedAt: new Date(ISSUED).toISOString(),
    expiresAt: new Date(EXPIRES).toISOString(),
    consumedAt: null,
    revision: 0
  };
}

function request(
  overrides: Partial<OAuthReplayConsumptionRequestV2> = {}
): OAuthReplayConsumptionRequestV2 {
  return {
    challengeId: CHALLENGE,
    sessionBindingId: SESSION,
    credentialId: CREDENTIAL,
    operation: "credential_read",
    expectedChallengeDigest: DIGEST,
    expectedRevision: 0,
    nowMilliseconds: NOW,
    ...overrides
  };
}

const denied = {
  consumed: false,
  reason: "replay_challenge_denied"
};

class FakeTable implements OAuthReplayChallengeTablePort {
  entity: OAuthReplayChallengeTableEntity | null;
  updates = 0;
  delay = false;
  failWrite = false;
  throwRead = false;
  beforeAck?: () => void;

  constructor(data: unknown = record()) {
    this.entity = {
      partitionKey: OAUTH_REPLAY_CHALLENGE_PARTITION_KEY,
      rowKey: CHALLENGE,
      challengeJson: JSON.stringify(data),
      etag: "etag-1"
    };
  }

  async getEntity(
    partitionKey: string,
    rowKey: string
  ): Promise<OAuthReplayChallengeTableEntity> {
    if (this.throwRead) throw new Error("read failed");
    if (!this.entity ||
        partitionKey !== this.entity.partitionKey ||
        rowKey !== this.entity.rowKey) {
      throw Object.assign(new Error("missing"), {
        statusCode: 404
      });
    }

    if (this.delay) {
      await new Promise<void>(resolve => setImmediate(resolve));
    }

    return { ...this.entity };
  }

  async updateEntity(
    data: OAuthReplayChallengeWriteEntity,
    mode: "Replace",
    options: { etag: string }
  ): Promise<unknown> {
    if (this.failWrite) throw new Error("write uncertain");
    if (mode !== "Replace" || !this.entity ||
        options.etag !== this.entity.etag) {
      throw Object.assign(new Error("conflict"), {
        statusCode: 412
      });
    }

    this.entity = {
      ...data,
      etag: "etag-2"
    };

    this.updates++;
    this.beforeAck?.();
    return undefined;
  }

  current(): unknown {
    return this.entity
      ? JSON.parse(this.entity.challengeJson)
      : null;
  }
}

async function main(): Promise<void> {
  const table = new FakeTable();
  const adapter = new OAuthReplayChallengeV2StorageRepository(
    table,
    () => NOW
  );

  assert.deepEqual(
    await consumeOAuthReplayChallengeV2(
      request(),
      { repository: adapter }
    ),
    { consumed: true }
  );

  assert.equal(table.updates, 1);
  assert.deepEqual(
    {
      credentialId: (table.current() as typeof recordResult).credentialId,
      revision: (table.current() as typeof recordResult).revision
    },
    { credentialId: CREDENTIAL, revision: 1 }
  );

  assert.deepEqual(
    await consumeOAuthReplayChallengeV2(
      request(),
      { repository: adapter }
    ),
    denied
  );

  const mismatches: Array<
    Partial<OAuthReplayConsumptionRequestV2>
  > = [
    { credentialId: OTHER },
    { sessionBindingId: OTHER },
    { challengeId: OTHER },
    { operation: "credential_rotate" },
    { expectedChallengeDigest: "b".repeat(64) },
    { expectedRevision: 1 },
    { credentialId: "" },
    { nowMilliseconds: Number.NaN }
  ];

  for (const changed of mismatches) {
    const candidate = new FakeTable();
    const repo = new OAuthReplayChallengeV2StorageRepository(
      candidate,
      () => NOW
    );

    assert.deepEqual(
      await consumeOAuthReplayChallengeV2(
        request(changed),
        { repository: repo }
      ),
      denied
    );
    assert.equal(candidate.updates, 0);
  }

  // Reject valid V1 records and malformed V2 records.
  for (const invalid of [
    { ...record(), schemaVersion: 1 },
    (() => {
      const { credentialId: unused, ...v1 } = record();
      void unused;
      return { ...v1, schemaVersion: 1 };
    })(),
    { ...record(), credentialId: OTHER },
    { ...record(), credentialId: "" },
    { ...record(), consumedAt: new Date(NOW).toISOString() },
    { ...record(), operation: "credential_revoke" },
    { ...record(), unexpected: true },
    { ...record(), revision: Number.MAX_SAFE_INTEGER }
  ]) {
    const candidate = new FakeTable(invalid);
    const repo = new OAuthReplayChallengeV2StorageRepository(
      candidate,
      () => NOW
    );

    assert.deepEqual(
      await consumeOAuthReplayChallengeV2(
        request(),
        { repository: repo }
      ),
      denied
    );
    assert.equal(candidate.updates, 0);
  }

  // Competing callers may only produce one ETag winner.
  const concurrentTable = new FakeTable();
  concurrentTable.delay = true;

  const concurrentRepo = new OAuthReplayChallengeV2StorageRepository(
    concurrentTable,
    () => NOW
  );

  const decisions = await Promise.all(
    Array.from({ length: 30 }, () =>
      consumeOAuthReplayChallengeV2(
        request(),
        { repository: concurrentRepo }
      )
    )
  );

  assert.equal(
    decisions.filter(value => value.consumed).length,
    1
  );
  assert.equal(concurrentTable.updates, 1);

  // An expired or backwards-moving clock never authorizes.
  for (const value of [
    ISSUED - 1,
    EXPIRES,
    EXPIRES + 1,
    Number.NaN
  ]) {
    const candidate = new FakeTable();
    const repo = new OAuthReplayChallengeV2StorageRepository(
      candidate,
      () => value
    );

    assert.deepEqual(
      await consumeOAuthReplayChallengeV2(
        request(),
        { repository: repo }
      ),
      denied
    );
    assert.equal(candidate.updates, 0);
  }

  // Expiration during storage acknowledgement denies, even
  // though the ETag conditional write has committed.
  const expiryTable = new FakeTable();
  let clockNow = NOW;
  expiryTable.beforeAck = () => { clockNow = EXPIRES; };

  const expiryRepo = new OAuthReplayChallengeV2StorageRepository(
    expiryTable,
    () => clockNow
  );

  assert.deepEqual(
    await consumeOAuthReplayChallengeV2(
      request(),
      { repository: expiryRepo }
    ),
    denied
  );
  assert.equal(expiryTable.updates, 1);

  // Backend reader/writer uncertainty denies.
  const readFailure = new FakeTable();
  readFailure.throwRead = true;

  assert.deepEqual(
    await consumeOAuthReplayChallengeV2(request(), {
      repository: new OAuthReplayChallengeV2StorageRepository(
        readFailure,
        () => NOW
      )
    }),
    denied
  );

  const writeFailure = new FakeTable();
  writeFailure.failWrite = true;

  assert.deepEqual(
    await consumeOAuthReplayChallengeV2(request(), {
      repository: new OAuthReplayChallengeV2StorageRepository(
        writeFailure,
        () => NOW
      )
    }),
    denied
  );

  assert.equal(writeFailure.updates, 0);

  console.log(
    "OAuth V2 credential-bound storage synthetic tests passed"
  );
}

const recordResult = record();

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
