import assert from "node:assert/strict";
import {
  assessStaffEventCausalProvenanceReadiness,
  type StaffEventCausalProvenanceReadinessInput,
  type StaffEventCausalProvenanceReadinessResult
} from "../../src/contracts/staffEventCausalProvenanceReadiness.v1";

const consistent: StaffEventCausalProvenanceReadinessInput = {
  schemaVersion: 1,
  securityReceipt: "observed",
  appendIntent: "recorded",
  staffEvent: "verified_match",
  operationUniqueness: "not_proven",
  causalLink: "writer_claim_only"
};

function check(
  input: unknown,
  status: StaffEventCausalProvenanceReadinessResult["status"]
): void {
  const actual = assessStaffEventCausalProvenanceReadiness(input);
  assert.equal(actual.status, status);
  assert.equal(actual.causalProvenanceVerified, false);
  assert.equal(actual.globalOperationUniquenessVerified, false);
  assert.equal(actual.authoritative, false);
  assert.equal(actual.executionPermitted, false);
  assert.equal(actual.retryPermitted, false);
  assert.equal(actual.securityTransactionVerified, false);
  assert.equal(actual.staffEventsAppendVerified, false);
}

function scenario(
  changes: Partial<StaffEventCausalProvenanceReadinessInput>,
  status: StaffEventCausalProvenanceReadinessResult["status"]
): void {
  check({ ...consistent, ...changes }, status);
}

check(consistent, "consistent_but_unproven");

scenario({ securityReceipt: "missing" }, "insufficient_evidence");
scenario({ appendIntent: "missing" }, "insufficient_evidence");
scenario({ appendIntent: "not_required" }, "insufficient_evidence");
scenario({ appendIntent: "legacy_unclassified" }, "insufficient_evidence");
scenario({ staffEvent: "missing" }, "insufficient_evidence");
scenario({ staffEvent: "unclassified" }, "insufficient_evidence");
scenario({ causalLink: "missing" }, "insufficient_evidence");

scenario({ securityReceipt: "contradictory" }, "contradictory");
scenario({ appendIntent: "contradictory" }, "contradictory");
scenario({ staffEvent: "contradictory" }, "contradictory");
scenario({ operationUniqueness: "duplicate" }, "contradictory");
scenario({ causalLink: "contradictory" }, "contradictory");

scenario({ securityReceipt: "unavailable" }, "unavailable");
scenario({ appendIntent: "unavailable" }, "unavailable");
scenario({ staffEvent: "unavailable" }, "unavailable");
scenario({ operationUniqueness: "unavailable" }, "unavailable");
scenario({ causalLink: "unavailable" }, "unavailable");

// Known contradictions cannot be masked by unavailable evidence.
check({
  ...consistent,
  operationUniqueness: "duplicate",
  staffEvent: "unavailable"
}, "contradictory");

// No invented proof state is accepted from an input summary.
check({ ...consistent, causalLink: "verified" }, "unsupported");
check({ ...consistent, operationUniqueness: "globally_verified" }, "unsupported");
check({ ...consistent, schemaVersion: 2 }, "unsupported");
check({ ...consistent, unexpectedField: true }, "unsupported");
check({ ...consistent, staffEvent: undefined }, "unsupported");
check(null, "unsupported");
check([], "unsupported");
check("verified", "unsupported");

// Exotic prototypes, active proxies, and accessors are unsupported.
check(new Date(), "unsupported");
check(new Map(), "unsupported");
check(Object.create({ inheritedEvidence: "untrusted" }), "unsupported");
check(new Proxy({ ...consistent }, {}), "unsupported");

const nullPrototype = Object.assign(
  Object.create(null),
  consistent
);
check(nullPrototype, "consistent_but_unproven");

// Accessors and throwing proxies must fail closed.
const accessor = { ...consistent };
Object.defineProperty(accessor, "staffEvent", {
  get() { throw new Error("should not read accessor"); },
  enumerable: true
});
check(accessor, "unsupported");

const revoked = Proxy.revocable({ ...consistent }, {});
revoked.revoke();
check(revoked.proxy, "unsupported");

console.log("[PASS] StaffEvent causal-provenance readiness contract.");
