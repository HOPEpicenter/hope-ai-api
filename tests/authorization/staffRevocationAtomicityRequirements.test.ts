import assert from "node:assert/strict";

import {
  initialOAuthOrderingSnapshot,
  modelOAuthRevocationOrdering
} from "../../src/services/authorization/modelOAuthRevocationOrdering";

import {
  modelStaffOAuthCoordinationGap,
  type StaffOAuthWriteObservation
} from "../../src/services/authorization/modelStaffOAuthCoordinationGap";

import {
  inspectOAuthFenceStorageReadiness
} from "../../src/services/authorization/inspectOAuthFenceStorageReadiness";

// Revocation commits first: stale claim is rejected.
const initial = initialOAuthOrderingSnapshot();

const revokedFirst = modelOAuthRevocationOrdering(
  initial,
  {
    kind: "revoke",
    expectedRevision: 0,
    source: "staff_deactivation"
  }
);

assert.equal(revokedFirst.accepted, true);
assert.equal(revokedFirst.executionPermitted, false);

if (!revokedFirst.accepted) {
  throw new Error("Expected synthetic revocation");
}

assert.equal(revokedFirst.next.state, "revoked");

const staleClaim = modelOAuthRevocationOrdering(
  revokedFirst.next,
  {
    kind: "claim",
    expectedRevision: 0,
    claimId: "synthetic-claim-1"
  }
);

assert.equal(staleClaim.accepted, false);
assert.equal(staleClaim.executionPermitted, false);

// Claim exists first: revocation becomes pending.
const claimFirst = modelOAuthRevocationOrdering(
  initial,
  {
    kind: "claim",
    expectedRevision: 0,
    claimId: "synthetic-claim-2"
  }
);

assert.equal(claimFirst.accepted, true);

if (!claimFirst.accepted) {
  throw new Error("Expected synthetic claim");
}

assert.equal(claimFirst.executionPermitted, false);

const revokeAfterClaim = modelOAuthRevocationOrdering(
  claimFirst.next,
  {
    kind: "revoke",
    expectedRevision: 1,
    source: "entra_binding_change"
  }
);

assert.equal(revokeAfterClaim.accepted, true);

if (!revokeAfterClaim.accepted) {
  throw new Error("Expected pending revocation");
}

assert.equal(revokeAfterClaim.next.state, "revocation_pending");
assert.equal(revokeAfterClaim.executionPermitted, false);

const claimDuringPending = modelOAuthRevocationOrdering(
  revokeAfterClaim.next,
  {
    kind: "claim",
    expectedRevision: 2,
    claimId: "synthetic-claim-3"
  }
);

assert.equal(claimDuringPending.accepted, false);

// Competing revocations cannot reuse a stale revision.
const competing = modelOAuthRevocationOrdering(
  revokedFirst.next,
  {
    kind: "revoke",
    expectedRevision: 0,
    source: "entra_binding_change"
  }
);

assert.equal(competing.accepted, false);
assert.equal(competing.executionPermitted, false);

// An unresolved claim never becomes execution authority.
const uncertainClaim = modelOAuthRevocationOrdering(
  revokeAfterClaim.next,
  {
    kind: "mark_uncertain",
    expectedRevision: 2,
    claimId: "synthetic-claim-2"
  }
);

assert.equal(uncertainClaim.accepted, true);

if (!uncertainClaim.accepted) {
  throw new Error("Expected uncertain model transition");
}

assert.equal(uncertainClaim.next.state, "uncertain");
assert.equal(uncertainClaim.executionPermitted, false);

const claimAfterUncertainty = modelOAuthRevocationOrdering(
  uncertainClaim.next,
  {
    kind: "claim",
    expectedRevision: 3,
    claimId: "synthetic-claim-4"
  }
);

assert.equal(claimAfterUncertainty.accepted, false);

// Independent write observations never prove atomicity.
const observations: StaffOAuthWriteObservation[] = [
  "committed",
  "not_committed",
  "uncertain"
];

let cases = 0;

for (const staffEvent of observations) {
  for (const oauthReceipt of observations) {
    const result = modelStaffOAuthCoordinationGap({
      staffEvent,
      oauthReceipt
    });

    assert.equal(result.atomicCoordinationDemonstrated, false);
    assert.equal(result.executionPermitted, false);
    assert.equal(result.retryPermitted, false);
    assert.equal(result.safeToTreatAsRevoked, false);
    cases += 1;
  }
}

assert.equal(cases, 9);

// Global execution fence remains fail-closed.
const gate = inspectOAuthFenceStorageReadiness();

assert.equal(gate.storageProtocolReady, false);
assert.equal(gate.executionPermitted, false);
assert.equal(gate.requiresAtomicCoordination, true);

assert.ok(
  gate.blockers.includes("atomic_ordering_not_demonstrated")
);

assert.ok(
  gate.blockers.includes(
    "external_execution_cancellation_not_demonstrated"
  )
);

console.log(
  "Staff revocation atomicity requirements synthetic tests passed"
);
