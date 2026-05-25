import assert from "node:assert/strict";
import {
  applyTouchpointTimestamp
} from "../../src/domain/formation/projection/applyTouchpointTimestamp";

const profile: any = {
  lastFollowupAssignedAt: "2026-01-02T00:00:00Z"
};

const older = applyTouchpointTimestamp({
  profile,
  field: "lastFollowupAssignedAt",
  occurredAtIso: "2026-01-01T00:00:00Z"
});

assert.equal(older, false);

assert.equal(
  profile.lastFollowupAssignedAt,
  "2026-01-02T00:00:00Z"
);

const newer = applyTouchpointTimestamp({
  profile,
  field: "lastFollowupAssignedAt",
  occurredAtIso: "2026-01-03T00:00:00Z"
});

assert.equal(newer, true);

assert.equal(
  profile.lastFollowupAssignedAt,
  "2026-01-03T00:00:00Z"
);

console.log("applyTouchpointTimestamp.test.ts passed");
