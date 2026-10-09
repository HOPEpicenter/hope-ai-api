import assert from "node:assert/strict";

import {
  consumeOAuthReplayChallenge,
  type OAuthReplayConsumptionRequest,
  type OAuthReplayChallengeAtomicRepository
} from "../../src/services/authorization/consumeOAuthReplayChallenge";

import {
  isOAuthReplayChallengeAvailableV1,
  isOAuthOperationReplayChallengeV1,
  type OAuthOperationReplayChallengeV1
} from "../../src/contracts/oauthSessionPossession.v1";

const CHALLENGE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SESSION = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const DIGEST = "a".repeat(64);
const ISSUED = "2026-01-01T12:00:00.000Z";
const EXPIRES = "2026-01-01T12:05:00.000Z";
const NOW = Date.parse("2026-01-01T12:02:00.000Z");

const denied = {
  consumed: false,
  reason: "replay_challenge_denied"
};

function fixture(): OAuthOperationReplayChallengeV1 {
  return {
    schemaVersion: 1,
    challengeId: CHALLENGE,
    sessionBindingId: SESSION,
    operation: "credential_rotate",
    challengeDigest: DIGEST,
    issuedAt: ISSUED,
    expiresAt: EXPIRES,
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

/**
 * Synthetic compare-and-swap stand-in.
 *
 * JavaScript executes the synchronous conditional section without
 * suspension. The adapter completes the mutation BEFORE yielding.
 * This is a test double, not proof of Azure persistence atomicity.
 */
class SyntheticAtomicRepository
implements OAuthReplayChallengeAtomicRepository {
  record: OAuthOperationReplayChallengeV1 | null = fixture();
  calls = 0;

  async consumeIfAvailable(
    input: Readonly<OAuthReplayConsumptionRequest>
  ): Promise<boolean> {
    this.calls++;

    const record = this.record;
    if (
      !record ||
      !isOAuthOperationReplayChallengeV1(record) ||
      !isOAuthReplayChallengeAvailableV1(
        record,
        input.nowMilliseconds
      ) ||
      record.challengeId !== input.challengeId ||
      record.sessionBindingId !== input.sessionBindingId ||
      record.operation !== input.operation ||
      record.challengeDigest !== input.expectedChallengeDigest ||
      record.revision !== input.expectedRevision ||
      input.expectedRevision >= Number.MAX_SAFE_INTEGER
    ) {
      return false;
    }

    // Atomic conditional check-and-mutation in the synthetic model.
    this.record = {
      ...record,
      consumedAt: new Date(input.nowMilliseconds).toISOString(),
      revision: record.revision + 1
    };

    return true;
  }
}

async function main(): Promise<void> {
  const repo = new SyntheticAtomicRepository();
  const dependencies = { repository: repo };

  assert.equal(isOAuthOperationReplayChallengeV1(repo.record), true);

  assert.deepEqual(
    await consumeOAuthReplayChallenge(request(), dependencies),
    { consumed: true }
  );

  assert.equal(repo.record?.revision, 1);
  assert.equal(
    repo.record?.consumedAt,
    new Date(NOW).toISOString()
  );

  assert.deepEqual(
    await consumeOAuthReplayChallenge(request(), dependencies),
    denied
  );

  // Concurrent requests may have only one committed winner.
  const competing = new SyntheticAtomicRepository();
  const results = await Promise.all(
    Array.from({ length: 40 }, () =>
      consumeOAuthReplayChallenge(
        request(),
        { repository: competing }
      )
    )
  );

  assert.equal(
    results.filter(result => result.consumed).length,
    1
  );
  assert.equal(competing.record?.revision, 1);
  assert.equal(competing.calls, 40);

  // Every mismatch must be denied without mutation.
  const mismatches: Array<Partial<OAuthReplayConsumptionRequest>> = [
    { challengeId: OTHER },
    { sessionBindingId: OTHER },
    { operation: "credential_read" },
    { expectedChallengeDigest: "b".repeat(64) },
    { expectedRevision: 1 },
    { nowMilliseconds: Date.parse(ISSUED) - 1 },
    { nowMilliseconds: Date.parse(EXPIRES) },
    { nowMilliseconds: -1 },
    { nowMilliseconds: Number.NaN },
    { expectedRevision: Number.MAX_SAFE_INTEGER }
  ];

  for (const override of mismatches) {
    const candidate = new SyntheticAtomicRepository();
    assert.deepEqual(
      await consumeOAuthReplayChallenge(
        { ...request(), ...override },
        { repository: candidate }
      ),
      denied
    );
    assert.equal(candidate.record?.consumedAt, null);
    assert.equal(candidate.record?.revision, 0);
  }

  // Invalid inputs must not even invoke storage.
  for (const invalid of [
    null,
    {},
    { ...request(), challengeId: "invalid" },
    { ...request(), expectedChallengeDigest: "A".repeat(64) },
    { ...request(), operation: "unknown_operation" },
    { ...request(), expectedRevision: -1 },
    { ...request(), nowMilliseconds: 0.5 }
  ]) {
    const candidate = new SyntheticAtomicRepository();
    assert.deepEqual(
      await consumeOAuthReplayChallenge(
        invalid,
        { repository: candidate }
      ),
      denied
    );
    assert.equal(candidate.calls, 0);
  }

  // An already-consumed or structurally invalid record fails.
  for (const mutation of [
    { consumedAt: new Date(NOW).toISOString() },
    { schemaVersion: 2 },
    { revision: -1 },
    { expiresAt: ISSUED }
  ]) {
    const candidate = new SyntheticAtomicRepository();
    candidate.record = {
      ...fixture(),
      ...mutation
    } as OAuthOperationReplayChallengeV1;

    assert.deepEqual(
      await consumeOAuthReplayChallenge(
        request(),
        { repository: candidate }
      ),
      denied
    );
  }

  // Repository failures and ambiguous returns fail closed.
  assert.deepEqual(
    await consumeOAuthReplayChallenge(request(), {
      repository: {
        async consumeIfAvailable() {
          throw new Error("synthetic storage unavailable");
        }
      }
    }),
    denied
  );

  assert.deepEqual(
    await consumeOAuthReplayChallenge(request(), {
      repository: {
        async consumeIfAvailable() {
          return undefined as unknown as boolean;
        }
      }
    }),
    denied
  );

  console.log(
    "consumeOAuthReplayChallenge synthetic atomicity tests passed"
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
