import assert from "node:assert/strict";

import {
  buildProjectionIntegrityScore
} from "../../src/shared/integration/projectionIntegrityScore";

const out =
  buildProjectionIntegrityScore({
    scanned: 100,
    drifted: 5,
    repaired: 5,
    failed: 0,
    lineageDepth: 4
  });

assert.equal(
  out.integrityVersion,
  1
);

assert.equal(
  out.healthClassification,
  "healthy"
);

assert.equal(
  out.lineageDepth,
  4
);

console.log(
  "projectionIntegrityScore.test.ts passed"
);
