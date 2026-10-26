/**
 * Advisory-only Bulk Care writer migration readiness.
 *
 * Input values are caller-supplied review claims, not authenticated
 * writer, storage, reconciliation, or deployment evidence.
 *
 * Even a complete set of claims permits architecture review only.
 * No storage access, network calls, writer execution, retry,
 * recovery, authorization, or production rollout is performed.
 */

export const CARE_BULK_WRITER_MIGRATION_GATES = [
  "operation_identity_verified",
  "durable_membership_verified",
  "writer_coverage_verified",
  "authentic_per_visitor_receipts_verified",
  "assignment_ordering_verified",
  "cross_storage_consistency_verified",
  "partial_failure_safety_verified",
  "historical_completeness_verified",
  "authorization_integrity_verified",
  "controlled_rollout_reviewed"
] as const;

export type CareBulkWriterMigrationGate =
  typeof CARE_BULK_WRITER_MIGRATION_GATES[number];

export type CareBulkMigrationGateEvidence =
  "verified" | "unverified" | "failed";

export type CareBulkWriterMigrationEvidence = Readonly<
  Record<CareBulkWriterMigrationGate, CareBulkMigrationGateEvidence>
>;

export type CareBulkWriterMigrationAssessment = Readonly<{
  status: "eligible_for_architecture_review" | "not_ready";
  inputRejected: boolean;
  missingOrFailedGates: readonly CareBulkWriterMigrationGate[];
  diagnostics: readonly string[];
  advisoryOnly: true;
  authoritative: false;
  writerParticipationVerified: false;
  historicalCompletenessVerified: false;
  authorizationPermitted: false;
  enforcementPermitted: false;
  executionPermitted: false;
  retryPermitted: false;
  automaticRecoveryPermitted: false;
  productionRolloutPermitted: false;
}>;

const permittedValues: ReadonlySet<string> =
  new Set(["verified", "unverified", "failed"]);

const expectedGateSet: ReadonlySet<string> =
  new Set(CARE_BULK_WRITER_MIGRATION_GATES);

const safety = Object.freeze({
  advisoryOnly: true,
  authoritative: false,
  writerParticipationVerified: false,
  historicalCompletenessVerified: false,
  authorizationPermitted: false,
  enforcementPermitted: false,
  executionPermitted: false,
  retryPermitted: false,
  automaticRecoveryPermitted: false,
  productionRolloutPermitted: false
} as const);

function result(
  status: CareBulkWriterMigrationAssessment["status"],
  inputRejected: boolean,
  missingOrFailedGates: readonly CareBulkWriterMigrationGate[],
  diagnostics: readonly string[]
): CareBulkWriterMigrationAssessment {
  return Object.freeze({
    status,
    inputRejected,
    missingOrFailedGates: Object.freeze([...missingOrFailedGates]),
    diagnostics: Object.freeze([...diagnostics]),
    ...safety
  });
}

function invalid(): CareBulkWriterMigrationAssessment {
  return result(
    "not_ready",
    true,
    CARE_BULK_WRITER_MIGRATION_GATES,
    ["migration_evidence_invalid_fail_closed"]
  );
}

export function assessCareBulkWriterMigrationReadiness(
  input: unknown
): CareBulkWriterMigrationAssessment {
  try {
    if (input === null ||
        typeof input !== "object" ||
        Array.isArray(input)) {
      return invalid();
    }

    const keys = Reflect.ownKeys(input);

    if (keys.length !== CARE_BULK_WRITER_MIGRATION_GATES.length ||
        keys.some(key =>
          typeof key !== "string" || !expectedGateSet.has(key)
        )) {
      return invalid();
    }

    const missingOrFailed: CareBulkWriterMigrationGate[] = [];
    const diagnostics: string[] = [];

    for (const gate of CARE_BULK_WRITER_MIGRATION_GATES) {
      // Inspect own data descriptors only. Never invoke accessors.
      const descriptor = Object.getOwnPropertyDescriptor(input, gate);

      if (!descriptor ||
          !Object.prototype.hasOwnProperty.call(descriptor, "value") ||
          typeof descriptor.value !== "string" ||
          !permittedValues.has(descriptor.value)) {
        return invalid();
      }

      if (descriptor.value !== "verified") {
        missingOrFailed.push(gate);
        diagnostics.push(`gate:${gate}:${descriptor.value}`);
      }
    }

    if (missingOrFailed.length === 0) {
      diagnostics.push("review_eligible_not_authorized");
    }

    return result(
      missingOrFailed.length === 0
        ? "eligible_for_architecture_review"
        : "not_ready",
      false,
      missingOrFailed,
      diagnostics
    );
  } catch {
    // Hostile proxies and reflection errors must fail closed.
    return invalid();
  }
}
