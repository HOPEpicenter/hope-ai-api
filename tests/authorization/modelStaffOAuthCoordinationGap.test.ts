import assert from "node:assert/strict";

import {
  modelStaffOAuthCoordinationGap,
  type StaffOAuthWriteObservation
} from "../../src/services/authorization/modelStaffOAuthCoordinationGap";

const states: StaffOAuthWriteObservation[] = [
  "committed",
  "not_committed",
  "uncertain"
];

for (const staffEvent of states) {
  for (const oauthReceipt of states) {
    const decision = modelStaffOAuthCoordinationGap({
      staffEvent,
      oauthReceipt
    });

    assert.equal(
      decision.atomicCoordinationDemonstrated,
      false
    );
    assert.equal(decision.executionPermitted, false);
    assert.equal(decision.retryPermitted, false);
    assert.equal(decision.safeToTreatAsRevoked, false);

    const expected =
      staffEvent === "committed" &&
      oauthReceipt === "committed"
        ? "both_observed_committed_not_atomic"
        : staffEvent === "uncertain" ||
          oauthReceipt === "uncertain"
        ? "uncertain_outcome"
        : staffEvent === "not_committed" &&
          oauthReceipt === "not_committed"
        ? "neither_observed_committed"
        : "partial_commit";

    assert.equal(decision.classification, expected);
    assert.equal(Object.isFrozen(decision), true);
  }
}

for (const input of [
  null,
  undefined,
  {},
  [],
  "committed",
  { staffEvent: "committed" },
  { staffEvent: "committed", oauthReceipt: "yes" },
  { staffEvent: "committed", oauthReceipt: "committed",
    executionPermitted: true }
]) {
  const decision = modelStaffOAuthCoordinationGap(input);
  assert.equal(decision.classification, "uncertain_outcome");
  assert.equal(decision.executionPermitted, false);
  assert.equal(decision.retryPermitted, false);
}

console.log(
  "Staff OAuth independent-write safety model tests passed"
);
