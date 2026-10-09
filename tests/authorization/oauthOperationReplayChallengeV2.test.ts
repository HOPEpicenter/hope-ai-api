import assert from "node:assert/strict";

import {
  isOAuthOperationReplayChallengeV1
} from "../../src/contracts/oauthSessionPossession.v1";

import {
  OAUTH_REPLAY_CHALLENGE_SCHEMA_VERSION_V2,
  isOAuthOperationReplayChallengeV2,
  isOAuthReplayChallengeAvailableV2
} from "../../src/contracts/oauthOperationReplayChallenge.v2";

const ISSUED = "2026-01-01T12:00:00.000Z";
const EXPIRES = "2026-01-01T12:05:00.000Z";
const NOW = Date.parse("2026-01-01T12:02:00.000Z");

const valid = {
  schemaVersion: 2,
  challengeId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  sessionBindingId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  credentialId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  operation: "credential_read",
  challengeDigest: "a".repeat(64),
  issuedAt: ISSUED,
  expiresAt: EXPIRES,
  consumedAt: null,
  revision: 0
};

assert.equal(OAUTH_REPLAY_CHALLENGE_SCHEMA_VERSION_V2, 2);
assert.equal(isOAuthOperationReplayChallengeV2(valid), true);
assert.equal(isOAuthReplayChallengeAvailableV2(valid, NOW), true);

// V2 is never silently accepted as V1.
assert.equal(isOAuthOperationReplayChallengeV1(valid), false);

// V1 cannot masquerade as a credential-specific challenge.
const { credentialId, ...withoutCredential } = valid;

assert.equal(
  isOAuthOperationReplayChallengeV2({
    ...withoutCredential,
    schemaVersion: 1
  }),
  false
);

assert.equal(
  isOAuthOperationReplayChallengeV2(withoutCredential),
  false
);

// Exact-field enforcement and canonical credential identifiers.
for (const changed of [
  { credentialId: "" },
  { credentialId: "not-a-uuid" },
  { credentialId: "CCCCCCCC-CCCC-4CCC-8CCC-CCCCCCCCCCCC" },
  { schemaVersion: 1 },
  { schemaVersion: 3 },
  { challengeDigest: "invalid" },
  { operation: "invalid" },
  { expiresAt: ISSUED },
  { revision: -1 }
]) {
  assert.equal(
    isOAuthOperationReplayChallengeV2({
      ...valid,
      ...changed
    }),
    false
  );
}

assert.equal(
  isOAuthOperationReplayChallengeV2({
    ...valid,
    unexpected: true
  }),
  false
);

// The V2 contract remains strict about time and consumption.
for (const clock of [
  Date.parse(ISSUED) - 1,
  Date.parse(EXPIRES),
  Date.parse(EXPIRES) + 1,
  -1,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  0.5
]) {
  assert.equal(
    isOAuthReplayChallengeAvailableV2(valid, clock),
    false
  );
}

assert.equal(
  isOAuthReplayChallengeAvailableV2({
    ...valid,
    consumedAt: new Date(NOW).toISOString(),
    revision: 1
  }, NOW),
  false
);

// Contract validation alone does not match a requested credential.
// The coordinator and storage adapter must both enforce that match.
const otherCredential = {
  ...valid,
  credentialId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
};

assert.equal(
  isOAuthOperationReplayChallengeV2(otherCredential),
  true
);

assert.notEqual(
  otherCredential.credentialId,
  valid.credentialId
);

console.log(
  "oauthOperationReplayChallengeV2 strict contract tests passed"
);
