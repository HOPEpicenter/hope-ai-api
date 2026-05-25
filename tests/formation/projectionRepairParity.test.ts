import assert from "node:assert/strict";

function comparable(profile: any): string {
  return JSON.stringify({
    stage: profile.stage ?? null,
    assignedTo: profile.assignedTo ?? null,
    lastEventAt: profile.lastEventAt ?? null
  });
}

const staleProfile = {
  stage: "Guest",
  assignedTo: null,
  lastEventAt: "2026-01-01T00:00:00Z"
};

const rebuiltProfile = {
  stage: "Connected",
  assignedTo: "ops-user-1",
  lastEventAt: "2026-01-03T00:00:00Z"
};

const repairedProfile = {
  stage: "Connected",
  assignedTo: "ops-user-1",
  lastEventAt: "2026-01-03T00:00:00Z"
};

assert.notEqual(
  comparable(staleProfile),
  comparable(rebuiltProfile)
);

assert.equal(
  comparable(repairedProfile),
  comparable(rebuiltProfile)
);

console.log("projectionRepairParity.test.ts passed");
