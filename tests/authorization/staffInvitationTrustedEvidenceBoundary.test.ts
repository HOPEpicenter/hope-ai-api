import assert from "node:assert/strict";
import {
  assessStaffInvitationTrustedEvidenceBoundary,
  type StaffInvitationTrustedEvidenceAssessment
} from "../../src/contracts/staffInvitationTrustedEvidenceBoundary.v1";

const requirements = [
  "scopedStorageIdentityVerified",
  "leastPrivilegeVerified",
  "atRestProtectionVerified",
  "diagnosticRedactionVerified",
  "retentionPolicyApproved",
  "accessAuditVerified"
] as const;

function valid() {
  return {
    schemaVersion: 1,
    issuerClaim: {
      issuerId: "synthetic-reviewer",
      claimedTrusted: true
    },
    timeClaim: {
      observedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-03T00:00:00.000Z",
      evaluatedAt: "2026-01-02T00:00:00.000Z"
    },
    provenance: {
      schemaVersion: 1,
      observations: Object.fromEntries(
        requirements.map((key, index) => [
          key,
          {
            present: true,
            absent: false,
            evidenceRef: `synthetic-${index}`
          }
        ])
      )
    }
  };
}

function safe(result: StaffInvitationTrustedEvidenceAssessment): void {
  assert.equal(result.advisoryOnly, true);

  for (const key of [
    "authoritative",
    "issuerIndependentlyVerified",
    "freshnessIndependentlyVerified",
    "controlsIndependentlyVerified",
    "storageAccessPermitted",
    "executionPermitted",
    "retryPermitted",
    "automaticRecoveryPermitted",
    "graphOutcomeVerified",
    "productionRolloutPermitted"
  ] as const) {
    assert.equal(result[key], false, key);
  }

  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.diagnostics));
  assert.ok(Object.isFrozen(result.sensitiveFields));

  assert.deepEqual(result.sensitiveFields, [
    "displayName",
    "recipientEmail"
  ]);
}

function inspect(input: unknown) {
  const output = assessStaffInvitationTrustedEvidenceBoundary(input);
  safe(output);
  return output;
}

const complete = inspect(valid());
assert.equal(complete.status, "claims_complete_unverified");
assert.ok(
  complete.diagnostics.includes("issuer_claim_not_authenticated")
);
console.log("PASS complete synthetic claims never authorize");

const untrusted = valid();
untrusted.issuerClaim.claimedTrusted = false;
assert.equal(inspect(untrusted).status, "issuer_untrusted");
console.log("PASS untrusted issuer claim fails closed");

for (const key of requirements) {
  const missing = valid();
  missing.provenance.observations[key].present = false;
  assert.equal(inspect(missing).status, "evidence_incomplete");

  const conflicting = valid();
  conflicting.provenance.observations[key].absent = true;
  assert.equal(
    inspect(conflicting).status,
    "evidence_conflicting"
  );
}
console.log("PASS all six missing and contradictory controls");

const duplicate = valid();
duplicate.provenance.observations.accessAuditVerified.evidenceRef =
  duplicate.provenance.observations.leastPrivilegeVerified.evidenceRef;
assert.equal(inspect(duplicate).status, "evidence_conflicting");
console.log("PASS duplicate evidence references fail closed");

for (const change of [
  (v: ReturnType<typeof valid>) => {
    v.timeClaim.evaluatedAt = "2025-12-31T00:00:00.000Z";
  },
  (v: ReturnType<typeof valid>) => {
    v.timeClaim.evaluatedAt = v.timeClaim.expiresAt;
  },
  (v: ReturnType<typeof valid>) => {
    v.timeClaim.expiresAt = "2025-12-31T00:00:00.000Z";
  }
]) {
  const stale = valid();
  change(stale);
  assert.equal(
    inspect(stale).status,
    "freshness_claim_invalid"
  );
}
console.log("PASS claimed timing inconsistencies fail closed");

for (const input of [
  null,
  [],
  {},
  { ...valid(), schemaVersion: 2 },
  { ...valid(), secret: "private@example.org" },
  new Proxy(valid(), {}),
  Object.create(valid())
]) {
  assert.equal(inspect(input).status, "input_rejected");
}
console.log("PASS malformed top-level input rejected");

const badIssuer = valid();
badIssuer.issuerClaim.issuerId = "private@example.org";
const badIssuerResult = inspect(badIssuer);
assert.equal(badIssuerResult.status, "input_rejected");
assert.equal(
  JSON.stringify(badIssuerResult).includes("private@example.org"),
  false
);

const badTime = valid();
badTime.timeClaim.observedAt = "not-a-date";
assert.equal(inspect(badTime).status, "input_rejected");
console.log("PASS identifiers and timestamps validated");

