import assert from "node:assert/strict";

import {
  buildReplayCheckpointHash
} from "../../src/shared/integration/replayCheckpointHash";

const a =
  buildReplayCheckpointHash({
    visitorId: "visitor-1",
    replayHash: "abc",
    snapshotHash: "def",
    cursor: "cursor-1"
  });

const b =
  buildReplayCheckpointHash({
    visitorId: "visitor-1",
    replayHash: "abc",
    snapshotHash: "def",
    cursor: "cursor-1"
  });

assert.equal(a, b);

console.log(
  "replayCheckpointHash.test.ts passed"
);
