import assert from "node:assert/strict";

import {
  buildReplaySelfHealingAnalytics
} from "../../src/shared/integration/replaySelfHealingAnalytics";

const out =
  buildReplaySelfHealingAnalytics({
    autonomousRepairs: 6,
    manualRepairs: 2,
    failed: 1
  });

assert.equal(
  out.selfHealing,
  true
);

assert.ok(
  out.selfHealingRate >= 0.5
);

console.log(
  "replaySelfHealingAnalytics.test.ts passed"
);
