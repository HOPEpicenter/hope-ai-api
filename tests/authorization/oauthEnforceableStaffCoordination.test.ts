import assert from "node:assert/strict";

/**
 * Synthetic architecture decision regression.
 *
 * These models are deliberately NOT production authority.
 * They do not write storage, authorize staff mutations,
 * or issue OAuth execution capabilities.
 */

type ModelState = {
  revision: number;
  revoked: boolean;
  bindings: Map<string, string>;
};

type Evidence = {
  staffEventCommitted: boolean;
  coordinatedCommit: boolean;
  canonicalIdentityKnown: boolean;
  legacyBypassPossible: boolean;
};

function bindingKey(tenant: string, object: string): string {
  return `${tenant.trim().toLowerCase()}|${object.trim().toLowerCase()}`;
}

function sharedBindingDecision(
  state: ModelState,
  expectedRevision: number,
  key: string,
  staffId: string
): boolean {
  if (state.revision !== expectedRevision) return false;
  if (state.revoked) return false;
  if (state.bindings.has(key)) return false;

  state.bindings.set(key, staffId);
  state.revision++;
  return true;
}

function evidenceIsSufficient(evidence: Evidence): boolean {
  return (
    evidence.staffEventCommitted &&
    evidence.coordinatedCommit &&
    evidence.canonicalIdentityKnown &&
    !evidence.legacyBypassPossible
  );
}

function syntheticExecutionDecision(
  _evidence: Evidence
): { executionPermitted: false; retryPermitted: false } {
  // No synthetic evidence is an OAuth execution capability.
  return {
    executionPermitted: false,
    retryPermitted: false
  };
}

function main(): void {
  const key = bindingKey(
    " TENANT-A ",
    "OBJECT-B"
  );

  assert.equal(
    key,
    bindingKey("tenant-a", "object-b")
  );

  const shared: ModelState = {
    revision: 0,
    revoked: false,
    bindings: new Map()
  };

  const contenders = ["staff-one", "staff-two"];
  const initialRevision = shared.revision;

  const accepted = contenders.map(staffId =>
    sharedBindingDecision(
      shared,
      initialRevision,
      key,
      staffId
    )
  );

  assert.equal(accepted.filter(Boolean).length, 1);
  assert.equal(shared.bindings.size, 1);
  assert.equal(shared.revision, 1);

  console.log(
    "Shared authority binding contention model passed"
  );

  // Independent per-staff partitions can each accept
  // the same external identity without a common index.
  const perStaffA: ModelState = {
    revision: 0,
    revoked: false,
    bindings: new Map()
  };

  const perStaffB: ModelState = {
    revision: 0,
    revoked: false,
    bindings: new Map()
  };

  assert.equal(
    sharedBindingDecision(perStaffA, 0, key, "staff-one"),
    true
  );

  assert.equal(
    sharedBindingDecision(perStaffB, 0, key, "staff-two"),
    true
  );

  assert.notEqual(
    perStaffA.bindings.get(key),
    perStaffB.bindings.get(key)
  );

  console.log(
    "Per-staff partition uniqueness limitation demonstrated"
  );

  // A successful legacy append is not coordinated.
  const legacyEvidence: Evidence = {
    staffEventCommitted: true,
    coordinatedCommit: false,
    canonicalIdentityKnown: true,
    legacyBypassPossible: true
  };

  assert.equal(
    evidenceIsSufficient(legacyEvidence),
    false
  );

  assert.deepEqual(
    syntheticExecutionDecision(legacyEvidence),
    {
      executionPermitted: false,
      retryPermitted: false
    }
  );

  console.log(
    "Legacy writer bypass remains non-authorizing"
  );

  // A compatibility identity is not evidence that
  // its writer participated in the ordering authority.
  const compatibilityEvidence: Evidence = {
    staffEventCommitted: false,
    coordinatedCommit: false,
    canonicalIdentityKnown: false,
    legacyBypassPossible: true
  };

  assert.equal(
    evidenceIsSufficient(compatibilityEvidence),
    false
  );

  console.log(
    "Compatibility fallback cannot establish participation"
  );

  // Even apparently coordinated storage evidence
  // cannot grant execution without executor fencing.
  const coordinatedEvidence: Evidence = {
    staffEventCommitted: true,
    coordinatedCommit: true,
    canonicalIdentityKnown: true,
    legacyBypassPossible: false
  };

  assert.equal(
    evidenceIsSufficient(coordinatedEvidence),
    true
  );

  assert.deepEqual(
    syntheticExecutionDecision(coordinatedEvidence),
    {
      executionPermitted: false,
      retryPermitted: false
    }
  );

  console.log(
    "Coordinated evidence alone grants no execution"
  );

  // Two independent successful commits do not
  // establish one atomic transaction boundary.
  const independentEvidence: Evidence = {
    staffEventCommitted: true,
    coordinatedCommit: false,
    canonicalIdentityKnown: true,
    legacyBypassPossible: false
  };

  assert.equal(
    evidenceIsSufficient(independentEvidence),
    false
  );

  console.log(
    "Independent successful writes remain non-authorizing"
  );

  console.log(
    "OAuth enforceable staff coordination synthetic tests passed"
  );
}

main();
