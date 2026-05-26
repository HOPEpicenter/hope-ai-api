import assert from "node:assert/strict";

import {
  buildReplayComplianceAnalytics
} from "../../src/shared/integration/replayComplianceAnalytics";

const out =
  buildReplayComplianceAnalytics({
    compliant: 95,
    violations: 1,
    overrides: 1
  });

assert.equal(
  out.governanceHealthy,
  true
);

assert.ok(
  out.complianceRate >= 0.85
);

console.log(
  "replayComplianceAnalytics.test.ts passed"
);