const hostileIssuer = valid();
let issuerGetterExecuted = false;
Object.defineProperty(hostileIssuer.issuerClaim, "issuerId", {
  enumerable: true,
  get() {
    issuerGetterExecuted = true;
    throw Error("must not execute");
  }
});
assert.equal(inspect(hostileIssuer).status, "input_rejected");
assert.equal(issuerGetterExecuted, false);

const hostileTime = valid();
let timeGetterExecuted = false;
Object.defineProperty(hostileTime.timeClaim, "observedAt", {
  enumerable: true,
  get() {
    timeGetterExecuted = true;
    throw Error("must not execute");
  }
});
assert.equal(inspect(hostileTime).status, "input_rejected");
assert.equal(timeGetterExecuted, false);
console.log("PASS nested accessors never executed");

const nestedProxy = valid();
nestedProxy.issuerClaim = new Proxy(nestedProxy.issuerClaim, {});
assert.equal(inspect(nestedProxy).status, "input_rejected");

const revoked = Proxy.revocable(valid(), {});
revoked.revoke();
assert.equal(inspect(revoked.proxy).status, "input_rejected");

const revokedNested = valid();
const revokedClaim = Proxy.revocable(revokedNested.timeClaim, {});
revokedNested.timeClaim = revokedClaim.proxy;
revokedClaim.revoke();
assert.equal(inspect(revokedNested).status, "input_rejected");
console.log("PASS nested and revoked proxies fail closed");

const hostileProvenance = valid();
let provenanceGetterExecuted = false;
Object.defineProperty(hostileProvenance.provenance.observations, "accessAuditVerified", {
  enumerable: true,
  get() {
    provenanceGetterExecuted = true;
    throw Error("must not execute");
  }
});
assert.equal(inspect(hostileProvenance).status, "input_rejected");
assert.equal(provenanceGetterExecuted, false);
console.log("PASS hostile provenance accessors rejected");

const missingAndMalformedTime = valid();
missingAndMalformedTime.provenance.observations.accessAuditVerified.present =
  false;
missingAndMalformedTime.timeClaim.observedAt = "private@example.org";

const missingAndMalformedResult = inspect(missingAndMalformedTime);
assert.equal(missingAndMalformedResult.status, "input_rejected");
assert.equal(
  JSON.stringify(missingAndMalformedResult).includes("private@example.org"),
  false
);
console.log("PASS malformed time rejected despite missing evidence");

const conflictingAndUntrusted = valid();
conflictingAndUntrusted.issuerClaim.claimedTrusted = false;
conflictingAndUntrusted.provenance.observations.leastPrivilegeVerified.absent =
  true;

const conflictingAndUntrustedResult = inspect(conflictingAndUntrusted);
assert.equal(
  conflictingAndUntrustedResult.status,
  "evidence_conflicting"
);
console.log("PASS conflicting evidence dominates untrusted claim");

const invalidProvenanceAndInvalidTime = valid();
invalidProvenanceAndInvalidTime.provenance.observations.accessAuditVerified.evidenceRef =
  "private@example.org";
invalidProvenanceAndInvalidTime.timeClaim.evaluatedAt = "invalid";

const combinedInvalidResult = inspect(invalidProvenanceAndInvalidTime);
assert.equal(combinedInvalidResult.status, "input_rejected");
assert.equal(
  JSON.stringify(combinedInvalidResult).includes("private@example.org"),
  false
);
console.log("PASS malformed provenance and time fail closed");

const multipleConditions = valid();
multipleConditions.issuerClaim.claimedTrusted = false;
multipleConditions.provenance.observations.accessAuditVerified.present = false;
multipleConditions.timeClaim.evaluatedAt = multipleConditions.timeClaim.expiresAt;

const multipleConditionsResult = inspect(multipleConditions);
assert.equal(multipleConditionsResult.status, "evidence_incomplete");
console.log("PASS multiple negative conditions remain non-authorizing");

const missingAndHostileNested = valid();
missingAndHostileNested.provenance.observations.accessAuditVerified.present =
  false;

let crossGetterExecuted = false;

Object.defineProperty(
  missingAndHostileNested.timeClaim,
  "evaluatedAt",
  {
    enumerable: true,
    get() {
      crossGetterExecuted = true;
      throw Error("cross-condition getter must not execute");
    }
  }
);

const hostileCrossResult = inspect(missingAndHostileNested);
assert.equal(hostileCrossResult.status, "input_rejected");
assert.equal(crossGetterExecuted, false);
console.log("PASS hostile nested getter rejected despite missing evidence");

console.log("PASS D6-B2 trusted evidence boundary tests");
