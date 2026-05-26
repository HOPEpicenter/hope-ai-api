import assert from "node:assert/strict";

import {
  buildReplayAutonomousGovernanceEnvelope
} from "../../src/shared/integration/replayAutonomousGovernanceEnvelope";

const out =
  buildReplayAutonomousGovernanceEnvelope({
    compliant: 92,
    violations: 2,
    overrides: 1,
    queuePressure: 0.1
  });

assert.equal(
  out.governanceVersion,
  1
);

assert.equal(
  out.compliance.governanceHealthy,
  true
);

assert.equal(
  out.policyForecast.policyDrifting,
  false
);

console.log(
  "replayAutonomousGovernanceEnvelope.test.ts passed"
);
