import assert from "node:assert/strict";
import {
  applyNextStepMutation
} from "../../src/domain/formation/projection/applyNextStepMutation";

const profile: any = {
  lastNextStepAt: "2026-01-02T00:00:00Z",
  lastNextStepCompletedAt: "2026-01-02T00:00:00Z",
  lastNextStep: "Existing Step"
};

const older = applyNextStepMutation({
  profile,
  completed: true,
  nextStep: "Older Step",
  occurredAtIso: "2026-01-01T00:00:00Z",
  eventType: "NEXT_STEP_COMPLETED",
  eventId: "evt-1"
});

assert.equal(older.selectedAdvanced, false);
assert.equal(older.completedAdvanced, false);
assert.equal(profile.lastNextStep, "Existing Step");

const newer = applyNextStepMutation({
  profile,
  completed: true,
  nextStep: "Attend Group",
  occurredAtIso: "2026-01-03T00:00:00Z",
  eventType: "NEXT_STEP_COMPLETED",
  eventId: "evt-3"
});

assert.equal(newer.selectedAdvanced, true);
assert.equal(newer.completedAdvanced, true);
assert.equal(profile.lastNextStepAt, "2026-01-03T00:00:00Z");
assert.equal(profile.lastNextStepCompletedAt, "2026-01-03T00:00:00Z");
assert.equal(profile.lastNextStep, "Attend Group");
assert.equal(profile.stage, "Connected");

console.log("applyNextStepMutation.test.ts passed");
