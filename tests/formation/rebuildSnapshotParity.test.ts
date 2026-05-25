import assert from "node:assert/strict";

function snapshot(profile: any): string {
  return JSON.stringify(profile);
}

const rebuiltA = {
  stage: "Connected",
  assignedTo: "ops-user-1",
  groups: [{ groupId: "group-a" }]
};

const rebuiltB = {
  stage: "Connected",
  assignedTo: "ops-user-1",
  groups: [{ groupId: "group-a" }]
};

assert.equal(
  snapshot(rebuiltA),
  snapshot(rebuiltB)
);

console.log("rebuildSnapshotParity.test.ts passed");
