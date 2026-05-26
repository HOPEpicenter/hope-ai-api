import assert from "node:assert/strict";

import {
  buildReplayConsensusEnvelope
} from "../../src/shared/integration/replayConsensusEnvelope";

const out =
  buildReplayConsensusEnvelope({
    replicas: 8,
    aligned: 7,
    divergent: 1,
    queuePressure: 0.7,
    synchronizationRisk: 0.8
  });

assert.equal(
  out.consensusVersion,
  1
);

assert.equal(
  out.quorumHealth,
  88
);

assert.equal(
  out.divergenceForecast.unstable,
  true
);

console.log(
  "replayConsensusEnvelope.test.ts passed"
);
