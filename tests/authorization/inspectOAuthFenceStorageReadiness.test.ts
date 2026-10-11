import assert from "node:assert/strict";

import {
  inspectOAuthFenceStorageReadiness,
  OAUTH_FENCE_STORAGE_BLOCKERS
} from "../../src/services/authorization/inspectOAuthFenceStorageReadiness";

import {
  inspectOAuthExecutionFenceV1
} from "../../src/contracts/oauthExecutionFence.v1";

function main(): void {
  const result = inspectOAuthFenceStorageReadiness();

  assert.equal(result.storageProtocolReady, false);
  assert.equal(result.executionPermitted, false);
  assert.equal(result.requiresAtomicCoordination, true);

  assert.equal(result.blockers.length, 7);
  assert.equal(new Set(result.blockers).size, 7);

  for (const blocker of [
    "staff_deactivation_not_coordinated",
    "entra_binding_changes_not_coordinated",
    "session_revocation_not_coordinated",
    "credential_mutations_not_coordinated",
    "atomic_ordering_not_demonstrated",
    "uncertain_commit_recovery_not_demonstrated",
    "external_execution_cancellation_not_demonstrated"
  ]) {
    assert.ok(result.blockers.includes(
      blocker as typeof result.blockers[number]
    ));
    assert.ok(OAUTH_FENCE_STORAGE_BLOCKERS.includes(
      blocker as typeof OAUTH_FENCE_STORAGE_BLOCKERS[number]
    ));
  }

  // Even modifying a local result cannot modify the gate.
  const local = inspectOAuthFenceStorageReadiness();
  (local.blockers as string[]).splice(0);
  assert.equal(local.blockers.length, 0);

  const next = inspectOAuthFenceStorageReadiness();
  assert.equal(next.blockers.length, 7);
  assert.equal(next.executionPermitted, false);

  // The earlier structural fence contract also never
  // grants OAuth execution.
  assert.deepEqual(inspectOAuthExecutionFenceV1(null), {
    recognized: false,
    executionPermitted: false,
    requiresAtomicCoordination: true
  });

  // This module exposes inspection only; no claim,
  // release, revoke or execution callback is invoked.
  console.log(
    "OAuth fence storage participation gate tests passed"
  );
}

main();
