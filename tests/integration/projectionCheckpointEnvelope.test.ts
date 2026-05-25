import assert from "node:assert/strict";

import {
  buildProjectionCheckpointEnvelope
} from "../../src/shared/integration/projectionCheckpointEnvelope";

const out =
  buildProjectionCheckpointEnvelope({
    visitorId: "visitor-1",
    replayHash: "abc",
    snapshotHash: "def",
    cursor: "cursor-1",
    lineageDepth: 2
  });

assert.equal(
  out.checkpointVersion,
  1
);

assert.equal(
  out.deterministicCheckpoint,
  true
);

assert.equal(
  out.lineageDepth,
  2
);

assert.ok(out.checkpointHash);

console.log(
  "projectionCheckpointEnvelope.test.ts passed"
);
