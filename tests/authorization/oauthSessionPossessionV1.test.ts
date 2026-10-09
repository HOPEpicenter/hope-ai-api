import assert from "node:assert/strict";

import {
  OAUTH_SESSION_POSSESSION_SCHEMA_VERSION,
  isOAuthSessionPossessionVerifierV1,
  isOAuthOperationReplayChallengeV1,
  isOAuthPossessionVerifierActiveV1,
  isOAuthReplayChallengeAvailableV1
} from "../../src/contracts/oauthSessionPossession.v1";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const CHALLENGE_ID = "22222222-2222-4222-8222-222222222222";

const CREATED = "2026-01-01T12:00:00.000Z";
const EXPIRES = "2026-01-01T12:15:00.000Z";
const NOW = Date.parse("2026-01-01T12:05:00.000Z");

const possession = {
  schemaVersion: 1,
  sessionBindingId: SESSION_ID,
  credentialVerifierDigest: "a".repeat(64),
  status: "active",
  createdAt: CREATED,
  expiresAt: EXPIRES,
  revokedAt: null,
  revision: 0
};

const challenge = {
  schemaVersion: 1,
  challengeId: CHALLENGE_ID,
  sessionBindingId: SESSION_ID,
  operation: "credential_rotate",
  challengeDigest: "b".repeat(64),
  issuedAt: CREATED,
  expiresAt: EXPIRES,
  consumedAt: null,
  revision: 0
};

function test(): void {
  assert.equal(OAUTH_SESSION_POSSESSION_SCHEMA_VERSION, 1);

  assert.equal(isOAuthSessionPossessionVerifierV1(possession), true);
  assert.equal(isOAuthOperationReplayChallengeV1(challenge), true);

  assert.equal(isOAuthPossessionVerifierActiveV1(possession, NOW), true);
  assert.equal(isOAuthReplayChallengeAvailableV1(challenge, NOW), true);

  assert.equal(
    "credential" in possession,
    false
  );
  assert.equal(
    "plaintextSecret" in possession,
    false
  );

  assert.equal(
    "plaintextChallenge" in challenge,
    false
  );

  for (const invalid of [
    null,
    [],
    {},
    { ...possession, schemaVersion: 2 },
    { ...possession, sessionBindingId: "invalid" },
    { ...possession, sessionBindingId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" },
    { ...possession, credentialVerifierDigest: "short" },
    { ...possession, credentialVerifierDigest: "A".repeat(64) },
    { ...possession, status: "pending" },
    { ...possession, createdAt: EXPIRES },
    { ...possession, createdAt: "2026-02-30T12:00:00.000Z" },
    { ...possession, expiresAt: CREATED },
    { ...possession, revokedAt: CREATED },
    { ...possession, revision: -1 },
    { ...possession, revision: 0.5 },
    { ...possession, extra: true }
  ]) {
    assert.equal(isOAuthSessionPossessionVerifierV1(invalid), false);
  }

  const revoked = {
    ...possession,
    status: "revoked",
    revokedAt: "2026-01-01T12:03:00.000Z",
    revision: 1
  };

  assert.equal(isOAuthSessionPossessionVerifierV1(revoked), true);
  assert.equal(isOAuthPossessionVerifierActiveV1(revoked, NOW), false);

  assert.equal(
    isOAuthSessionPossessionVerifierV1({
      ...revoked,
      revokedAt: "2026-01-01T11:59:00.000Z"
    }),
    false
  );

  assert.equal(
    isOAuthSessionPossessionVerifierV1({
      ...possession,
      status: "expired"
    }),
    true
  );

  for (const invalid of [
    null,
    [],
    {},
    { ...challenge, schemaVersion: 2 },
    { ...challenge, challengeId: "invalid" },
    { ...challenge, sessionBindingId: "invalid" },
    { ...challenge, operation: "system_admin" },
    { ...challenge, challengeDigest: "short" },
    { ...challenge, challengeDigest: "B".repeat(64) },
    { ...challenge, issuedAt: EXPIRES },
    { ...challenge, expiresAt: CREATED },
    { ...challenge, consumedAt: "invalid" },
    { ...challenge, consumedAt: "2026-01-01T11:59:00.000Z" },
    { ...challenge, revision: -1 },
    { ...challenge, replayed: false }
  ]) {
    assert.equal(isOAuthOperationReplayChallengeV1(invalid), false);
  }

  const consumed = {
    ...challenge,
    consumedAt: "2026-01-01T12:02:00.000Z",
    revision: 1
  };

  assert.equal(isOAuthOperationReplayChallengeV1(consumed), true);
  assert.equal(isOAuthReplayChallengeAvailableV1(consumed, NOW), false);

  for (const clock of [
    Date.parse(CREATED) - 1,
    Date.parse(EXPIRES),
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    0.5
  ]) {
    assert.equal(
      isOAuthPossessionVerifierActiveV1(possession, clock),
      false
    );
    assert.equal(
      isOAuthReplayChallengeAvailableV1(challenge, clock),
      false
    );
  }

  assert.equal(
    isOAuthPossessionVerifierActiveV1(
      possession,
      Date.parse(CREATED)
    ),
    true
  );

  assert.equal(
    isOAuthReplayChallengeAvailableV1(
      challenge,
      Date.parse(CREATED)
    ),
    true
  );

  assert.equal(
    isOAuthPossessionVerifierActiveV1({
      ...possession,
      status: "expired"
    }, NOW),
    false
  );

  console.log("oauthSessionPossessionV1 contract tests passed");
}

test();
