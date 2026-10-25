/**
 * Advisory-only Bulk Care writer-participation observations.
 *
 * Caller-supplied observations are not authenticated writer receipts.
 * This contract does not establish durable participation, historical
 * completeness, authorization, execution, replay, or safe retries.
 */

import {
  parseCareBulkMembershipIntent
} from "./careBulkRequestMembershipContract";

export type CareBulkWriterPath =
  | "postCareCandidateAssignBulk"
  | "postCareCandidateUnassignBulk";

export type CareBulkWriterObservation =
  | "observed"
  | "missing"
  | "failed"
  | "uncertain"
  | "contradictory";

export type CareBulkWriterEvidenceAssessment = Readonly<{
  status:
    | "observed_consistent_not_complete"
    | "requires_reconciliation"
    | "contradictory"
    | "invalid_input";
  writerPath: CareBulkWriterPath | null;
  requestId: string | null;
  observedVisitorIds: readonly string[];
  unresolvedVisitorIds: readonly string[];
  inputRejected: boolean;
  advisoryOnly: true;
  writerCoverageVerified: false;
  durableParticipationVerified: false;
  historicalReconciliationVerified: false;
  crossStorageConsistencyVerified: false;
  authorizationPermitted: false;
  executionPermitted: false;
  retryPermitted: false;
  automaticRecoveryPermitted: false;
  productionRolloutPermitted: false;
}>;

const safety = {
  advisoryOnly: true,
  writerCoverageVerified: false,
  durableParticipationVerified: false,
  historicalReconciliationVerified: false,
  crossStorageConsistencyVerified: false,
  authorizationPermitted: false,
  executionPermitted: false,
  retryPermitted: false,
  automaticRecoveryPermitted: false,
  productionRolloutPermitted: false
} as const;

const allowedObservations = new Set<string>([
  "observed", "missing", "failed", "uncertain", "contradictory"
]);

function exactKeys(
  value: object,
  expected: readonly string[]
): boolean {
  const actual = Reflect.ownKeys(value);
  return actual.length === expected.length &&
    expected.every(key => actual.includes(key));
}

function ownData(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !Object.prototype.hasOwnProperty.call(
    descriptor, "value"
  )) {
    throw new Error("missing_or_accessor_property");
  }
  return descriptor.value;
}

function result(
  status: CareBulkWriterEvidenceAssessment["status"],
  writerPath: CareBulkWriterPath | null = null,
  requestId: string | null = null,
  observedVisitorIds: readonly string[] = [],
  unresolvedVisitorIds: readonly string[] = []
): CareBulkWriterEvidenceAssessment {
  return Object.freeze({
    status,
    writerPath,
    requestId,
    observedVisitorIds: Object.freeze([...observedVisitorIds]),
    unresolvedVisitorIds: Object.freeze([...unresolvedVisitorIds]),
    inputRejected: status === "invalid_input",
    ...safety
  });
}

/**
 * Analyze supplied observations only. No storage, I/O, or writer calls.
 *
 * An "observed" observation is untrusted and cannot authorize replay.
 * Missing observations are unresolved, never assumed successful.
 */
export function assessCareBulkWriterParticipationEvidence(
  input: unknown
): CareBulkWriterEvidenceAssessment {
  const invalid = () => result("invalid_input");

  try {
    if (input === null ||
        typeof input !== "object" ||
        Array.isArray(input) ||
        !exactKeys(input, ["writerPath", "membership", "observations"])) {
      return invalid();
    }

    const path = ownData(input, "writerPath");
    const membershipInput = ownData(input, "membership");
    const observationsInput = ownData(input, "observations");

    if (path !== "postCareCandidateAssignBulk" &&
        path !== "postCareCandidateUnassignBulk") {
      return invalid();
    }

    const parsed = parseCareBulkMembershipIntent(membershipInput);
    if (!parsed.intent) return invalid();

    const membership = parsed.intent;
    const expectedPath = membership.kind === "assign"
      ? "postCareCandidateAssignBulk"
      : "postCareCandidateUnassignBulk";

    if (path !== expectedPath ||
        !Array.isArray(observationsInput) ||
        observationsInput.length > membership.visitorIds.length) {
      return invalid();
    }

    const intended = new Set(membership.visitorIds);
    const seen = new Map<string, CareBulkWriterObservation>();

    for (let i = 0; i < observationsInput.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(observationsInput, i)) {
        return invalid();
      }

      const entry = ownData(observationsInput, String(i));

      if (entry === null ||
          typeof entry !== "object" ||
          Array.isArray(entry) ||
          !exactKeys(entry, ["visitorId", "observation"])) {
        return invalid();
      }

      const visitorId = ownData(entry, "visitorId");
      const observation = ownData(entry, "observation");

      if (typeof visitorId !== "string" ||
          !intended.has(visitorId) ||
          seen.has(visitorId) ||
          typeof observation !== "string" ||
          !allowedObservations.has(observation)) {
        return invalid();
      }

      seen.set(visitorId, observation as CareBulkWriterObservation);
    }

    const observed = membership.visitorIds.filter(
      visitorId => seen.get(visitorId) === "observed"
    );
    const unresolved = membership.visitorIds.filter(
      visitorId => seen.get(visitorId) !== "observed"
    );

    const contradictory = [...seen.values()].includes("contradictory");

    const status = contradictory
      ? "contradictory"
      : unresolved.length > 0
        ? "requires_reconciliation"
        : "observed_consistent_not_complete";

    return result(
      status,
      path,
      membership.requestId,
      observed,
      unresolved
    );
  } catch {
    // Hostile proxies, accessors, sparse arrays and malformed inputs
    // fail closed without writer execution.
    return invalid();
  }
}
