import assert from "node:assert/strict";
import {
  assessKioskExistingStaffBinding
} from "../../src/services/staff/assessKioskExistingStaffBinding";

const tenant = "11111111-1111-4111-8111-111111111111";
const objectId = "22222222-2222-4222-8222-222222222222";
const staffId = "staff-aaaaaaaaaaaaaaaa";
const otherId = "staff-bbbbbbbbbbbbbbbb";

function evidence() {
  return {
    siteName: "hope-kiosk-acceptance-api",
    directorySource: "isolated_canonical_staff_events",
    snapshotComplete: true,
    staffId,
    tenantId: tenant,
    objectId,
    identityVerified: true,
    ownerApprovalVerified: true,
    staffDirectory: [{
      staffId,
      status: "active",
      entraTenantId: null,
      entraObjectId: null
    }]
  };
}

function check(input: unknown, reason: string, eligible = false) {
  const result = assessKioskExistingStaffBinding(input);
  assert.equal(result.reason, reason);
  assert.equal(result.reviewEligible, eligible);
  assert.equal(result.existingStaffCreationPermitted, false);
  assert.equal(result.staffMutationPermitted, false);
  assert.equal(result.authorityActivationPermitted, false);
  assert.equal(result.executionPermitted, false);
  assert.equal(result.authorizationGranted, false);
  assert.equal(result.retryPermitted, false);
}

check(null, "EVIDENCE_MISSING");
check(evidence(), "EXCLUSIVE_AUTHORITY_WRITER_REQUIRED", true);
check({...evidence(), snapshotComplete: false},
  "COMPLETE_DIRECTORY_NOT_ESTABLISHED");
check({...evidence(), identityVerified: false},
  "IDENTITY_OR_APPROVAL_NOT_ESTABLISHED");
check({...evidence(), ownerApprovalVerified: false},
  "IDENTITY_OR_APPROVAL_NOT_ESTABLISHED");
check({...evidence(), staffDirectory: []},
  "ISOLATED_STAFF_RECORD_NOT_FOUND");
check({...evidence(), staffDirectory: [{
  staffId, status: "inactive", entraTenantId: null, entraObjectId: null
}]}, "TARGET_STAFF_NOT_ACTIVE");
check({...evidence(), staffDirectory: [{
  staffId, status: "active", entraTenantId: tenant, entraObjectId: null
}]}, "PARTIAL_BINDING_IN_DIRECTORY");
check({...evidence(), staffDirectory: [
  {staffId, status:"active", entraTenantId:null, entraObjectId:null},
  {staffId, status:"active", entraTenantId:null, entraObjectId:null}
]}, "DIRECTORY_INCONSISTENT");
check({...evidence(), staffDirectory: [
  {staffId, status:"active", entraTenantId:null, entraObjectId:null},
  {staffId:otherId, status:"active", entraTenantId:tenant, entraObjectId:objectId}
]}, "BINDING_OWNED_BY_ANOTHER_STAFF");
check({...evidence(), staffDirectory: [
  {staffId, status:"active", entraTenantId:tenant, entraObjectId:objectId}
]}, "ALREADY_BOUND_AUTHORITY_REVIEW_REQUIRED");
check({...evidence(), staffDirectory: [
  {staffId, status:"active", entraTenantId:tenant, entraObjectId:
  "33333333-3333-4333-8333-333333333333"}
]}, "TARGET_BOUND_TO_DIFFERENT_IDENTITY");
check({...evidence(), directorySource:"original_staging"},
  "ISOLATED_SOURCE_NOT_ESTABLISHED");
check({...evidence(), staffId:"bad-id"}, "STAFF_ID_INVALID");

console.log("EXISTING_STAFF_BINDING_PREFLIGHT_PASSED=True");
console.log("STAFF_MUTATION_PERMITTED=False");
console.log("AUTHORITY_ACTIVATION_PERMITTED=False");
console.log("NO_AZURE_CHANGES=True");
