import assert from "node:assert/strict";

import {
  compareProjectionSnapshots
} from "../../src/shared/integration/projectionSnapshotParity";

const out =
  compareProjectionSnapshots({
    current: {
      id: 1,
      stage: "Connected"
    },
    rebuilt: {
      id: 1,
      stage: "Connected"
    }
  });

assert.equal(
  out.deterministicParity,
  true
);

assert.equal(
  out.currentHash,
  out.rebuiltHash
);

console.log(
  "projectionSnapshotParity.test.ts passed"
);
