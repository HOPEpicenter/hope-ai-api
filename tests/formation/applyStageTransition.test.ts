import assert from "node:assert/strict";
import {
  applyStageTransition
} from "../../src/domain/formation/projection/applyStageTransition";

const profile: any = {
  stage: "Guest",
  stageUpdatedAt: "2026-01-02T00:00:00Z",
  stageEventId: "evt-2"
};

applyStageTransition({
  profile,
  stage: "Connected",
  occurredAtIso: "2026-01-01T00:00:00Z",
  eventType: "FOLLOWUP_OUTCOME_RECORDED",
  eventId: "evt-1"
});

assert.equal(
  profile.stage,
  "Guest",
  "older events should not roll stage backward"
);

applyStageTransition({
  profile,
  stage: "Connected",
  occurredAtIso: "2026-01-03T00:00:00Z",
  eventType: "FOLLOWUP_OUTCOME_RECORDED",
  eventId: "evt-3"
});

assert.equal(profile.stage, "Connected");
assert.equal(profile.stageUpdatedAt, "2026-01-03T00:00:00Z");
assert.equal(
  profile.stageReason,
  "event:FOLLOWUP_OUTCOME_RECORDED"
);

console.log("applyStageTransition.test.ts passed");
