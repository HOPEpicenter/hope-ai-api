import assert from "node:assert/strict";

import {
  classifyReplaySla
} from "../../src/shared/integration/replaySlaClassification";

assert.equal(
  classifyReplaySla({
    latencyMs: 100,
    timeoutMs: 1000
  }),
  "healthy"
);

assert.equal(
  classifyReplaySla({
    latencyMs: 600,
    timeoutMs: 1000
  }),
  "warning"
);

assert.equal(
  classifyReplaySla({
    latencyMs: 850,
    timeoutMs: 1000
  }),
  "breached"
);

assert.equal(
  classifyReplaySla({
    latencyMs: 1200,
    timeoutMs: 1000
  }),
  "critical"
);

console.log(
  "replaySlaClassification.test.ts passed"
);
