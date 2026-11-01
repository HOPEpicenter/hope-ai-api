import { types } from "node:util";

/**
 * D6 storage-security evidence assessment.
 *
 * Caller-supplied claims are never independent verification.
 * This module performs no storage access, identity validation,
 * logging, retention enforcement, or production authorization.
 */
export const STAFF_INVITATION_STORAGE_SECURITY_SCHEMA_VERSION = 1;

export type StaffInvitationStorageSecurityEvidenceV1 = Readonly<{
  schemaVersion: 1;
  scopedStorageIdentityVerified: boolean;
  leastPrivilegeVerified: boolean;
  atRestProtectionVerified: boolean;
  diagnosticRedactionVerified: boolean;
  retentionPolicyApproved: boolean;
  accessAuditVerified: boolean;
}>;

export type StaffInvitationStorageSecurityAssessment = Readonly<{
  status:
    | "claims_complete_unverified"
    | "requirements_missing"
    | "input_rejected";
  diagnostics: readonly string[];
  sensitiveFields: readonly ["displayName", "recipientEmail"];
  advisoryOnly: true;
  authoritative: false;
  controlsIndependentlyVerified: false;
  storageAccessPermitted: false;
  executionPermitted: false;
  retryPermitted: false;
  automaticRecoveryPermitted: false;
  graphOutcomeVerified: false;
  productionRolloutPermitted: false;
}>;

const requirementKeys = [
  "scopedStorageIdentityVerified",
  "leastPrivilegeVerified",
  "atRestProtectionVerified",
  "diagnosticRedactionVerified",
  "retentionPolicyApproved",
  "accessAuditVerified"
] as const;

const expectedKeys = [
  "schemaVersion",
  ...requirementKeys
] as const;

const sensitiveFields = Object.freeze([
  "displayName",
  "recipientEmail"
] as const);

const denied = Object.freeze({
  advisoryOnly: true,
  authoritative: false,
  controlsIndependentlyVerified: false,
  storageAccessPermitted: false,
  executionPermitted: false,
  retryPermitted: false,
  automaticRecoveryPermitted: false,
  graphOutcomeVerified: false,
  productionRolloutPermitted: false
} as const);

function assessment(
  status: StaffInvitationStorageSecurityAssessment["status"],
  diagnostics: readonly string[]
): StaffInvitationStorageSecurityAssessment {
  return Object.freeze({
    status,
    diagnostics: Object.freeze([...diagnostics]),
    sensitiveFields,
    ...denied
  });
}

function rejected(): StaffInvitationStorageSecurityAssessment {
  return assessment("input_rejected", ["invalid_security_evidence"]);
}

/**
 * Strictly snapshot own primitive data properties.
 * Refuse proxies, getters, extra keys, and unusual prototypes.
 */
function snapshot(input: unknown): Record<string, unknown> | null {
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
    keys.length !== expectedKeys.length ||
    keys.some(
      key =>
        typeof key !== "string" ||
        !expectedKeys.includes(key as typeof expectedKeys[number])
    )
  ) {
    return null;
  }

  const descriptors = Object.getOwnPropertyDescriptors(input);
  const copy: Record<string, unknown> = Object.create(null);

  for (const key of expectedKeys) {
    const descriptor = descriptors[key];

    if (
      !descriptor ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) {
      return null;
    }

    const value: unknown = descriptor.value;

    if (typeof value !== "boolean" && typeof value !== "number") {
      return null;
    }

    copy[key] = value;
  }

  return copy;
}

export function assessStaffInvitationStorageSecurity(
  input: unknown
): StaffInvitationStorageSecurityAssessment {
  try {
    const evidence = snapshot(input);

    if (
      !evidence ||
      evidence.schemaVersion !==
        STAFF_INVITATION_STORAGE_SECURITY_SCHEMA_VERSION ||
      requirementKeys.some(key => typeof evidence[key] !== "boolean")
    ) {
      return rejected();
    }

    const missing = requirementKeys
      .filter(key => evidence[key] !== true)
      .map(key => `unverified_requirement_${key}`);

    if (missing.length > 0) {
      return assessment("requirements_missing", missing);
    }

    return assessment("claims_complete_unverified", [
      "caller_claims_not_independently_verified",
      "production_storage_review_required",
      "retention_enforcement_not_established",
      "no_execution_or_retry_authority"
    ]);
  } catch {
    return rejected();
  }
}
