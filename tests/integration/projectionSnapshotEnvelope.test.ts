import assert from "node:assert/strict";

import {
  buildProjectionSnapshotEnvelope
} from "../../src/shared/integration/projectionSnapshotEnvelope";

const out =
  buildProjectionSnapshotEnvelope({
    replayHash: "abc123",
    snapshot: {
      id: 1
    }
  });

assert.equal(
  out.snapshotVersion,
  1
);

assert.equal(
  out.deterministicSnapshot,
  true
);

assert.equal(
  out.replayHash,
  "abc123"
);

assert.ok(out.snapshotHash);

console.log(
  "projectionSnapshotEnvelope.test.ts passed"
);
