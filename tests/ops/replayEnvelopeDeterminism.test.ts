import assert from "node:assert/strict";

import {
  buildReplayEnvelope
} from "../../src/shared/integration/replayEnvelope";


const args = {
  previews: [{ id: 1 }],
  plans: [{ id: 2 }],
  timeline: [{ id: 3 }]
};

const a = buildReplayEnvelope(args);
const b = buildReplayEnvelope(args);

assert.equal(a.replayHash, b.replayHash);
assert.equal(a.replayDeterministic, true);
assert.equal(a.simulatedOnly, true);

console.log("replayEnvelopeDeterminism.test.ts passed");
