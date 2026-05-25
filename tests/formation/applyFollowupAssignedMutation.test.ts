import assert from "node:assert/strict";
import {
  applyFollowupAssignedMutation
} from "../../src/domain/formation/projection/applyFollowupAssignedMutation";

const profile: any = {
  stage: "Guest",
  stageUpdatedAt: "2026-01-02T00:00:00Z",
  stageEventId: "evt-2",
  lastFollowupAssignedAt: "2026-01-02T00:00:00Z",
  assignedTo: "ops-user-1"
};

const older = applyFollowupAssignedMutation({
  profile,
  assigneeId: "ops-user-2",
  occurredAtIso: "2026-01-01T00:00:00Z",
  eventType: "FOLLOWUP_ASSIGNED",
  eventId: "evt-1"
});

assert.equal(older, false);

assert.equal(
  profile.assignedTo,
  "ops-user-1",
  "older replay should not replace assignee"
);

const newer = applyFollowupAssignedMutation({
  profile,
  assigneeId: "ops-user-2",
  occurredAtIso: "2026-01-03T00:00:00Z",
  eventType: "FOLLOWUP_ASSIGNED",
  eventId: "evt-3"
});

assert.equal(newer, true);

assert.equal(
  profile.assignedTo,
  "ops-user-2"
);

assert.equal(
  profile.lastFollowupAssignedAt,
  "2026-01-03T00:00:00Z"
);

console.log("applyFollowupAssignedMutation.test.ts passed");
