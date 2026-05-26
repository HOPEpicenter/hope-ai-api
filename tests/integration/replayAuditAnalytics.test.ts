import assert from "node:assert/strict";

import {
  buildReplayAuditAnalytics
} from "../../src/shared/integration/replayAuditAnalytics";

const out =
  buildReplayAuditAnalytics({
    verified: 98,
    anomalies: 1,
    overrides: 0
  });

assert.equal(
  out.trusted,
  true
);

assert.ok(
  out.auditIntegrity >= 0.9
);

console.log(
  "replayAuditAnalytics.test.ts passed"
);
