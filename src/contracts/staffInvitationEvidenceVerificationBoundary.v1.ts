import { types } from "node:util";

/**
 * D6-B4 synthetic evidence-verification boundary.
 *
 * All values are caller-controlled. This contract DOES NOT authenticate
 * issuers, verify cryptographic integrity, obtain trusted time, inspect
 * Azure resources, or establish effective storage permissions.
 *
 * A complete claim set is never independently verified evidence.
 */
export const STAFF_INVITATION_EVIDENCE_VERIFICATION_VERSION = 1;

export type StaffInvitationEvidenceVerificationInputV1 = Readonly<{
  schemaVersion: 1;
  issuerAuthenticatedClaim: boolean;
  trustedClockClaim: boolean;
  resourceBindingClaim: boolean;
  integrityVerifiedClaim: boolean;
  replayExcludedClaim: boolean;
  contradictoryEvidenceClaim: boolean;
  controls: Readonly<{
    scopedStorageIdentityVerified: boolean;
    leastPrivilegeVerified: boolean;
    atRestProtectionVerified: boolean;
    diagnosticRedactionVerified: boolean;
    retentionPolicyApproved: boolean;
    accessAuditVerified: boolean;
  }>;
}>;

export type StaffInvitationEvidenceVerificationAssessmentV1 = Readonly<{
  status:
    | "claims_complete_unverified"
    | "claims_incomplete"
    | "evidence_conflicting"
    | "input_rejected";
  diagnostics: readonly string[];
  sensitiveFields: readonly ["displayName", "recipientEmail"];
  advisoryOnly: true;
  authoritative: false;
  issuerIndependentlyVerified: false;
  freshnessIndependentlyVerified: false;
  resourceIndependentlyVerified: false;
  integrityIndependentlyVerified: false;
  controlsIndependentlyVerified: false;
  storageAccessPermitted: false;
  executionPermitted: false;
  retryPermitted: false;
  automaticRecoveryPermitted: false;
  graphOutcomeVerified: false;
  productionRolloutPermitted: false;
}>;

const rootKeys = [
  "schemaVersion",
  "issuerAuthenticatedClaim",
  "trustedClockClaim",
  "resourceBindingClaim",
  "integrityVerifiedClaim",
  "replayExcludedClaim",
  "contradictoryEvidenceClaim",
  "controls"
] as const;

const controlKeys = [
  "scopedStorageIdentityVerified",
  "leastPrivilegeVerified",
  "atRestProtectionVerified",
  "diagnosticRedactionVerified",
  "retentionPolicyApproved",
  "accessAuditVerified"
] as const;

const denied = Object.freeze({
  advisoryOnly: true,
  authoritative: false,
  issuerIndependentlyVerified: false,
  freshnessIndependentlyVerified: false,
  resourceIndependentlyVerified: false,
  integrityIndependentlyVerified: false,
  controlsIndependentlyVerified: false,
  storageAccessPermitted: false,
  executionPermitted: false,
  retryPermitted: false,
  automaticRecoveryPermitted: false,
  graphOutcomeVerified: false,
  productionRolloutPermitted: false
} as const);

const sensitiveFields = Object.freeze([
  "displayName",
  "recipientEmail"
] as const);

function result(
  status: StaffInvitationEvidenceVerificationAssessmentV1["status"],
  diagnostics: readonly string[]
): StaffInvitationEvidenceVerificationAssessmentV1 {
  return Object.freeze({
    status,
    diagnostics: Object.freeze([...diagnostics]),
    sensitiveFields,
    ...denied
  });
}

function rejected(): StaffInvitationEvidenceVerificationAssessmentV1 {
  return result("input_rejected", ["invalid_verification_claim"]);
}

/**
 * Reject proxies, accessors, inherited properties, symbols,
 * unexpected keys, and non-enumerable input properties.
 * Never invoke caller-controlled getters.
 */
function snapshot(
  input: unknown,
  expected: readonly string[]
): Record<string, unknown> | null {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    types.isProxy(input)
  ) {
    return null;
  }

  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    return null;
  }

  const keys = Reflect.ownKeys(input);

  if (
    keys.length !== expected.length ||
    keys.some(
      key => typeof key !== "string" || !expected.includes(key)
    )
  ) {
    return null;
  }

  const descriptors = Object.getOwnPropertyDescriptors(input);
  const copy: Record<string, unknown> = Object.create(null);

  for (const key of expected) {
    const descriptor = descriptors[key];

    if (
      !descriptor ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) {
      return null;
    }

    copy[key] = descriptor.value;
  }

  return copy;
}

export function assessStaffInvitationEvidenceVerificationBoundary(
  input: unknown
): StaffInvitationEvidenceVerificationAssessmentV1 {
  try {
    const root = snapshot(input, rootKeys);

    if (
      !root ||
      root.schemaVersion !==
        STAFF_INVITATION_EVIDENCE_VERIFICATION_VERSION
    ) {
      return rejected();
    }

    const controls = snapshot(root.controls, controlKeys);

    if (
      !controls ||
      rootKeys
        .filter(key =>
          key !== "schemaVersion" && key !== "controls"
        )
        .some(key => typeof root[key] !== "boolean") ||
      controlKeys.some(key => typeof controls[key] !== "boolean")
    ) {
      return rejected();
    }

    if (root.contradictoryEvidenceClaim === true) {
      return result("evidence_conflicting", [
        "contradictory_evidence_claim"
      ]);
    }

    const missing = [
      ...rootKeys
        .filter(key =>
          key !== "schemaVersion" &&
          key !== "controls" &&
          key !== "contradictoryEvidenceClaim"
        )
        .filter(key => root[key] !== true)
        .map(key => `unverified_claim_${key}`),
      ...controlKeys
        .filter(key => controls[key] !== true)
        .map(key => `unverified_control_${key}`)
    ];

    if (missing.length > 0) {
      return result("claims_incomplete", missing);
    }

    return result("claims_complete_unverified", [
      "caller_claims_not_authenticated",
      "trusted_clock_not_established",
      "resource_binding_not_independently_verified",
      "integrity_and_replay_not_independently_verified",
      "azure_controls_not_independently_verified",
      "no_storage_or_execution_authority"
    ]);
  } catch {
    return rejected();
  }
}
