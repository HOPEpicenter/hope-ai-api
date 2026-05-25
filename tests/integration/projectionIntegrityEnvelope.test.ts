import assert from "node:assert/strict";
import {
  buildProjectionIntegrityEnvelope
} from "../../src/shared/integration/projectionIntegrityEnvelope";

const out = buildProjectionIntegrityEnvelope({
  cursor: "abc",
  shadowMode: true,
  shadowEquivalent: true,
  orphanProfilesExcluded: 2
});

assert.equal(
  out.projectionIntegrity.deterministicReplay,
  true
);

assert.equal(
  out.projectionIntegrity.shadowEquivalent,
  true
);

assert.equal(
  out.projectionIntegrity.orphanProfilesExcluded,
  2
);

console.log("projectionIntegrityEnvelope.test.ts passed");
