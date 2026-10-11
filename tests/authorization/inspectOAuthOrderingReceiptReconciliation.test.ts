import assert from "node:assert/strict";

import {
  inspectOAuthOrderingReceiptReconciliation
} from "../../src/services/authorization/inspectOAuthOrderingReceiptReconciliation";

import {
  initialOAuthOrderingReceiptEnvelope,
  modelOAuthOrderingReceiptTransition
} from "../../src/services/authorization/modelOAuthOrderingTransitionReceipts";

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const C = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const initial = initialOAuthOrderingReceiptEnvelope();

const claim = {
  kind: "claim" as const,
  expectedRevision: 0,
  claimId: "synthetic-worker"
};

const first = modelOAuthOrderingReceiptTransition(
  initial, A, claim
);

if (!first.accepted) {
  throw Error("Expected synthetic claim");
}

const revoke = {
  kind: "revoke" as const,
  expectedRevision: 1,
  source: "staff_deactivation" as const
};

const second = modelOAuthOrderingReceiptTransition(
  first.next, B, revoke
);

if (!second.accepted) {
  throw Error("Expected synthetic revocation");
}

const uncertain = modelOAuthOrderingReceiptTransition(
  second.next, C, {
    kind: "mark_uncertain",
    expectedRevision: 2,
    claimId: "synthetic-worker"
  }
);

if (!uncertain.accepted) {
  throw Error("Expected synthetic uncertainty");
}

function inspect(
  attemptId: unknown,
  before: unknown,
  command: unknown,
  envelope: unknown,
  coordinationId: unknown = ID
): string {
  const outcome = inspectOAuthOrderingReceiptReconciliation(
    coordinationId,
    attemptId,
    before,
    command,
    envelope
  );

  assert.equal(outcome.retryPermitted, false);
  assert.equal(outcome.executionPermitted, false);

  return outcome.status;
}

// Receipt identified at the first revision.
assert.equal(
  inspect(A, initial.snapshot, claim, first.next),
  "recorded"
);

// First attempt remains identifiable after later writes.
assert.equal(
  inspect(A, initial.snapshot, claim, uncertain.next),
  "recorded"
);

// Second attempt is independently identifiable.
assert.equal(
  inspect(B, first.next.snapshot, revoke, uncertain.next),
  "recorded"
);

// A valid envelope without this attempt does not
// prove a delayed or uncertain write can never commit.
assert.equal(
  inspect(C, initial.snapshot, claim, first.next),
  "absent_unproven"
);

assert.equal(
  inspect(A, initial.snapshot, claim, initial),
  "absent_unproven"
);

// Same attempt ID, different command must not match.
assert.equal(
  inspect(A, initial.snapshot, {
    ...claim,
    claimId: "another-worker"
  }, uncertain.next),
  "conflicting_evidence"
);

// Same attempt ID, different operation must not match.
assert.equal(
  inspect(A, initial.snapshot, {
    kind: "revoke",
    expectedRevision: 0,
    source: "session_revocation"
  }, uncertain.next),
  "conflicting_evidence"
);

// Matching command with a different historical baseline
// cannot establish the requested transition.
assert.equal(
  inspect(B, initial.snapshot, claim, uncertain.next),
  "conflicting_evidence"
);

// Inconsistent or tampered receipt histories fail closed.
const tampered = {
  ...uncertain.next,
  receipts: uncertain.next.receipts.map((receipt, i) =>
    i === 0
      ? { ...receipt, toRevision: 99 }
      : receipt
  )
};

assert.equal(
  inspect(A, initial.snapshot, claim, tampered),
  "unresolved"
);

assert.equal(
  inspect(A, initial.snapshot, claim, {
    ...first.next,
    snapshot: {
      ...first.next.snapshot,
      revision: 99
    }
  }),
  "unresolved"
);

// All invalid input and missing-evidence paths fail closed.
for (const envelope of [
  null,
  {},
  "missing",
  {
    schemaVersion: 1,
    snapshot: initial.snapshot,
    receipts: []
  }
]) {
  assert.equal(
    inspect(A, initial.snapshot, claim, envelope),
    "unresolved"
  );
}

assert.equal(
  inspect("wrong", initial.snapshot, claim, first.next),
  "unresolved"
);

assert.equal(
  inspect(A, initial.snapshot, claim, first.next, "wrong"),
  "unresolved"
);

assert.equal(
  inspect(A, {}, claim, first.next),
  "unresolved"
);

assert.equal(
  inspect(A, initial.snapshot, {
    ...claim,
    expectedRevision: 5
  }, first.next),
  "unresolved"
);

assert.equal(
  inspect(A, initial.snapshot, {
    ...claim,
    unexpected: true
  }, first.next),
  "unresolved"
);

console.log(
  "OAuth V2 receipt reconciliation model tests passed"
);
