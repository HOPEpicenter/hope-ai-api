import assert from "node:assert/strict";
import {
  applyFollowupOutcomeMutation
} from "../../src/domain/formation/projection/applyFollowupOutcomeMutation";

const profile: any = {
  lastFollowupOutcomeAt: "2026-01-02T00:00:00Z",
  lastFollowupOutcome: "pending"
};

assert.equal(
  applyFollowupOutcomeMutation({
    profile,
    outcome: "connected",
    notes: "older",
    occurredAtIso: "2026-01-01T00:00:00Z",
    eventType: "FOLLOWUP_OUTCOME_RECORDED",
    eventId: "evt-1"
  }),
  false
);

assert.equal(profile.lastFollowupOutcome, "pending");

assert.equal(
  applyFollowupOutcomeMutation({
    profile,
    outcome: "connected",
    notes: "newer",
    occurredAtIso: "2026-01-03T00:00:00Z",
    eventType: "FOLLOWUP_OUTCOME_RECORDED",
    eventId: "evt-3"
  }),
  true
);

assert.equal(profile.lastFollowupOutcome, "connected");
assert.equal(profile.lastFollowupOutcomeNotes, "newer");
assert.equal(profile.stage, "Connected");

console.log("applyFollowupOutcomeMutation.test.ts passed");
