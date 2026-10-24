/**
 * Advisory-only bulk Care assignment reconciliation assessment.
 *
 * Inputs are caller-supplied observations, NOT independently verified
 * storage facts. This function does not read storage, establish request
 * provenance, prove complete history, or grant visitor access.
 *
 * No side effects, retries, repairs, recovery, or production rollout.
 */

export type CareBulkLedgerObservation =
  | "observed_current"
  | "observed_historical"
  | "absent_or_unavailable"
  | "inconsistent"
  | "not_inspected";

export type CareBulkReconciliationStatus =
  | "observations_consistent_not_complete"
  | "requires_reconciliation"
  | "contradictory"
  | "invalid_input";

export type CareBulkReconciliationAssessment = Readonly<{
  status: CareBulkReconciliationStatus;
  inputRejected: boolean;
  intendedVisitorCount: number;
  assessedVisitorCount: number;
  unresolvedVisitorIds: readonly string[];
  diagnostics: readonly string[];
  reconciliationRequired: boolean;
  manualInterventionRequired: boolean;
  advisoryOnly: true;
  authoritative: false;
  complete: false;
  writerCoverageVerified: false;
  historicalReconciliationVerified: false;
  authorizationPermitted: false;
  retryPermitted: false;
  automaticRecoveryPermitted: false;
  productionRolloutPermitted: false;
}>;

const nonAuthorizing = {
  advisoryOnly: true,
  authoritative: false,
  complete: false,
  writerCoverageVerified: false,
  historicalReconciliationVerified: false,
  authorizationPermitted: false,
  retryPermitted: false,
  automaticRecoveryPermitted: false,
  productionRolloutPermitted: false
} as const;

const observations: ReadonlySet<string> = new Set([
  "observed_current",
  "observed_historical",
  "absent_or_unavailable",
  "inconsistent",
  "not_inspected"
]);

function ownValue(record: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
    throw new Error("Missing own data property");
  }
  return descriptor.value;
}

function exactKeys(record: object, expected: readonly string[]): boolean {
  const keys = Reflect.ownKeys(record);
  return keys.length === expected.length &&
    keys.every(key => typeof key === "string" && expected.includes(key));
}

function validId(value: unknown): value is string {
  return typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 128 &&
    value.trim() === value &&
    /^[A-Za-z0-9_-]+$/.test(value);
}

function blocked(): CareBulkReconciliationAssessment {
  return {
    status: "invalid_input",
    inputRejected: true,
    intendedVisitorCount: 0,
    assessedVisitorCount: 0,
    unresolvedVisitorIds: [],
    diagnostics: ["invalid_bulk_reconciliation_evidence_fail_closed"],
    reconciliationRequired: true,
    manualInterventionRequired: true,
    ...nonAuthorizing
  };
}

/**
 * Expected input:
 * {
 *   visitorIds: string[],
 *   operations: Array<{
 *     visitorId: string,
 *     operationId: string,
 *     ledgerObservation: CareBulkLedgerObservation
 *   }>
 * }
 *
 * The visitor list is unverified caller evidence. Matching counts and
 * operation IDs do not prove durable bulk-request membership.
 */
export function assessCareBulkReconciliation(
  evidence: unknown
): CareBulkReconciliationAssessment {
  try {
    if (!evidence ||
        typeof evidence !== "object" ||
        Array.isArray(evidence) ||
        !exactKeys(evidence, ["visitorIds", "operations"])) {
      return blocked();
    }

    const visitorIds = ownValue(evidence, "visitorIds");
    const operations = ownValue(evidence, "operations");

    if (!Array.isArray(visitorIds) ||
        !Array.isArray(operations) ||
        visitorIds.length < 1 ||
        visitorIds.length > 1000 ||
        operations.length > 1000) {
      return blocked();
    }

    // Reject sparse evidence arrays before interpreting observations.
    for (let i = 0; i < visitorIds.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(visitorIds, i)) {
        return blocked();
      }
    }

    for (let i = 0; i < operations.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(operations, i)) {
        return blocked();
      }
    }

    const intended = new Set<string>();

    for (const visitorId of visitorIds) {
      if (!validId(visitorId) || intended.has(visitorId)) {
        return blocked();
      }
      intended.add(visitorId);
    }

    const assessed = new Map<string, CareBulkLedgerObservation>();
    const operationIds = new Set<string>();

    for (const entry of operations) {
      if (!entry ||
          typeof entry !== "object" ||
          Array.isArray(entry) ||
          !exactKeys(entry, [
            "visitorId",
            "operationId",
            "ledgerObservation"
          ])) {
        return blocked();
      }

      const visitorId = ownValue(entry, "visitorId");
      const operationId = ownValue(entry, "operationId");
      const observation = ownValue(entry, "ledgerObservation");

      if (!validId(visitorId) ||
          !validId(operationId) ||
          typeof observation !== "string" ||
          !observations.has(observation) ||
          !intended.has(visitorId) ||
          assessed.has(visitorId) ||
          operationIds.has(operationId)) {
        return blocked();
      }

      assessed.set(
        visitorId,
        observation as CareBulkLedgerObservation
      );
      operationIds.add(operationId);
    }

    const unresolved = [...intended].filter(visitorId => {
      const observation = assessed.get(visitorId);
      return observation !== "observed_current" &&
        observation !== "observed_historical";
    });

    const contradictory = [...assessed.values()].some(
      value => value === "inconsistent"
    );

    const fullyObserved = unresolved.length === 0 &&
      assessed.size === intended.size &&
      !contradictory;

    const status: CareBulkReconciliationStatus = contradictory
      ? "contradictory"
      : fullyObserved
        ? "observations_consistent_not_complete"
        : "requires_reconciliation";

    return {
      status,
      inputRejected: false,
      intendedVisitorCount: intended.size,
      assessedVisitorCount: assessed.size,
      unresolvedVisitorIds: unresolved,
      diagnostics: [
        "caller_observations_not_authoritative",
        "bulk_request_membership_not_durably_verified",
        "writer_participation_not_verified",
        "cross_storage_consistency_not_verified",
        "historical_completeness_not_verified"
      ],
      reconciliationRequired: true,
      manualInterventionRequired: true,
      ...nonAuthorizing
    };
  } catch {
    // Accessors, proxies, and hostile reflection fail closed.
    return blocked();
  }
}
