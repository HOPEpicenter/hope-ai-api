import assert from "node:assert/strict";

import {
  initialOAuthOrderingReceiptEnvelope,
  isOAuthOrderingReceiptEnvelope,
  modelOAuthOrderingReceiptTransition,
  MAX_OAUTH_ORDERING_RECEIPTS
} from "../../src/services/authorization/modelOAuthOrderingTransitionReceipts";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function verifyNonAuthorizing(result: {
  retryPermitted: false;
  executionPermitted: false;
}) {
  assert.equal(result.retryPermitted, false);
  assert.equal(result.executionPermitted, false);
}

const initial = initialOAuthOrderingReceiptEnvelope();

assert.equal(isOAuthOrderingReceiptEnvelope(initial), true);
assert.equal(initial.snapshot.revision, 0);
assert.equal(initial.receipts.length, 0);

const claimCommand = {
  kind: "claim" as const,
  expectedRevision: 0,
  claimId: "synthetic-claim"
};

const claimed = modelOAuthOrderingReceiptTransition(
  initial, A, claimCommand
);

verifyNonAuthorizing(claimed);
assert.equal(claimed.accepted, true);

if (!claimed.accepted) throw Error("Expected claim candidate");

assert.equal(claimed.next.snapshot.state, "claimed");
assert.equal(claimed.next.snapshot.revision, 1);
assert.equal(claimed.next.receipts.length, 1);
assert.equal(claimed.next.receipts[0].attemptId, A);
assert.equal(claimed.next.receipts[0].fromRevision, 0);
assert.equal(claimed.next.receipts[0].toRevision, 1);
assert.equal(isOAuthOrderingReceiptEnvelope(claimed.next), true);

// Same attempt ID must never create another receipt.
const duplicate = modelOAuthOrderingReceiptTransition(
  claimed.next, A, {
    kind: "revoke",
    expectedRevision: 1,
    source: "session_revocation"
  }
);

verifyNonAuthorizing(duplicate);
assert.equal(duplicate.accepted, false);
if (!duplicate.accepted) {
  assert.equal(duplicate.reason, "duplicate_attempt");
}

// New attempt can produce the next valid transition.
const revoked = modelOAuthOrderingReceiptTransition(
  claimed.next, B, {
    kind: "revoke",
    expectedRevision: 1,
    source: "staff_deactivation"
  }
);

verifyNonAuthorizing(revoked);
assert.equal(revoked.accepted, true);

if (!revoked.accepted) throw Error("Expected revocation");

assert.equal(revoked.next.snapshot.state, "revocation_pending");
assert.equal(revoked.next.snapshot.revision, 2);
assert.deepEqual(
  revoked.next.receipts.map(receipt => receipt.attemptId),
  [A, B]
);

// Later evidence preserves both receipt identities.
const uncertain = modelOAuthOrderingReceiptTransition(
  revoked.next, C, {
    kind: "mark_uncertain",
    expectedRevision: 2,
    claimId: "synthetic-claim"
  }
);

verifyNonAuthorizing(uncertain);
assert.equal(uncertain.accepted, true);

if (!uncertain.accepted) throw Error("Expected uncertain");

assert.equal(uncertain.next.snapshot.state, "uncertain");
assert.deepEqual(
  uncertain.next.receipts.map(receipt => receipt.attemptId),
  [A, B, C]
);
assert.equal(
  isOAuthOrderingReceiptEnvelope(uncertain.next),
  true
);

// Revision mismatches cannot produce a new receipt.
const stale = modelOAuthOrderingReceiptTransition(
  claimed.next, C, {
    kind: "revoke",
    expectedRevision: 0,
    source: "session_revocation"
  }
);

verifyNonAuthorizing(stale);
assert.equal(stale.accepted, false);

// Tampering with history or current state is rejected.
const alteredReceipt = {
  ...claimed.next,
  receipts: [{
    ...claimed.next.receipts[0],
    attemptId: B,
    toRevision: 2
  }]
};

assert.equal(
  isOAuthOrderingReceiptEnvelope(alteredReceipt),
  false
);

assert.equal(
  isOAuthOrderingReceiptEnvelope({
    ...claimed.next,
    snapshot: {
      ...claimed.next.snapshot,
      state: "revoked"
    }
  }),
  false
);

assert.equal(
  isOAuthOrderingReceiptEnvelope({
    ...claimed.next,
    receipts: [
      ...claimed.next.receipts,
      claimed.next.receipts[0]
    ]
  }),
  false
);

// No silent truncation or unbounded receipt growth.
assert.equal(
  isOAuthOrderingReceiptEnvelope({
    ...initial,
    receipts: Array(
      MAX_OAUTH_ORDERING_RECEIPTS + 1
    ).fill(claimed.next.receipts[0])
  }),
  false
);

// Malformed identifiers, commands and legacy records fail closed.
for (const input of [
  null,
  {},
  {
    schemaVersion: 1,
    snapshot: initial.snapshot,
    receipts: []
  },
  {
    ...initial,
    unexpected: true
  }
]) {
  assert.equal(
    modelOAuthOrderingReceiptTransition(
      input, A, claimCommand
    ).accepted,
    false
  );
}

for (const id of ["", "*", "not-a-uuid"]) {
  assert.equal(
    modelOAuthOrderingReceiptTransition(
      initial, id, claimCommand
    ).accepted,
    false
  );
}

assert.equal(
  modelOAuthOrderingReceiptTransition(
    initial, A, {
      ...claimCommand,
      unexpected: true
    }
  ).accepted,
  false
);

assert.equal(
  modelOAuthOrderingReceiptTransition(
    initial, A, {
      kind: "claim",
      expectedRevision: 0,
      claimId: ""
    }
  ).accepted,
  false
);

console.log(
  "OAuth ordering transition receipt model tests passed"
);
