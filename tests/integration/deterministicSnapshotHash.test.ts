import assert from "node:assert/strict";

import {
  buildDeterministicSnapshotHash
} from "../../src/shared/integration/deterministicSnapshotHash";

const a =
  buildDeterministicSnapshotHash({
    id: 1,
    stage: "Connected"
  });

const b =
  buildDeterministicSnapshotHash({
    id: 1,
    stage: "Connected"
  });

assert.equal(a, b);

console.log(
  "deterministicSnapshotHash.test.ts passed"
);
