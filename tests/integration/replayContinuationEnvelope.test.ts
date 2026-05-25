import assert from "node:assert/strict";

import {
  buildReplayContinuationEnvelope
} from "../../src/shared/integration/replayContinuationEnvelope";

const out =
  buildReplayContinuationEnvelope({
    cursor: "cursor-1",
    checkpointHash: "checkpoint-1",
    replayHash: "replay-1",
    continuationToken: "token-1",
    resumeDepth: 3
  });

assert.equal(
  out.continuationVersion,
  1
);

assert.equal(
  out.deterministicContinuation,
  true
);

assert.equal(
  out.resumeDepth,
  3
);

assert.ok(out.continuationHash);

console.log(
  "replayContinuationEnvelope.test.ts passed"
);
