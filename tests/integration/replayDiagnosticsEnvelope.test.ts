import assert from "node:assert/strict";
import {
  buildReplayDiagnosticsEnvelope
} from "../../src/shared/integration/replayDiagnosticsEnvelope";

const out = buildReplayDiagnosticsEnvelope({
  eventCount: 3,
  drifted: true,
  repaired: false,
  profileBehind: true,
  lagMs: 1000,
  latestEventAt: "2026-01-02T00:00:00Z",
  profileLastEventAt: "2026-01-01T00:00:00Z"
});

assert.equal(out.replayDiagnostics.replayVersion, 1);
assert.equal(out.replayDiagnostics.deterministicReplay, true);
assert.equal(out.replayDiagnostics.eventCount, 3);
assert.equal(out.replayDiagnostics.profileBehind, true);
assert.equal(out.replayDiagnostics.lagMs, 1000);

console.log("replayDiagnosticsEnvelope.test.ts passed");
