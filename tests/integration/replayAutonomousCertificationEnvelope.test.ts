import assert from "node:assert/strict";

import {
  buildReplayAutonomousCertificationEnvelope
} from "../../src/shared/integration/replayAutonomousCertificationEnvelope";

const out =
  buildReplayAutonomousCertificationEnvelope({
    certified: 97,
    failed: 1,
    overrides: 0,
    queuePressure: 0.1
  });

assert.equal(
  out.certificationVersion,
  1
);

assert.equal(
  out.verificationAnalytics.verified,
  true
);

assert.equal(
  out.certificationForecast.certificationDrifting,
  false
);

console.log(
  "replayAutonomousCertificationEnvelope.test.ts passed"
);
