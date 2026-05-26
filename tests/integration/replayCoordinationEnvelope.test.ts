import assert from "node:assert/strict";

import {
  buildReplayCoordinationEnvelope
} from "../../src/shared/integration/replayCoordinationEnvelope";

const out =
  buildReplayCoordinationEnvelope({
    nodes: 20,
    edges: 50,
    blocked: 2,
    synchronized: 18,
    total: 20,
    queuePressure: 0.7,
    timeoutRisk: 0.8
  });

assert.equal(
  out.coordinationVersion,
  1
);

assert.ok(
  out.coordinationHealth >= 60
);

assert.equal(
  out.synchronizationForecast.unstable,
  true
);

console.log(
  "replayCoordinationEnvelope.test.ts passed"
);
