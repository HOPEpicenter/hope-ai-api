import { types } from "node:util";
import {
  assessStaffInvitationStorageEvidenceProvenance,
  type StaffInvitationStorageEvidenceProvenanceV1
} from "./staffInvitationStorageEvidenceProvenance.v1";

/**
 * D6-B2 synthetic trusted-evidence boundary.
 *
 * Every input is caller-controlled. Claimed issuer trust and clock values
 * are NOT verified. No credentials, signatures, external evidence, Azure
 * resources, Microsoft Graph, or runtime authorization are accessed.
 */
export const STAFF_INVITATION_TRUSTED_EVIDENCE_VERSION = 1;

export type StaffInvitationTrustedEvidenceInputV1 = Readonly<{
  schemaVersion: 1;
  issuerClaim: Readonly<{
    issuerId: string;
    claimedTrusted: boolean;
  }>;
  timeClaim: Readonly<{
    observedAt: string;
    expiresAt: string;
    evaluatedAt: string;
  }>;
  provenance: StaffInvitationStorageEvidenceProvenanceV1;
}>;

export type StaffInvitationTrustedEvidenceAssessment = Readonly<{
  status:
    | "claims_complete_unverified"
    | "issuer_untrusted"
    | "evidence_incomplete"
    | "evidence_conflicting"
    | "freshness_claim_invalid"
    | "input_rejected";
  diagnostics: readonly string[];
  sensitiveFields: readonly ["displayName", "recipientEmail"];
  advisoryOnly: true;
  authoritative: false;
  issuerIndependentlyVerified: false;
  freshnessIndependentlyVerified: false;
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
  issuerIndependentlyVerified: false,
  freshnessIndependentlyVerified: false,
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

const issuerPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const utcPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function result(
  status: StaffInvitationTrustedEvidenceAssessment["status"],
  diagnostics: readonly string[]
): StaffInvitationTrustedEvidenceAssessment {
  return Object.freeze({
    status,
    diagnostics: Object.freeze([...diagnostics]),
    sensitiveFields,
    ...denied
  });
}

function rejected(): StaffInvitationTrustedEvidenceAssessment {
  return result("input_rejected", ["invalid_trusted_evidence_claim"]);
}

/** Snapshot own data properties without executing accessors. */
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

function claimedTime(value: unknown): number | null {
  if (typeof value !== "string" || !utcPattern.test(value)) {
    return null;
  }

  const parsed = Date.parse(value);
  if (
    !Number.isFinite(parsed) ||
    new Date(parsed).toISOString() !== value
  ) {
    return null;
  }

  return parsed;
}

export function assessStaffInvitationTrustedEvidenceBoundary(
  input: unknown
): StaffInvitationTrustedEvidenceAssessment {
  try {
    const root = snapshot(input, [
      "schemaVersion",
      "issuerClaim",
      "timeClaim",
      "provenance"
    ]);

    if (
      !root ||
      root.schemaVersion !== STAFF_INVITATION_TRUSTED_EVIDENCE_VERSION
    ) {
      return rejected();
    }

    const issuer = snapshot(root.issuerClaim, [
      "issuerId",
      "claimedTrusted"
    ]);

    const time = snapshot(root.timeClaim, [
      "observedAt",
      "expiresAt",
      "evaluatedAt"
    ]);

    if (
      !issuer ||
      !time ||
      typeof issuer.issuerId !== "string" ||
      !issuerPattern.test(issuer.issuerId) ||
      typeof issuer.claimedTrusted !== "boolean"
    ) {
      return rejected();
    }

    // D6-B1 also rejects nested proxies, accessors and extra fields.
    const provenance =
      assessStaffInvitationStorageEvidenceProvenance(
        root.provenance
      );

    if (provenance.status === "input_rejected") {
      return rejected();
    }

    const observed = claimedTime(time.observedAt);
    const expires = claimedTime(time.expiresAt);
    const evaluated = claimedTime(time.evaluatedAt);

    if (
      observed === null ||
      expires === null ||
      evaluated === null
    ) {
      return rejected();
    }

    if (provenance.status === "evidence_conflicting") {
      return result("evidence_conflicting", [
        "conflicting_evidence_claims"
      ]);
    }

    if (provenance.status === "evidence_incomplete") {
      return result("evidence_incomplete", [
        "incomplete_evidence_claims"
      ]);
    }

    if (issuer.claimedTrusted !== true) {
      return result("issuer_untrusted", [
        "issuer_trust_not_established"
      ]);
    }

    if (observed > evaluated || evaluated >= expires) {
      return result("freshness_claim_invalid", [
        "claimed_time_window_invalid"
      ]);
    }

    // Passing the synthetic checks never establishes trust.
    return result("claims_complete_unverified", [
      "issuer_claim_not_authenticated",
      "time_claim_not_independently_verified",
      "storage_controls_not_independently_verified",
      "no_storage_or_execution_authority"
    ]);
  } catch {
    return rejected();
  }
}
