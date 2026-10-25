/**
 * Advisory-only aggregation of caller-supplied Bulk Care evidence.
 *
 * Inputs are not authenticated storage or writer facts. Even consistent
 * observations cannot establish execution, completeness or replay safety.
 * Pure in-memory assessment: no storage, I/O, mutation or recovery.
 */
import {
  parseCareBulkMembershipIntent
} from "./careBulkRequestMembershipContract";
import {
  assessCareBulkPerVisitorReceipts
} from "./careBulkPerVisitorReceiptContract";
import {
  assessCareBulkWriterParticipationEvidence
} from "./careBulkWriterParticipationEvidenceContract";
import {
  assessCareBulkReconciliation
} from "./careBulkReconciliationSafetyContract";

export type CareBulkEvidenceGapStatus =
  | "observations_consistent_not_complete"
  | "requires_reconciliation"
  | "contradictory"
  | "invalid_input";

export type CareBulkEvidenceGapAssessment = Readonly<{
  status: CareBulkEvidenceGapStatus;
  requestId: string | null;
  intendedVisitorCount: number;
  unresolvedVisitorIds: readonly string[];
  diagnostics: readonly string[];
  inputRejected: boolean;
  reconciliationRequired: true;
  manualInterventionRequired: true;
  advisoryOnly: true;
  authoritative: false;
  complete: false;
  membershipDurabilityVerified: false;
  receiptAuthenticityVerified: false;
  durableReceiptVerified: false;
  writerCoverageVerified: false;
  durableParticipationVerified: false;
  assignmentExecutionVerified: false;
  crossStorageConsistencyVerified: false;
  historicalReconciliationVerified: false;
  authorizationPermitted: false;
  executionPermitted: false;
  retryPermitted: false;
  automaticRecoveryPermitted: false;
  productionRolloutPermitted: false;
}>;

const permanentGaps = Object.freeze([
  "caller_observations_not_authoritative",
  "bulk_request_membership_not_durably_verified",
  "receipt_authenticity_not_verified",
  "durable_receipt_not_verified",
  "writer_participation_not_verified",
  "assignment_execution_not_verified",
  "cross_storage_consistency_not_verified",
  "historical_completeness_not_verified"
]);

const safety = {
  reconciliationRequired: true,
  manualInterventionRequired: true,
  advisoryOnly: true,
  authoritative: false,
  complete: false,
  membershipDurabilityVerified: false,
  receiptAuthenticityVerified: false,
  durableReceiptVerified: false,
  writerCoverageVerified: false,
  durableParticipationVerified: false,
  assignmentExecutionVerified: false,
  crossStorageConsistencyVerified: false,
  historicalReconciliationVerified: false,
  authorizationPermitted: false,
  executionPermitted: false,
  retryPermitted: false,
  automaticRecoveryPermitted: false,
  productionRolloutPermitted: false
} as const;

function result(
  status: CareBulkEvidenceGapStatus,
  requestId: string | null = null,
  intendedVisitorCount = 0,
  unresolvedVisitorIds: readonly string[] = [],
  additionalDiagnostics: readonly string[] = []
): CareBulkEvidenceGapAssessment {
  return Object.freeze({
    status,
    requestId,
    intendedVisitorCount,
    unresolvedVisitorIds: Object.freeze([...unresolvedVisitorIds]),
    diagnostics: Object.freeze([
      ...permanentGaps,
      ...additionalDiagnostics
    ]),
    inputRejected: status === "invalid_input",
    ...safety
  });
}

function ownData(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
    throw new Error("missing_or_accessor_property");
  }
  return descriptor.value;
}

function exactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Reflect.ownKeys(value);
  return actual.length === expected.length &&
    expected.every(key => actual.includes(key));
}

/**
 * Expected input:
 * {
 *   membership, writerPath, receipts, observations, operations
 * }
 *
 * `operations` uses the existing reconciliation contract's operation
 * shape. Membership supplies the canonical intended visitor IDs.
 */
export function assessCareBulkEvidenceGaps(
  input: unknown
): CareBulkEvidenceGapAssessment {
  const invalid = () => result(
    "invalid_input", null, 0, [],
    ["invalid_combined_evidence_fail_closed"]
  );

  try {
    if (input === null ||
        typeof input !== "object" ||
        Array.isArray(input) ||
        !exactKeys(input, [
          "membership", "writerPath", "receipts",
          "observations", "operations"
        ])) {
      return invalid();
    }

    const membershipInput = ownData(input, "membership");
    const writerPath = ownData(input, "writerPath");
    const receiptsInput = ownData(input, "receipts");
    const observationsInput = ownData(input, "observations");
    const operationsInput = ownData(input, "operations");

    const parsed = parseCareBulkMembershipIntent(membershipInput);
    if (!parsed.intent) return invalid();

    const membership = parsed.intent;
    const receipts = assessCareBulkPerVisitorReceipts({
      membership,
      receipts: receiptsInput
    });
    const writers = assessCareBulkWriterParticipationEvidence({
      membership,
      writerPath,
      observations: observationsInput
    });
    const reconciliation = assessCareBulkReconciliation({
      visitorIds: [...membership.visitorIds],
      operations: operationsInput
    });

    if (receipts.inputRejected ||
        writers.inputRejected ||
        reconciliation.inputRejected ||
        receipts.requestId !== membership.requestId ||
        writers.requestId !== membership.requestId) {
      return invalid();
    }

    const unresolved = new Set([
      ...receipts.unresolvedVisitorIds,
      ...writers.unresolvedVisitorIds,
      ...reconciliation.unresolvedVisitorIds
    ]);

    const unresolvedVisitorIds = membership.visitorIds.filter(
      visitorId => unresolved.has(visitorId)
    );

    const contradictory =
      receipts.status === "contradictory" ||
      writers.status === "contradictory" ||
      reconciliation.status === "contradictory";

    const status: CareBulkEvidenceGapStatus = contradictory
      ? "contradictory"
      : unresolvedVisitorIds.length > 0
        ? "requires_reconciliation"
        : "observations_consistent_not_complete";

    return result(
      status,
      membership.requestId,
      membership.visitorIds.length,
      unresolvedVisitorIds,
      contradictory
        ? ["contradictory_caller_evidence"]
        : unresolvedVisitorIds.length > 0
          ? ["unresolved_visitor_evidence"]
          : ["consistent_observations_still_not_proof"]
    );
  } catch {
    // Hostile proxies, accessors and malformed evidence fail closed.
    return invalid();
  }
}
