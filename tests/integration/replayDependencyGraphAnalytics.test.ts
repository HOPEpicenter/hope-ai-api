import assert from "node:assert/strict";

import {
  buildReplayDependencyGraphAnalytics
} from "../../src/shared/integration/replayDependencyGraphAnalytics";

const out =
  buildReplayDependencyGraphAnalytics({
    nodes: 10,
    edges: 25,
    blocked: 2
  });

assert.equal(out.nodes, 10);
assert.equal(out.edges, 25);
assert.equal(out.coordinationBlocked, true);

console.log(
  "replayDependencyGraphAnalytics.test.ts passed"
);
