import assert from "node:assert/strict";
import {
  assessStaffInvitationStorageEvidenceProvenance,
  type StaffInvitationStorageProvenanceAssessment
} from "../../src/contracts/staffInvitationStorageEvidenceProvenance.v1";

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
  };
}

function safe(result: StaffInvitationStorageProvenanceAssessment): void {
  assert.equal(result.advisoryOnly, true);

  for (const key of [
    "authoritative",
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

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("private@example.org"), false);
}

const complete = assessStaffInvitationStorageEvidenceProvenance(
  valid()
);
assert.equal(complete.status, "claims_complete_unverified");
safe(complete);
console.log("PASS complete claims never authorize");

for (const key of requirements) {
  const input = valid();
  input.observations[key].present = false;

  const result = assessStaffInvitationStorageEvidenceProvenance(
    input
  );

  assert.equal(result.status, "evidence_incomplete");
  assert.ok(
    result.diagnostics.includes(`missing_observation_${key}`)
  );
  safe(result);
}
console.log("PASS every missing control fails closed");

for (const key of requirements) {
  const input = valid();
  input.observations[key].absent = true;

  const result = assessStaffInvitationStorageEvidenceProvenance(
    input
  );

  assert.equal(result.status, "evidence_conflicting");
  safe(result);
}
console.log("PASS contradictory observations fail closed");

const duplicate = valid();
duplicate.observations.leastPrivilegeVerified.evidenceRef =
  duplicate.observations.scopedStorageIdentityVerified.evidenceRef;

const duplicateResult =
  assessStaffInvitationStorageEvidenceProvenance(duplicate);

assert.equal(duplicateResult.status, "evidence_conflicting");
safe(duplicateResult);
console.log("PASS duplicate provenance references rejected");

for (const input of [
  null,
  [],
  {},
  { ...valid(), schemaVersion: 2 },
  { ...valid(), unexpected: true },
  { ...valid(), recipientEmail: "private@example.org" },
  { ...valid(), observations: {} },
  { ...valid(), observations: null },
  { ...valid(), observations: new Proxy(valid().observations, {}) },
  new Proxy(valid(), {}),
  Object.create(valid())
]) {
  const result = assessStaffInvitationStorageEvidenceProvenance(
    input
  );
  assert.equal(result.status, "input_rejected");
  safe(result);
}
console.log("PASS malformed inputs and proxies rejected");

const badNested = valid();
badNested.observations.accessAuditVerified.evidenceRef =
  "private@example.org";

const nestedResult =
  assessStaffInvitationStorageEvidenceProvenance(badNested);

assert.equal(nestedResult.status, "input_rejected");
safe(nestedResult);

const unexpectedNested = valid();
Object.assign(unexpectedNested.observations.accessAuditVerified, {
  secret: "private@example.org"
});

assert.equal(
  assessStaffInvitationStorageEvidenceProvenance(
    unexpectedNested
  ).status,
  "input_rejected"
);

const hostile = valid();
let getterCalled = false;

Object.defineProperty(
  hostile.observations.accessAuditVerified,
  "present",
  {
    enumerable: true,
    get() {
      getterCalled = true;
      throw Error("getter must not execute");
    }
  }
);

assert.equal(
  assessStaffInvitationStorageEvidenceProvenance(hostile).status,
  "input_rejected"
);
assert.equal(getterCalled, false);
console.log("PASS nested accessors and extra fields rejected");

const revoked = Proxy.revocable(valid(), {});
revoked.revoke();

const revokedResult =
  assessStaffInvitationStorageEvidenceProvenance(revoked.proxy);

assert.equal(revokedResult.status, "input_rejected");
safe(revokedResult);
console.log("PASS revoked proxy fails closed");

const nestedProxy = valid();
nestedProxy.observations.accessAuditVerified =
  new Proxy(nestedProxy.observations.accessAuditVerified, {});

const nestedProxyResult =
  assessStaffInvitationStorageEvidenceProvenance(nestedProxy);

assert.equal(nestedProxyResult.status, "input_rejected");
safe(nestedProxyResult);

const revokedNested = valid();
const revokedObservation = Proxy.revocable(
  revokedNested.observations.leastPrivilegeVerified,
  {}
);
revokedNested.observations.leastPrivilegeVerified =
  revokedObservation.proxy;
revokedObservation.revoke();

const revokedNestedResult =
  assessStaffInvitationStorageEvidenceProvenance(revokedNested);

assert.equal(revokedNestedResult.status, "input_rejected");
safe(revokedNestedResult);
console.log("PASS nested and revoked observation proxies rejected");

const hostileContainer = valid();
let containerGetterCalled = false;

Object.defineProperty(
  hostileContainer.observations,
  "accessAuditVerified",
  {
    enumerable: true,
    get() {
      containerGetterCalled = true;
      throw Error("container getter must not execute");
    }
  }
);

const hostileContainerResult =
  assessStaffInvitationStorageEvidenceProvenance(hostileContainer);

assert.equal(hostileContainerResult.status, "input_rejected");
assert.equal(containerGetterCalled, false);
safe(hostileContainerResult);
console.log("PASS observation container getter not executed");

const multipleMissing = valid();
multipleMissing.observations.leastPrivilegeVerified.present = false;
multipleMissing.observations.accessAuditVerified.present = false;

const multipleMissingResult =
  assessStaffInvitationStorageEvidenceProvenance(multipleMissing);

assert.equal(multipleMissingResult.status, "evidence_incomplete");
assert.equal(multipleMissingResult.diagnostics.length, 2);
safe(multipleMissingResult);

const multipleConflicts = valid();
multipleConflicts.observations.scopedStorageIdentityVerified.absent = true;
multipleConflicts.observations.atRestProtectionVerified.absent = true;

const multipleConflictsResult =
  assessStaffInvitationStorageEvidenceProvenance(multipleConflicts);

assert.equal(multipleConflictsResult.status, "evidence_conflicting");
assert.equal(multipleConflictsResult.diagnostics.length, 2);
safe(multipleConflictsResult);
console.log("PASS multiple missing and conflicting controls fail closed");

const privacyInput = valid();
privacyInput.observations.accessAuditVerified.evidenceRef =
  "private@example.org";

const privacyResult =
  assessStaffInvitationStorageEvidenceProvenance(privacyInput);

assert.equal(privacyResult.status, "input_rejected");
assert.equal(
  JSON.stringify(privacyResult).includes("private@example.org"),
  false
);
safe(privacyResult);
console.log("PASS sensitive values excluded from diagnostics");

console.log("PASS D6-B1 provenance contract tests");
