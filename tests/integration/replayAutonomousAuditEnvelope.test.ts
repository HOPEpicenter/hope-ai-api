import assert from "node:assert/strict";

import {
  buildReplayAutonomousAuditEnvelope
} from "../../src/shared/integration/replayAutonomousAuditEnvelope";

const out =
  buildReplayAutonomousAuditEnvelope({
    verified: 97,
    anomalies: 1,
    overrides: 0,
    queuePressure: 0.1
  });

assert.equal(
  out.auditVersion,
  1
);

assert.equal(
  out.auditAnalytics.trusted,
  true
);

assert.equal(
  out.trustForecast.trustDrifting,
  false
);

console.log(
  "replayAutonomousAuditEnvelope.test.ts passed"
);
