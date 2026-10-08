import assert from "node:assert/strict";
import {
  MINISTRY_AUTHORIZATION_ACTIONS,
  MINISTRY_AUTHORIZATION_POLICY_VERSION,
  MINISTRY_AUTHORIZATION_ROLES,
  MINISTRY_AUTHORIZATION_SCOPES,
  SIX_WEEK_ASSIGNMENT_POLICY_V1
} from "../../src/contracts/ministryAuthorizationPolicy.v1";

function run(): void {
  assert.equal(MINISTRY_AUTHORIZATION_POLICY_VERSION, 1);

  assert.equal(
    new Set(MINISTRY_AUTHORIZATION_ROLES).size,
    MINISTRY_AUTHORIZATION_ROLES.length
  );

  assert.equal(
    new Set(MINISTRY_AUTHORIZATION_SCOPES).size,
    MINISTRY_AUTHORIZATION_SCOPES.length
  );

  assert.equal(
    new Set(MINISTRY_AUTHORIZATION_ACTIONS).size,
    MINISTRY_AUTHORIZATION_ACTIONS.length
  );

  assert.equal(SIX_WEEK_ASSIGNMENT_POLICY_V1.pastorMayAssign, true);
  assert.equal(
    SIX_WEEK_ASSIGNMENT_POLICY_V1.ministryLeaderMayAssignWithinLedArea,
    true
  );
  assert.equal(SIX_WEEK_ASSIGNMENT_POLICY_V1.staffMaySelfClaim, false);
  assert.equal(SIX_WEEK_ASSIGNMENT_POLICY_V1.staffMayReassign, false);
  assert.equal(
    SIX_WEEK_ASSIGNMENT_POLICY_V1.staffVisibility,
    "assigned_work"
  );
  assert.equal(
    SIX_WEEK_ASSIGNMENT_POLICY_V1.unassignedQueueVisibility,
    "leadership_only"
  );

  assert.ok(MINISTRY_AUTHORIZATION_ACTIONS.includes("six_week.assign"));
  assert.ok(MINISTRY_AUTHORIZATION_ACTIONS.includes("six_week.reassign"));
  assert.ok(MINISTRY_AUTHORIZATION_ACTIONS.includes("six_week.record_task"));

  console.log("ministryAuthorizationPolicy.v1.test.ts passed");
}

run();
