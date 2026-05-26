import assert from "node:assert/strict";

import {
  buildReplayVerificationAnalytics
} from "../../src/shared/integration/replayVerificationAnalytics";

const out =
  buildReplayVerificationAnalytics({
    certified: 98,
    failed: 1,
    overrides: 0
  });

assert.equal(
  out.verified,
  true
);

assert.ok(
  out.verificationIntegrity >= 0.9
);

console.log(
  "replayVerificationAnalytics.test.ts passed"
);
