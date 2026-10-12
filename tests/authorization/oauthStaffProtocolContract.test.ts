import assert from "node:assert/strict";

/**
 * Proposed protocol contract MODEL, not production enforcement.
 *
 * No Table SDK, Azure calls, staff mutations, Graph calls,
 * real tokens, OAuth execution or automatic retries.
 *
 * This models required decisions. Production repositories
 * must implement and independently prove them later.
 */

type StaffState = "active" | "revoked";

type Authority = {
  revision: number;
  bindings: Map<string, string>;
  staff: Map<string, StaffState>;
  operations: Set<string>;
};

type Decision =
  | "committed"
  | "duplicate_binding"
  | "revoked"
  | "stale"
  | "replayed"
  | "unverified";

type Evidence = {
  coordinated: boolean;
  canonical: boolean;
  legacyBypassPossible: boolean;
  invitationUncertain: boolean;
};

const storageProtocolReady = false;
const executionPermitted = false;
const retryPermitted = false;

function createAuthority(): Authority {
  return {
    revision: 0,
    bindings: new Map(),
    staff: new Map(),
    operations: new Set()
  };
}

function bind(
  state: Authority,
  key: string,
  staffId: string,
  expectedRevision: number,
  operationId: string
): Decision {
  if (state.operations.has(operationId)) {
    return "replayed";
  }

  if (state.revision !== expectedRevision) {
    return "stale";
  }

  const owner = state.bindings.get(key);

  if (owner && owner !== staffId) {
    return "duplicate_binding";
  }

  state.bindings.set(key, staffId);
  state.staff.set(staffId, "active");
  state.operations.add(operationId);
  state.revision++;

  return "committed";
}

function revoke(
  state: Authority,
  staffId: string,
  expectedRevision: number,
  operationId: string
): Decision {
  if (state.operations.has(operationId)) {
    return "replayed";
  }

  if (state.revision !== expectedRevision) {
    return "stale";
  }

  if (!state.staff.has(staffId)) {
    return "unverified";
  }

  state.staff.set(staffId, "revoked");
  state.operations.add(operationId);
  state.revision++;

  return "committed";
}

function claimDecision(
  state: Authority,
  staffId: string,
  expectedRevision: number,
  operationId: string
): Decision {
  if (state.operations.has(operationId)) {
    return "replayed";
  }

  if (state.revision !== expectedRevision) {
    return "stale";
  }

  // State must be checked even for a fresh revision.
  if (state.staff.get(staffId) !== "active") {
    return "revoked";
  }

  // This synthetic operation only records ordering.
  // It never grants external OAuth execution.
  state.operations.add(operationId);
  state.revision++;

  return "committed";
}

function evidenceAcceptable(evidence: Evidence): boolean {
  return (
    evidence.coordinated &&
    evidence.canonical &&
    !evidence.legacyBypassPossible &&
    !evidence.invitationUncertain
  );
}

function oauthPermission(
  _evidence: Evidence
): {
  storageProtocolReady: false;
  executionPermitted: false;
  retryPermitted: false;
} {
  return {
    storageProtocolReady: false,
    executionPermitted: false,
    retryPermitted: false
  };
}

function main(): void {
  const authority = createAuthority();
  const binding = "normalized-tenant|normalized-object";

  assert.equal(
    bind(authority, binding, "staff-a", 0, "op-bind-a"),
    "committed"
  );

  const beforeConflict = authority.revision;

  assert.equal(
    bind(
      authority,
      binding,
      "staff-b",
      beforeConflict,
      "op-bind-b"
    ),
    "duplicate_binding"
  );

  assert.equal(authority.bindings.get(binding), "staff-a");
  assert.equal(authority.revision, beforeConflict);

  console.log("Proposed global binding ownership rule passed");

  assert.equal(
    bind(authority, binding, "staff-a", 0, "op-stale"),
    "stale"
  );

  assert.equal(
    bind(authority, binding, "staff-a", 1, "op-bind-a"),
    "replayed"
  );

  console.log("Proposed stale and replay protection passed");

  assert.equal(
    revoke(authority, "staff-a", 1, "op-revoke"),
    "committed"
  );

  const freshRevision = authority.revision;

  assert.equal(
    claimDecision(
      authority,
      "staff-a",
      freshRevision,
      "op-claim-after-revoke"
    ),
    "revoked"
  );

  assert.equal(authority.revision, freshRevision);

  console.log("Fresh-revision claim after revocation denied");

  assert.equal(
    claimDecision(
      authority,
      "staff-a",
      1,
      "op-stale-claim"
    ),
    "stale"
  );

  console.log("Stale claim remains denied");

  // Neither an uncoordinated legacy event nor a
  // compatibility registry entry is authoritative.
  const legacyEvidence: Evidence = {
    coordinated: false,
    canonical: true,
    legacyBypassPossible: true,
    invitationUncertain: false
  };

  assert.equal(evidenceAcceptable(legacyEvidence), false);

  const fallbackEvidence: Evidence = {
    coordinated: false,
    canonical: false,
    legacyBypassPossible: false,
    invitationUncertain: false
  };

  assert.equal(evidenceAcceptable(fallbackEvidence), false);

  console.log(
    "Legacy event and compatibility fallback exclusion passed"
  );

  const uncertainInvitation: Evidence = {
    coordinated: true,
    canonical: true,
    legacyBypassPossible: false,
    invitationUncertain: true
  };

  assert.equal(
    evidenceAcceptable(uncertainInvitation),
    false
  );

  console.log(
    "Uncertain external invitation remains non-authorizing"
  );

  const syntheticCompleteEvidence: Evidence = {
    coordinated: true,
    canonical: true,
    legacyBypassPossible: false,
    invitationUncertain: false
  };

  assert.equal(
    evidenceAcceptable(syntheticCompleteEvidence),
    true
  );

  // Even apparently sufficient synthetic evidence
  // cannot turn production gates on.
  assert.deepEqual(
    oauthPermission(syntheticCompleteEvidence),
    {
      storageProtocolReady: false,
      executionPermitted: false,
      retryPermitted: false
    }
  );

  assert.equal(storageProtocolReady, false);
  assert.equal(executionPermitted, false);
  assert.equal(retryPermitted, false);

  console.log("Production OAuth gates remain disabled");
  console.log("Synthetic staff protocol contract tests passed");
}

main();
