import assert from "node:assert/strict";

import {
  buildProjectionLineageEnvelope
} from "../../src/shared/integration/projectionLineageEnvelope";

const out =
  buildProjectionLineageEnvelope({
    replayHash: "r1",
    snapshotHash: "s1",
    checkpointHash: "c1",
    continuationHash: "k1",
    lineageDepth: 4
  });

assert.equal(
  out.lineageVersion,
  1
);

assert.equal(
  out.deterministicLineage,
  true
);

assert.equal(
  out.lineageDepth,
  4
);

assert.ok(out.lineageHash);

console.log(
  "projectionLineageEnvelope.test.ts passed"
);
