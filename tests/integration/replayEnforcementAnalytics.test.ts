import assert from "node:assert/strict";

import {
  buildReplayEnforcementAnalytics
} from "../../src/shared/integration/replayEnforcementAnalytics";

const out =
  buildReplayEnforcementAnalytics({
    enforced: 98,
    violations: 1,
    overrides: 0
  });

assert.equal(
  out.compliant,
  true
);

assert.ok(
  out.enforcementIntegrity >= 0.9
);

console.log(
  "replayEnforcementAnalytics.test.ts passed"
);
