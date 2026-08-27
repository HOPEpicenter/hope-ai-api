import assert from "node:assert/strict";
import {
  projectStaffDirectory,
  type StaffEvent
} from "../../src/domain/staff/projectStaffDirectory";

const events: StaffEvent[] = [
  {
    eventId: "evt-invited",
    staffId: "staff-invited-1",
    type: "staff.invited",
    occurredAt: "2026-08-27T12:00:00.000Z",
    actorId: "staff-admin-1",
    data: {
      displayName: "Invited Ministry Staff",
      roleLabel: "Care Team",
      status: "pending",
      entraTenantId: "783ef4b1-7e96-4a71-80dd-06865b015da9",
      entraObjectId: "c1717a19-c719-4ed2-8b72-e013800095de"
    }
  },
  {
    eventId: "evt-activated",
    staffId: "staff-invited-1",
    type: "staff.activated",
    occurredAt: "2026-08-27T12:05:00.000Z",
    actorId: "staff-invited-1",
    data: {
      status: "active"
    }
  }
];

const pendingIdentity = projectStaffDirectory(events.slice(0, 1))[0];
assert.equal(pendingIdentity?.status, "pending");

const identity = projectStaffDirectory(events)[0];

assert.equal(identity?.status, "active");
assert.equal(identity?.displayName, "Invited Ministry Staff");
assert.equal(identity?.roleLabel, "Care Team");
assert.equal(
  identity?.entraObjectId,
  "c1717a19-c719-4ed2-8b72-e013800095de"
);

console.log("staffInvitationLifecycle.test.ts passed");
