import assert from "node:assert/strict";

import {
  buildReplayRepairOrchestrationEnvelope
} from "../../src/shared/integration/replayRepairOrchestrationEnvelope";

const out =
  buildReplayRepairOrchestrationEnvelope({
    scanned: 100,
    drifted: 5,
    repaired: 5,
    failed: 1,
    lagMs: 1000 * 60 * 60 * 2,
    nextCursor: "abc"
  });

assert.equal(
  out.replayRepair.scanned,
  100
);

assert.equal(
  out.replayRepair.lagSeverity,
  "medium"
);

assert.equal(
  out.replayRepair.nextCursor,
  "abc"
);

console.log(
  "replayRepairOrchestrationEnvelope.test.ts passed"
);
