import assert from "node:assert/strict";

import {
  inspectOAuthOrderingReconciliation
} from "../../src/services/authorization/inspectOAuthOrderingReconciliation";

import {
  initialOAuthOrderingSnapshot,
  modelOAuthRevocationOrdering
} from "../../src/services/authorization/modelOAuthRevocationOrdering";

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const before = initialOAuthOrderingSnapshot();

const claim = {
  kind: "claim" as const,
  expectedRevision: 0,
  claimId: "synthetic-claim"
};

const modeled = modelOAuthRevocationOrdering(before, claim);

if (!modeled.accepted) {
  throw Error("Expected synthetic transition");
}

const next = modeled.next;

function inspect(
  observed: unknown,
  base: unknown = before,
  command: unknown = claim,
  id: unknown = ID
) {
  const result = inspectOAuthOrderingReconciliation(
    id,
    base,
    command,
    observed
  );

  // These invariants must hold for every outcome.
  assert.equal(result.exactCommitProven, false);
  assert.equal(result.retryPermitted, false);
  assert.equal(result.executionPermitted, false);

  return result.status;
}

// Lost acknowledgement, matching stored snapshot:
// matching state is not proof of an exact commit.
assert.equal(
  inspect(next),
  "consistent_unproven"
);

// No observed update, but a late write may still arrive.
assert.equal(
  inspect(before),
  "not_observed"
);

// A later revision does not establish which attempt won.
assert.equal(
  inspect({
    ...next,
    revision: 2,
    state: "uncertain"
  }),
  "superseded"
);

// Same next revision, conflicting contents.
assert.equal(
  inspect({
    revision: 1,
    state: "revoked",
    claimId: null,
    revocationSource: "staff_deactivation"
  }),
  "unresolved"
);

// Invalid evidence and identity.
for (const observed of [
  null,
  undefined,
  {},
  "missing",
  { ...next, revision: -1 },
  { ...next, state: "invalid" },
  { ...next, claimId: "" }
]) {
  assert.equal(inspect(observed), "unresolved");
}

assert.equal(
  inspect(next, before, claim, "invalid-id"),
  "unresolved"
);

// Untrusted or invalid baseline/command cannot be reconciled.
assert.equal(
  inspect(next, {}, claim),
  "unresolved"
);

assert.equal(
  inspect(next, before, {
    ...claim,
    expectedRevision: 99
  }),
  "unresolved"
);

// Revocation is equally non-authorizing.
const revoke = {
  kind: "revoke" as const,
  expectedRevision: 0,
  source: "staff_deactivation" as const
};

const revoked = modelOAuthRevocationOrdering(
  before,
  revoke
);

if (!revoked.accepted) {
  throw Error("Expected synthetic revocation");
}

assert.equal(
  inspect(revoked.next, before, revoke),
  "consistent_unproven"
);

// Identical revocation metadata can describe
// an indistinguishable attempt.
const anotherRevoke = { ...revoke };

assert.equal(
  inspect(revoked.next, before, anotherRevoke),
  "consistent_unproven"
);

console.log(
  "OAuth ordering read-only reconciliation tests passed"
);
