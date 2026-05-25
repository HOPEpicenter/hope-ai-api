import assert from "node:assert/strict";

import {
  formationMutationDispatchers
} from "../../src/domain/formation/projection/formationMutationDispatchers";

const profile: any = {};

formationMutationDispatchers.FOLLOWUP_ASSIGNED({
  type: "FOLLOWUP_ASSIGNED",
  profile,
  data: {
    assigneeId: "ops-user-1"
  },
  occurredAtIso: "2026-01-01T00:00:00Z",
  eventId: "evt-1"
});

assert.equal(
  profile.assignedTo,
  "ops-user-1"
);

formationMutationDispatchers.NEXT_STEP_COMPLETED({
  type: "NEXT_STEP_COMPLETED",
  profile,
  data: {
    nextStep: "Attend Group"
  },
  occurredAtIso: "2026-01-02T00:00:00Z",
  eventId: "evt-2"
});

assert.equal(
  profile.lastNextStepCompletedAt,
  "2026-01-02T00:00:00Z"
);

assert.equal(
  profile.stage,
  "Connected"
);

console.log("formationMutationDispatchers.test.ts passed");
