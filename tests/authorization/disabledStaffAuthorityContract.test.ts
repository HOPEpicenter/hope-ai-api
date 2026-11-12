import assert from "node:assert/strict";
import {
  assessDisabledStaffAuthorityProposal,
  type StaffAuthorityDecision
} from "../../src/domain/staff/disabledStaffAuthorityContract";

function assertDenied(value: StaffAuthorityDecision): void {
  assert.deepEqual(value, {
    status: "disabled",
    reason: "authority_adapter_not_implemented",
    authoritative: false,
    migrationPermitted: false,
    writePermitted: false,
    executionPermitted: false,
    retryPermitted: false,
    recoveryPermitted: false,
    productionRolloutPermitted: false
  });
}

const syntheticActive = {
  operation: "oauth_claim",
  head: {
    staffId: "synthetic-staff-a",
    expectedRevision: 8,
    expectedGeneration: 3,
    expectedState: "active",
    operationId: "synthetic-operation-1"
  }
} as const;

// No proposed operation, including one with apparently valid evidence,
// can claim authority before an independently reviewed implementation.
for (const operation of [
  "binding_acquire",
  "binding_transfer",
  "staff_create",
  "staff_update",
  "staff_deactivate",
  "invitation_reserve",
  "invitation_activate",
  "oauth_claim"
]) {
  assertDenied(assessDisabledStaffAuthorityProposal({
    ...syntheticActive, operation
  }));
}

// Stale, revoked, malformed, unknown, and ambiguous evidence all deny.
for (const proposal of [
  null,
  undefined,
  {},
  { ...syntheticActive, head: { ...syntheticActive.head, expectedState: "revoked" } },
  { ...syntheticActive, head: { ...syntheticActive.head, expectedGeneration: -1 } },
  { ...syntheticActive, head: { ...syntheticActive.head, expectedRevision: 0 } },
  { ...syntheticActive, operation: "unknown" }
]) {
  assertDenied(assessDisabledStaffAuthorityProposal(proposal));
}

// Hostile inputs are never inspected or executed.
let getterCalled = false;
const hostile = Object.defineProperty({}, "operation", {
  get() {
    getterCalled = true;
    throw new Error("unexpected access");
  }
});
assertDenied(assessDisabledStaffAuthorityProposal(hostile));
assert.equal(getterCalled, false);

const revoked = Proxy.revocable({}, {});
revoked.revoke();
assertDenied(assessDisabledStaffAuthorityProposal(revoked.proxy));

console.log("Disabled Staff authority contract regressions passed");
