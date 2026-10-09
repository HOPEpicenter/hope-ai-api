import assert from "node:assert/strict";

import {
  establishOAuthTrustedSessionBinding,
  type OAuthSessionEstablishmentDependencies,
  type OAuthSessionEstablishmentContext
} from "../../src/services/authorization/establishOAuthTrustedSessionBinding";

import {
  isOAuthAuthoritativeSessionV1
} from "../../src/contracts/oauthAuthoritativeSession.v1";

const tenantId = "11111111-1111-4111-8111-111111111111";
const objectId = "22222222-2222-4222-8222-222222222222";
const firstId = "33333333-3333-4333-8333-333333333333";
const secondId = "44444444-4444-4444-8444-444444444444";

const context: OAuthSessionEstablishmentContext = {
  identity: {
    tenantId,
    objectId,
    staffId: "canonical-staff-one"
  },
  nowMilliseconds: Date.parse("2026-01-01T12:00:00.000Z"),
  lifetimeMilliseconds: 15 * 60 * 1000
};

const denied = {
  created: false,
  reason: "session_establishment_denied"
};

async function main(): Promise<void> {
  const stored = new Map<string, unknown>();

  let counter = 0;

  const dependencies: OAuthSessionEstablishmentDependencies = {
    generateSessionBindingId: () => {
      counter += 1;
      return counter === 1 ? firstId : secondId;
    },
    async createIfAbsent(record) {
      if (stored.has(record.sessionBindingId)) {
        return false;
      }

      stored.set(record.sessionBindingId, { ...record });
      return true;
    }
  };

  const first = await establishOAuthTrustedSessionBinding(
    context, dependencies
  );

  assert.equal(first.created, true);
  assert.equal(stored.size, 1);

  if (!first.created) throw new Error("Expected test session");

  assert.equal(first.record.sessionBindingId, firstId);
  assert.equal(first.record.status, "active");
  assert.equal(first.record.revision, 0);
  assert.equal(isOAuthAuthoritativeSessionV1(first.record), true);

  assert.equal(
    first.record.expiresAt,
    "2026-01-01T12:15:00.000Z"
  );

  const second = await establishOAuthTrustedSessionBinding(
    context, dependencies
  );

  assert.equal(second.created, true);
  assert.equal(stored.size, 2);

  if (!second.created) throw new Error("Expected second session");

  assert.notEqual(
    first.record.sessionBindingId,
    second.record.sessionBindingId
  );

  // A collision must fail closed and never overwrite the record.
  const original = stored.get(firstId);

  const collision = await establishOAuthTrustedSessionBinding(
    context,
    {
      ...dependencies,
      generateSessionBindingId: () => firstId
    }
  );

  assert.deepEqual(collision, denied);
  assert.equal(stored.get(firstId), original);
  assert.equal(stored.size, 2);

  // Reject a repository that refuses the atomic write.
  assert.deepEqual(
    await establishOAuthTrustedSessionBinding(context, {
      generateSessionBindingId: () => firstId,
      createIfAbsent: async () => false
    }),
    denied
  );

  assert.deepEqual(
    await establishOAuthTrustedSessionBinding(context, {
      generateSessionBindingId: () => secondId,
      createIfAbsent: async () => {
        throw new Error("Synthetic storage unavailable");
      }
    }),
    denied
  );

  const invalidContexts = [
    {
      ...context,
      identity: { ...context.identity, tenantId: "invalid" }
    },
    {
      ...context,
      identity: { ...context.identity, objectId: "invalid" }
    },
    {
      ...context,
      identity: { ...context.identity, staffId: "" }
    },
    {
      ...context,
      nowMilliseconds: -1
    },
    {
      ...context,
      nowMilliseconds: Number.NaN
    },
    {
      ...context,
      lifetimeMilliseconds: 0
    },
    {
      ...context,
      lifetimeMilliseconds: 60 * 60 * 1000 + 1
    },
    {
      ...context,
      lifetimeMilliseconds: 0.5
    }
  ];

  for (const invalidContext of invalidContexts) {
    let called = false;

    const result = await establishOAuthTrustedSessionBinding(
      invalidContext,
      {
        generateSessionBindingId: () => firstId,
        async createIfAbsent() {
          called = true;
          return true;
        }
      }
    );

    assert.deepEqual(result, denied);
    assert.equal(called, false);
  }

  for (const invalidId of [
    "",
    "not-a-uuid",
    "FFFFFFFF-FFFF-4FFF-8FFF-FFFFFFFFFFFF"
  ]) {
    let called = false;

    const result = await establishOAuthTrustedSessionBinding(
      context,
      {
        generateSessionBindingId: () => invalidId,
        async createIfAbsent() {
          called = true;
          return true;
        }
      }
    );

    assert.deepEqual(result, denied);
    assert.equal(called, false);
  }

  // Synthetic replay under the same ID does not create a new record.
  const replay = await establishOAuthTrustedSessionBinding(
    context,
    {
      ...dependencies,
      generateSessionBindingId: () => firstId
    }
  );

  assert.deepEqual(replay, denied);

  console.log(
    "establishOAuthTrustedSessionBinding synthetic tests passed"
  );
}

main().catch(() => {
  console.error("Trusted session-binding synthetic tests failed");
  process.exitCode = 1;
});
