import assert from "node:assert/strict";

import {
  buildReplayConsensusStateAnalytics
} from "../../src/shared/integration/replayConsensusStateAnalytics";

const out =
  buildReplayConsensusStateAnalytics({
    replicas: 5,
    aligned: 4,
    divergent: 1
  });

assert.equal(out.replicas, 5);
assert.equal(out.consensusRate, 0.8);
assert.equal(out.converged, false);

console.log(
  "replayConsensusStateAnalytics.test.ts passed"
);
