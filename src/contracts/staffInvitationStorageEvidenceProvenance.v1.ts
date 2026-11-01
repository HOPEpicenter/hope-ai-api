import { types } from "node:util";

/**
 * D6-B1 synthetic storage evidence provenance assessment.
 *
 * Evidence references and observations are caller-supplied claims.
 * No issuer authentication, trusted clock, Azure verification,
 * storage access, logging, or execution occurs here.
 */
export const STAFF_INVITATION_STORAGE_PROVENANCE_VERSION = 1;

const requirements = [
  "scopedStorageIdentityVerified",
  "leastPrivilegeVerified",
  "atRestProtectionVerified",
  "diagnosticRedactionVerified",
  "retentionPolicyApproved",
  "accessAuditVerified"
] as const;

type Requirement = typeof requirements[number];

export type StaffInvitationProvenanceObservationV1 = Readonly<{
  present: boolean;
  absent: boolean;
  evidenceRef: string;
}>;

export type StaffInvitationStorageEvidenceProvenanceV1 = Readonly<{
  schemaVersion: 1;
  observations: Readonly<
    Record<Requirement, StaffInvitationProvenanceObservationV1>
  >;
}>;

export type StaffInvitationStorageProvenanceAssessment = Readonly<{
  status:
    | "claims_complete_unverified"
    | "evidence_incomplete"
    | "evidence_conflicting"
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

const sensitiveFields = Object.freeze([
  "displayName",
  "recipientEmail"
] as const);

const evidenceRefPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

function result(
  status: StaffInvitationStorageProvenanceAssessment["status"],
  diagnostics: readonly string[]
): StaffInvitationStorageProvenanceAssessment {
  return Object.freeze({
    status,
    diagnostics: Object.freeze([...diagnostics]),
    sensitiveFields,
    ...denied
  });
}

function rejected(): StaffInvitationStorageProvenanceAssessment {
  return result("input_rejected", ["invalid_provenance_evidence"]);
}

/**
 * Reads only own enumerable data descriptors, without invoking getters.
 * Rejects proxies, symbols, inherited values, and unexpected properties.
 */
function snapshot(
  input: unknown,
  expectedKeys: readonly string[]
): Record<string, unknown> | null {
  if (
    input === null ||
    typeof input !== "object" ||
    types.isProxy(input) ||
    Array.isArray(input)
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
      key => typeof key !== "string" || !expectedKeys.includes(key)
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

    copy[key] = descriptor.value;
  }

  return copy;
}

export function assessStaffInvitationStorageEvidenceProvenance(
  input: unknown
): StaffInvitationStorageProvenanceAssessment {
  try {
    const evidence = snapshot(input, [
      "schemaVersion",
      "observations"
    ]);

    if (
      !evidence ||
      evidence.schemaVersion !==
        STAFF_INVITATION_STORAGE_PROVENANCE_VERSION
    ) {
      return rejected();
    }

    const observations = snapshot(
      evidence.observations,
      requirements
    );

    if (!observations) {
      return rejected();
    }

    const incomplete: string[] = [];
    const conflicting: string[] = [];
    const references = new Set<string>();

    for (const key of requirements) {
      const observation = snapshot(observations[key], [
        "present",
        "absent",
        "evidenceRef"
      ]);

      if (
        !observation ||
        typeof observation.present !== "boolean" ||
        typeof observation.absent !== "boolean" ||
        typeof observation.evidenceRef !== "string" ||
        !evidenceRefPattern.test(observation.evidenceRef)
      ) {
        return rejected();
      }

      // A reference is an untrusted identifier, not an attestation.
      if (references.has(observation.evidenceRef)) {
        conflicting.push(`duplicate_evidence_reference_${key}`);
      }
      references.add(observation.evidenceRef);

      if (observation.present && observation.absent) {
        conflicting.push(`conflicting_observation_${key}`);
      } else if (!observation.present) {
        incomplete.push(`missing_observation_${key}`);
      }
    }

    if (conflicting.length > 0) {
      return result("evidence_conflicting", conflicting);
    }

    if (incomplete.length > 0) {
      return result("evidence_incomplete", incomplete);
    }

    return result("claims_complete_unverified", [
      "provenance_claims_not_authenticated",
      "trusted_control_verification_required",
      "no_storage_or_execution_authority"
    ]);
  } catch {
    return rejected();
  }
}
