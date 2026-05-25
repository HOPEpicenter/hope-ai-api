import assert from "node:assert/strict";

import {
  compareProjectionLineage
} from "../../src/shared/integration/projectionLineageParity";

const out =
  compareProjectionLineage({
    current: {
      replayHash: "abc"
    },
    rebuilt: {
      replayHash: "abc"
    }
  });

assert.equal(
  out.deterministicLineageParity,
  true
);

assert.equal(
  out.currentHash,
  out.rebuiltHash
);

console.log(
  "projectionLineageParity.test.ts passed"
);
