import assert from "node:assert/strict";

import {
  buildReplayAutonomousEnforcementEnvelope
} from "../../src/shared/integration/replayAutonomousEnforcementEnvelope";

const out =
  buildReplayAutonomousEnforcementEnvelope({
    enforced: 97,
    violations: 1,
    overrides: 0,
    queuePressure: 0.1
  });

assert.equal(
  out.enforcementVersion,
  1
);

assert.equal(
  out.enforcementAnalytics.compliant,
  true
);

assert.equal(
  out.enforcementForecast.enforcementDrifting,
  false
);

console.log(
  "replayAutonomousEnforcementEnvelope.test.ts passed"
);
