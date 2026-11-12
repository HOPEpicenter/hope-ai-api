import assert from "node:assert/strict";
import {
  assessSyntheticLegacyProjectionFence,
  type SyntheticProjectionFenceAssessment
} from "../../src/domain/staff/assessSyntheticLegacyProjectionFence";

function safe(result: SyntheticProjectionFenceAssessment): void {
  assert.equal(result.authoritative, false);
  assert.equal(result.bindingOwnershipGranted, false);
  assert.equal(result.staffActivationPermitted, false);
  assert.equal(result.oauthExecutionPermitted, false);
  assert.equal(result.retryPermitted, false);
  assert.equal(result.productionWriterFenced, false);
}
function expect(
  evidence: unknown,
  classification: SyntheticProjectionFenceAssessment["classification"],
  reason: SyntheticProjectionFenceAssessment["reason"]
): void {
  const decision = assessSyntheticLegacyProjectionFence(evidence);
  safe(decision);
  assert.equal(decision.classification, classification);
  assert.equal(decision.reason, reason);
}

const authority = {
  state: "active",
  staffId: "synthetic-staff",
  operationId: "synthetic-op",
  eventId: "synthetic-event",
  revision: 8
} as const;
const projection = {
  staffId: "synthetic-staff",
  operationId: "synthetic-op",
  eventId: "synthetic-event",
  revision: 8
} as const;

// Direct and historical legacy appends never establish authority, even with
// apparently credible or forged active authority/projection fields.
for (const provenance of ["direct_legacy_append", "historical_legacy"]) {
  expect({ provenance, authority, projection }, "historical_only", "legacy_projection_not_authority");
  expect({ provenance, authority: { ...authority, state: "revoked" } }, "historical_only", "legacy_projection_not_authority");
}

const claimed = { provenance: "claimed_authority_projection", authority, projection };
expect(claimed, "candidate_consistent", "matching_evidence_non_authorizing");
expect({ ...claimed, authority: null }, "blocked", "missing_authority");
expect({ ...claimed, authority: { ...authority, state: "revoked" } }, "blocked", "revoked_authority");
expect({ ...claimed, authority: { ...authority, state: "pending" } }, "blocked", "missing_authority");
expect({ ...claimed, projection: { ...projection, revision: 7 } }, "blocked", "contradictory_evidence");
expect({ ...claimed, projection: { ...projection, staffId: "different-staff" } }, "blocked", "contradictory_evidence");
expect({ ...claimed, projection: { ...projection, eventId: "other-event" } }, "blocked", "contradictory_evidence");
expect({ ...claimed, projection: { ...projection, operationId: "other-op" } }, "blocked", "contradictory_evidence");
expect({ ...claimed, projection: null }, "blocked", "invalid_input");
expect({ ...claimed, projection: { ...projection, revision: -1 } }, "blocked", "unverified_projection");
expect({ ...claimed, authority: { ...authority, revision: -1 } }, "blocked", "invalid_input");
expect({ provenance: "unknown", authority, projection }, "blocked", "unverified_projection");
expect(null, "blocked", "invalid_input");

// No getter execution or reliance on hostile reflection.
let called = false;
const getter = Object.defineProperty({}, "provenance", {
  get() { called = true; throw new Error("unsafe"); }
});
expect(getter, "blocked", "unverified_projection");
assert.equal(called, false);
const revokedProxy = Proxy.revocable({}, {});
revokedProxy.revoke();
expect(revokedProxy.proxy, "blocked", "invalid_input");

console.log("E149C synthetic legacy projection fence regressions passed");
