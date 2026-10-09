import assert from "node:assert/strict";

import {
  isOAuthAuthoritativeSessionV1,
  isOAuthSessionCurrentlyActiveV1
} from "../../src/contracts/oauthAuthoritativeSession.v1";

const createdAt = "2026-01-01T12:00:00.000Z";
const expiresAt = "2026-01-01T13:00:00.000Z";

const record = {
  schemaVersion: 1,
  sessionBindingId: "11111111-1111-4111-8111-111111111111",
  tenantId: "22222222-2222-4222-8222-222222222222",
  entraObjectId: "33333333-3333-4333-8333-333333333333",
  canonicalStaffId: "canonical-staff-test",
  status: "active",
  createdAt,
  expiresAt,
  revokedAt: null,
  revision: 0
};

assert.equal(isOAuthAuthoritativeSessionV1(record), true);

const during = Date.parse("2026-01-01T12:30:00.000Z");

assert.equal(isOAuthSessionCurrentlyActiveV1(record, during), true);
assert.equal(
  isOAuthSessionCurrentlyActiveV1(record, Date.parse(createdAt)),
  true
);
assert.equal(
  isOAuthSessionCurrentlyActiveV1(record, Date.parse(expiresAt)),
  false
);
assert.equal(
  isOAuthSessionCurrentlyActiveV1(
    record, Date.parse(createdAt) - 1
  ),
  false
);

const revoked = {
  ...record,
  status: "revoked",
  revokedAt: "2026-01-01T12:15:00.000Z",
  revision: 1
};

assert.equal(isOAuthAuthoritativeSessionV1(revoked), true);
assert.equal(isOAuthSessionCurrentlyActiveV1(revoked, during), false);

const expired = { ...record, status: "expired" };

assert.equal(isOAuthAuthoritativeSessionV1(expired), true);
assert.equal(isOAuthSessionCurrentlyActiveV1(expired, during), false);

const invalid = [
  null,
  [],
  {},
  { ...record, schemaVersion: 2 },
  { ...record, sessionBindingId: "" },
  { ...record, tenantId: "invalid" },
  { ...record, entraObjectId: "invalid" },
  { ...record, canonicalStaffId: " " },
  { ...record, status: "pending" },
  { ...record, revision: -1 },
  { ...record, revision: 0.5 },
  { ...record, createdAt: "2026-02-30T12:00:00.000Z" },
  { ...record, expiresAt: createdAt },
  { ...record, expiresAt: "2025-12-31T12:00:00.000Z" },
  { ...record, createdAt: "2026-01-01" },
  { ...record, revokedAt: "2026-01-01T12:15:00.000Z" },
  { ...record, status: "revoked", revokedAt: null },
  {
    ...record,
    status: "revoked",
    revokedAt: "2025-12-31T12:00:00.000Z"
  },
  { ...record, status: "expired", revokedAt: createdAt },
  { ...record, extraField: true }
];

for (const item of invalid) {
  assert.equal(
    isOAuthAuthoritativeSessionV1(item),
    false,
    "Invalid session record must be rejected"
  );
}

for (const clock of [
  Number.NaN,
  Number.POSITIVE_INFINITY,
  -1,
  0.5
]) {
  assert.equal(
    isOAuthSessionCurrentlyActiveV1(record, clock),
    false
  );
}

// The record is data, not a bearer token or authorization decision.
// The contract does not expose a function that creates a session,
// authenticates an actor, or grants credential access.
console.log("oauthAuthoritativeSessionV1 contract tests passed");
