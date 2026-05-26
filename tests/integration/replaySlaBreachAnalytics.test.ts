import assert from "node:assert/strict";

import {
  buildReplaySlaBreachAnalytics
} from "../../src/shared/integration/replaySlaBreachAnalytics";

const out =
  buildReplaySlaBreachAnalytics({
    breached: 30,
    total: 100
  });

assert.equal(
  out.unstable,
  true
);

assert.equal(
  out.breachRate,
  0.3
);

console.log(
  "replaySlaBreachAnalytics.test.ts passed"
);
