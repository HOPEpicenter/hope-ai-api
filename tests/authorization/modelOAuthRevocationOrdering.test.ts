import assert from "node:assert/strict";

import {
  initialOAuthOrderingSnapshot,
  modelOAuthRevocationOrdering,
  type OAuthOrderingSnapshot,
  type OAuthOrderingCommand
} from "../../src/services/authorization/modelOAuthRevocationOrdering";

function win(
  snapshot: OAuthOrderingSnapshot,
  command: OAuthOrderingCommand
): OAuthOrderingSnapshot {
  const result = modelOAuthRevocationOrdering(snapshot, command);
  assert.equal(result.accepted, true);
  assert.equal(result.executionPermitted, false);
  if (!result.accepted) throw Error("Unexpected denial");
  return result.next;
}

function lose(
  snapshot: OAuthOrderingSnapshot,
  command: OAuthOrderingCommand
): void {
  const result = modelOAuthRevocationOrdering(snapshot, command);
  assert.equal(result.accepted, false);
  assert.equal(result.executionPermitted, false);
}

function main(): void {
  const initial = initialOAuthOrderingSnapshot();

  // Revocation committed first: stale claim cannot win.
  for (const source of [
    "staff_deactivation",
    "entra_binding_change",
    "session_revocation",
    "credential_revocation",
    "credential_rotation"
  ] as const) {
    const revoked = win(initial, {
      kind: "revoke", expectedRevision: 0, source
    });
    assert.equal(revoked.state, "revoked");
    assert.equal(revoked.revision, 1);
    lose(revoked, {
      kind: "claim", expectedRevision: 0, claimId: "claim-a"
    });
    lose(revoked, {
      kind: "claim", expectedRevision: 1, claimId: "claim-a"
    });
  }

  // Claim committed first: competing claim loses.
  const claimed = win(initial, {
    kind: "claim", expectedRevision: 0, claimId: "claim-a"
  });
  assert.equal(claimed.state, "claimed");

  lose(claimed, {
    kind: "claim", expectedRevision: 0, claimId: "claim-b"
  });
  lose(claimed, {
    kind: "claim", expectedRevision: 1, claimId: "claim-b"
  });

  // Revocation after claim becomes pending, not cancelled.
  const pending = win(claimed, {
    kind: "revoke",
    expectedRevision: 1,
    source: "staff_deactivation"
  });
  assert.equal(pending.state, "revocation_pending");
  assert.equal(pending.revocationSource, "staff_deactivation");

  lose(pending, {
    kind: "complete", expectedRevision: 2, claimId: "claim-a"
  });
  lose(pending, {
    kind: "claim", expectedRevision: 2, claimId: "claim-b"
  });

  // Crash / lost acknowledgement produces unresolved state.
  const uncertain = win(pending, {
    kind: "mark_uncertain",
    expectedRevision: 2,
    claimId: "claim-a"
  });
  assert.equal(uncertain.state, "uncertain");
  assert.equal(uncertain.revocationSource, "staff_deactivation");

  lose(uncertain, {
    kind: "claim", expectedRevision: 3, claimId: "claim-b"
  });
  lose(uncertain, {
    kind: "complete", expectedRevision: 3, claimId: "claim-a"
  });

  // Unknown outcome without revocation is also terminal
  // in this model until a future proven reconciliation path.
  const uncertainDirect = win(claimed, {
    kind: "mark_uncertain",
    expectedRevision: 1,
    claimId: "claim-a"
  });
  assert.equal(uncertainDirect.state, "uncertain");

  // Successful simulated completion cannot be replayed.
  const completed = win(claimed, {
    kind: "complete", expectedRevision: 1, claimId: "claim-a"
  });
  lose(completed, {
    kind: "complete", expectedRevision: 2, claimId: "claim-a"
  });
  lose(completed, {
    kind: "claim", expectedRevision: 2, claimId: "claim-b"
  });

  // Revocation may be modeled after completion.
  const lateRevoke = win(completed, {
    kind: "revoke",
    expectedRevision: 2,
    source: "session_revocation"
  });
  assert.equal(lateRevoke.state, "revoked");

  // All pure transitions leave their input snapshot intact.
  assert.equal(initial.state, "idle");
  assert.equal(initial.revision, 0);
  assert.equal(claimed.state, "claimed");
  assert.equal(claimed.revision, 1);

  lose(initial, {
    kind: "claim", expectedRevision: -1, claimId: "claim-a"
  });
  lose(initial, {
    kind: "claim", expectedRevision: 0, claimId: ""
  });

  assert.equal(
    modelOAuthRevocationOrdering(null, null).accepted,
    false
  );
  assert.equal(
    modelOAuthRevocationOrdering(
      { state: "idle", revision: Number.NaN },
      { kind: "claim", expectedRevision: 0, claimId: "a" }
    ).accepted,
    false
  );

  // Two candidate writes evaluated against the same
  // version would each be eligible in isolation.
  // Only an external atomic CAS repository can ensure
  // that one commit wins; this test makes that gap clear.
  const candidateA = modelOAuthRevocationOrdering(initial, {
    kind: "claim", expectedRevision: 0, claimId: "claim-a"
  });
  const candidateB = modelOAuthRevocationOrdering(initial, {
    kind: "claim", expectedRevision: 0, claimId: "claim-b"
  });
  assert.equal(candidateA.accepted, true);
  assert.equal(candidateB.accepted, true);

  console.log(
    "OAuth shared revocation ordering synthetic tests passed"
  );
}

main();
