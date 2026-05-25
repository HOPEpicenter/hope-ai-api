import assert from "node:assert/strict";

import {
  buildProjectionLineageHash
} from "../../src/shared/integration/projectionLineageHash";

const a =
  buildProjectionLineageHash({
    replayHash: "r1",
    snapshotHash: "s1",
    checkpointHash: "c1",
    continuationHash: "k1"
  });

const b =
  buildProjectionLineageHash({
    replayHash: "r1",
    snapshotHash: "s1",
    checkpointHash: "c1",
    continuationHash: "k1"
  });

assert.equal(a, b);

console.log(
  "projectionLineageHash.test.ts passed"
);
