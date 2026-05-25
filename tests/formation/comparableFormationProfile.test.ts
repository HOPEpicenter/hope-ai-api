import assert from "node:assert/strict";
import {
  toComparableFormationProfileState
} from "../../src/domain/formation/projection/comparableFormationProfile";

const profile = {
  stage: "Connected",
  stageUpdatedAt: "2026-01-03T00:00:00Z",
  stageUpdatedBy: "system",
  stageReason: "event:FOLLOWUP_OUTCOME_RECORDED",
  stageEventId: "evt-3",
  assignedTo: "ops-user-1",
  lastEventType: "FOLLOWUP_OUTCOME_RECORDED",
  lastEventAt: "2026-01-03T00:00:00Z",
  lastEventId: "evt-3",
  lastSourceSystem: "test",
  lastSourceCategory: "regression",
  lastFollowupAssignedAt: "2026-01-01T00:00:00Z",
  lastFollowupContactedAt: "2026-01-02T00:00:00Z",
  lastFollowupOutcomeAt: "2026-01-03T00:00:00Z",
  lastFollowupOutcome: "connected",
  groups: [{ groupId: "group-a" }]
};

const comparable = toComparableFormationProfileState(profile);

assert.equal(
  comparable,
  toComparableFormationProfileState({ ...profile }),
  "comparable formation profile state should be deterministic"
);

assert.equal(
  toComparableFormationProfileState(null),
  "",
  "null profile should compare as empty state"
);

const changed = toComparableFormationProfileState({
  ...profile,
  lastEventAt: "2026-01-04T00:00:00Z"
});

assert.notEqual(
  comparable,
  changed,
  "profile state changes should be visible to audit comparison"
);

console.log("comparableFormationProfile.test.ts passed");
