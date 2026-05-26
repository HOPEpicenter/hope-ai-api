import assert from "node:assert/strict";

import {
  buildReplayForecastEnvelope
} from "../../src/shared/integration/replayForecastEnvelope";

const out =
  buildReplayForecastEnvelope({
    healthScore: 95,
    recoveryScore: 90,
    reliabilityRate: 0.98,
    forecastWindow: 7
  });

assert.equal(
  out.forecastVersion,
  1
);

assert.equal(
  out.predictiveRisk,
  "minimal"
);

assert.equal(
  out.forecastWindow,
  7
);

console.log(
  "replayForecastEnvelope.test.ts passed"
);
