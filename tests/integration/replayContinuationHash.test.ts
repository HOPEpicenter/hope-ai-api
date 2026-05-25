import assert from "node:assert/strict";

import {
  buildReplayContinuationHash
} from "../../src/shared/integration/replayContinuationHash";

const a =
  buildReplayContinuationHash({
    cursor: "cursor-1",
    checkpointHash: "checkpoint-1",
    replayHash: "replay-1",
    continuationToken: "token-1"
  });

const b =
  buildReplayContinuationHash({
    cursor: "cursor-1",
    checkpointHash: "checkpoint-1",
    replayHash: "replay-1",
    continuationToken: "token-1"
  });

assert.equal(a, b);

console.log(
  "replayContinuationHash.test.ts passed"
);
