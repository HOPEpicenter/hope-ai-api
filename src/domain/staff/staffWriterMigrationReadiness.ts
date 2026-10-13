/**
 * Advisory-only staff writer migration readiness assessment.
 *
 * Evidence values describe review claims, not independently verified
 * storage facts. Even a complete assessment never grants authority,
 * execution, retry, recovery, or production rollout permission.
 *
 * No storage, Azure, Graph, OAuth, or production writer access.
 */

export const STAFF_WRITER_MIGRATION_GATES = [
  "legacy_writers_fenced",
  "canonical_directory_compatible",
  "staff_audit_compatible",
  "binding_uniqueness_verified",
  "atomic_ordering_verified",
  "uncertain_outcomes_reviewed",
  "invitation_side_effects_reviewed"
] as const;

export type StaffWriterMigrationGate =
  typeof STAFF_WRITER_MIGRATION_GATES[number];

export type MigrationGateEvidence =
  "verified" | "unverified" | "failed";

export type StaffWriterMigrationEvidence = Readonly<
  Record<StaffWriterMigrationGate, MigrationGateEvidence>
>;

export type StaffWriterMigrationAssessment = Readonly<{
  status: "eligible_for_architecture_review" | "not_ready";
  inputRejected: boolean;
  missingOrFailedGates: readonly StaffWriterMigrationGate[];
  diagnostics: readonly string[];
  advisoryOnly: true;
  authoritative: false;
  enforcementPermitted: false;
  executionPermitted: false;
  retryPermitted: false;
  automaticRecoveryPermitted: false;
  productionRolloutPermitted: false;
}>;

const gateSet: ReadonlySet<string> =
  new Set(STAFF_WRITER_MIGRATION_GATES);

const values: ReadonlySet<string> =
  new Set(["verified", "unverified", "failed"]);

const nonAuthorizing = {
  advisoryOnly: true,
  authoritative: false,
  enforcementPermitted: false,
  executionPermitted: false,
  retryPermitted: false,
  automaticRecoveryPermitted: false,
  productionRolloutPermitted: false
} as const;

function invalidAssessment(): StaffWriterMigrationAssessment {
  return {
    status: "not_ready",
    inputRejected: true,
    missingOrFailedGates: [...STAFF_WRITER_MIGRATION_GATES],
    diagnostics: ["migration_evidence_invalid_fail_closed"],
    ...nonAuthorizing
  };
}

export function assessStaffWriterMigrationReadiness(
  evidence: unknown
): StaffWriterMigrationAssessment {
  try {
    if (
      evidence === null ||
      typeof evidence !== "object" ||
      Array.isArray(evidence)
    ) {
      return invalidAssessment();
    }

    const keys = Reflect.ownKeys(evidence);

    if (
      keys.length !== STAFF_WRITER_MIGRATION_GATES.length ||
      keys.some(key => typeof key !== "string" || !gateSet.has(key))
    ) {
      return invalidAssessment();
    }

    const record = evidence as Record<string, unknown>;
    const failed: StaffWriterMigrationGate[] = [];
    const diagnostics: string[] = [];

    for (const gate of STAFF_WRITER_MIGRATION_GATES) {
      // Accessors and inherited properties must not supply evidence.
      const descriptor = Object.getOwnPropertyDescriptor(record, gate);

      if (
        !descriptor ||
        !Object.prototype.hasOwnProperty.call(descriptor, "value") ||
        typeof descriptor.value !== "string" ||
        !values.has(descriptor.value)
      ) {
        return invalidAssessment();
      }

      if (descriptor.value !== "verified") {
        failed.push(gate);
        diagnostics.push(`gate:${gate}:${descriptor.value}`);
      }
    }

    const complete = failed.length === 0;

    if (complete) {
      diagnostics.push("review_eligible_not_authorized");
    }

    return {
      status: complete
        ? "eligible_for_architecture_review"
        : "not_ready",
      inputRejected: false,
      missingOrFailedGates: failed,
      diagnostics,
      ...nonAuthorizing
    };
  } catch {
    // Revoked proxies and hostile reflection must fail closed.
    return invalidAssessment();
  }
}
