import assert from "node:assert/strict";

import {
  buildReplayAuditEnvelope
} from "../../src/shared/integration/replayAuditEnvelope";

const out = buildReplayAuditEnvelope({
  visitorId: "visitor-1",
  eventCount: 10,
  drifted: true,
  repaired: false,
  driftFields: [
    "stage",
    "assignedTo",
    "lastEventAt"
  ]
});

assert.equal(out.visitorId, "visitor-1");
assert.equal(out.driftSeverity, "low");
assert.equal(out.driftFieldCount, 3);

assert.equal(
  out.replayDiagnostics.eventCount,
  10
);

console.log("replayAuditEnvelope.test.ts passed");
