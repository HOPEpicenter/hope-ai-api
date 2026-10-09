import assert from "node:assert/strict";

import {
  generateOAuthSessionPossessionSecret,
  deriveOAuthSessionPossessionDigest,
  verifyOAuthSessionPossession,
  OAUTH_SESSION_SECRET_BYTES
} from "../../src/services/authorization/verifyOAuthSessionPossession";

import {
  isOAuthSessionPossessionVerifierV1
} from "../../src/contracts/oauthSessionPossession.v1";

const SESSION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CREATED = "2026-01-01T12:00:00.000Z";
const EXPIRES = "2026-01-01T12:15:00.000Z";
const NOW = Date.parse("2026-01-01T12:05:00.000Z");

const denied = {
  verified: false,
  reason: "session_possession_denied"
};

function main(): void {
  assert.equal(OAUTH_SESSION_SECRET_BYTES, 32);

  const secret = generateOAuthSessionPossessionSecret();
  const anotherSecret = generateOAuthSessionPossessionSecret();

  assert.equal(secret.length, 43);
  assert.notEqual(secret, anotherSecret);
  assert.equal(Buffer.from(secret, "base64url").length, 32);
  assert.equal(
    Buffer.from(secret, "base64url").toString("base64url"),
    secret
  );

  const digest = deriveOAuthSessionPossessionDigest(
    SESSION_ID,
    secret
  );

  assert.ok(digest);
  assert.match(digest, /^[0-9a-f]{64}$/);

  const record = {
    schemaVersion: 1,
    sessionBindingId: SESSION_ID,
    credentialVerifierDigest: digest,
    status: "active",
    createdAt: CREATED,
    expiresAt: EXPIRES,
    revokedAt: null,
    revision: 0
  };

  assert.equal(isOAuthSessionPossessionVerifierV1(record), true);

  const check = (
    overrides: Record<string, unknown> = {},
    candidate: unknown = secret,
    binding: unknown = SESSION_ID,
    clock: number = NOW
  ) => verifyOAuthSessionPossession({
    sessionBindingId: binding as string,
    credential: candidate as string,
    verifier: { ...record, ...overrides },
    nowMilliseconds: clock
  });

  assert.deepEqual(check(), { verified: true });

  // Repeatability and separation between session bindings.
  assert.equal(
    deriveOAuthSessionPossessionDigest(SESSION_ID, secret),
    digest
  );
  assert.notEqual(
    deriveOAuthSessionPossessionDigest(OTHER_ID, secret),
    digest
  );
  assert.notEqual(
    deriveOAuthSessionPossessionDigest(SESSION_ID, anotherSecret),
    digest
  );

  // Valid but incorrect credentials must be denied.
  assert.deepEqual(check({}, anotherSecret), denied);
  assert.deepEqual(check({}, secret, OTHER_ID), denied);

  // Valid encoding does not establish possession of the
  // correct secret. Even a low-entropy, properly encoded value
  // must fail when it does not match the stored digest.
  const encodedWrongSecret = "A".repeat(43);

  assert.match(encodedWrongSecret, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(
    deriveOAuthSessionPossessionDigest(
      SESSION_ID,
      encodedWrongSecret
    )
  );
  assert.deepEqual(check({}, encodedWrongSecret), denied);
  // Reject malformed and noncanonical secrets.
  for (const invalid of [
    "",
    "short",
    "A".repeat(42) + "!",
    "a".repeat(44),
    "a".repeat(42) + "=",
    "not+url/safe".padEnd(43, "x"),
    null,
    123,
    Buffer.alloc(32)
  ]) {
    assert.equal(
      deriveOAuthSessionPossessionDigest(SESSION_ID, invalid),
      null
    );
    assert.deepEqual(check({}, invalid), denied);
  }

  assert.equal(
    deriveOAuthSessionPossessionDigest("invalid", secret),
    null
  );

  assert.deepEqual(check({
    sessionBindingId: OTHER_ID
  }), denied);

  assert.deepEqual(check({
    credentialVerifierDigest: "0".repeat(64)
  }), denied);

  assert.deepEqual(check({
    credentialVerifierDigest: "F".repeat(64)
  }), denied);

  assert.deepEqual(check({
    status: "revoked",
    revokedAt: "2026-01-01T12:03:00.000Z",
    revision: 1
  }), denied);

  assert.deepEqual(check({
    status: "expired"
  }), denied);

  assert.deepEqual(check({
    extra: true
  }), denied);

  assert.deepEqual(check({
    createdAt: EXPIRES
  }), denied);

  assert.deepEqual(check({
    schemaVersion: 2
  }), denied);

  for (const clock of [
    Date.parse(CREATED) - 1,
    Date.parse(EXPIRES),
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    0.5
  ]) {
    assert.deepEqual(
      check({}, secret, SESSION_ID, clock),
      denied
    );
  }

  assert.deepEqual(
    check({}, secret, SESSION_ID, Date.parse(CREATED)),
    { verified: true }
  );

  // A digest is not itself a usable session credential.
  assert.deepEqual(check({}, digest), denied);

  // No credential or digest values are returned by decisions.
  assert.deepEqual(
    Object.keys(check()).sort(),
    ["verified"]
  );

  assert.deepEqual(
    Object.keys(check({}, anotherSecret)).sort(),
    ["reason", "verified"]
  );

  console.log(
    "verifyOAuthSessionPossession synthetic security tests passed"
  );
}

main();
