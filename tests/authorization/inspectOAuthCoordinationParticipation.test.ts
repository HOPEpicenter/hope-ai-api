import assert from "node:assert/strict";

import {
  inspectOAuthCoordinationParticipation,
  OAUTH_COORDINATION_PARTICIPATION_SCHEMA,
  OAUTH_COORDINATION_WORKFLOWS
} from "../../src/services/authorization/inspectOAuthCoordinationParticipation";

import {
  inspectOAuthFenceStorageReadiness
} from "../../src/services/authorization/inspectOAuthFenceStorageReadiness";

const inventory = inspectOAuthCoordinationParticipation();
const gate = inspectOAuthFenceStorageReadiness();

assert.equal(OAUTH_COORDINATION_PARTICIPATION_SCHEMA, 1);
assert.equal(inventory.schemaVersion, 1);
assert.equal(inventory.status, "integration_not_ready");

assert.equal(inventory.storageProtocolReady, false);
assert.equal(inventory.executionPermitted, false);
assert.equal(inventory.retryPermitted, false);

assert.deepEqual(
  inventory.participants.map(p => p.workflow),
  [
    "staff_deactivation",
    "entra_binding_change",
    "session_revocation",
    "credential_revocation",
    "credential_rotation"
  ]
);

assert.equal(OAUTH_COORDINATION_WORKFLOWS.length, 5);
assert.equal(new Set(OAUTH_COORDINATION_WORKFLOWS).size, 5);

for (const participant of inventory.participants) {
  assert.equal(participant.coordinationDemonstrated, false);
  assert.equal(
    participant.commitTimeEnforcementDemonstrated,
    false
  );
  assert.equal(
    participant.uncertainWriteRecoveryDemonstrated,
    false
  );
  assert.equal(Object.isFrozen(participant), true);
}

assert.deepEqual(inventory.blockers, gate.blockers);
assert.equal(gate.storageProtocolReady, false);
assert.equal(gate.executionPermitted, false);

assert.ok(
  inventory.blockers.includes(
    "external_execution_cancellation_not_demonstrated"
  )
);

assert.equal(Object.isFrozen(inventory), true);
assert.equal(Object.isFrozen(inventory.participants), true);
assert.equal(Object.isFrozen(inventory.blockers), true);

// Neither caller-controlled evidence nor a temporary
// mutation of a returned object may elevate readiness.
const second = inspectOAuthCoordinationParticipation();

assert.notStrictEqual(second, inventory);
assert.deepEqual(second, inventory);
assert.equal(second.executionPermitted, false);

// The returned inventory is not an authority, and does
// not expose a method to perform external execution.
assert.equal(
  Object.prototype.hasOwnProperty.call(
    inventory, "authorize"
  ),
  false
);

assert.equal(
  Object.prototype.hasOwnProperty.call(
    inventory, "execute"
  ),
  false
);

console.log(
  "OAuth coordination participation inventory tests passed"
);
