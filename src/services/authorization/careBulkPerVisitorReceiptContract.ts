/**
 * Advisory-only Bulk Care per-visitor receipt contract.
 *
 * Receipts supplied by callers are NOT authenticated writer evidence.
 * Receipt identity and structure do not prove assignment execution.
 * No storage, authorization, retry, replay, or recovery is performed.
 */

import {
  parseCareBulkMembershipIntent
} from "./careBulkRequestMembershipContract";

export type CareBulkReceiptObservation =
  | "observed"
  | "missing"
  | "failed"
  | "uncertain"
  | "contradictory";

export type CareBulkPerVisitorReceipt = Readonly<{
  receiptId: string;
  requestId: string;
  visitorId: string;
  kind: "assign" | "unassign";
  assigneeId: string | null;
  observation: CareBulkReceiptObservation;
}>;

export type CareBulkReceiptAssessment = Readonly<{
  status:
    | "observed_unverified"
    | "requires_reconciliation"
    | "contradictory"
    | "invalid_input";
  requestId: string | null;
  receipts: readonly CareBulkPerVisitorReceipt[];
  unresolvedVisitorIds: readonly string[];
  inputRejected: boolean;
  advisoryOnly: true;
  receiptAuthenticityVerified: false;
  writerCoverageVerified: false;
  durableReceiptVerified: false;
  assignmentExecutionVerified: false;
  historicalReconciliationVerified: false;
  authorizationPermitted: false;
  executionPermitted: false;
  retryPermitted: false;
  automaticRecoveryPermitted: false;
  productionRolloutPermitted: false;
}>;

const safety = {
  advisoryOnly: true,
  receiptAuthenticityVerified: false,
  writerCoverageVerified: false,
  durableReceiptVerified: false,
  assignmentExecutionVerified: false,
  historicalReconciliationVerified: false,
  authorizationPermitted: false,
  executionPermitted: false,
  retryPermitted: false,
  automaticRecoveryPermitted: false,
  productionRolloutPermitted: false
} as const;

const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
const observations = new Set<string>([
  "observed", "missing", "failed", "uncertain", "contradictory"
]);

function exactKeys(value: object, keys: readonly string[]): boolean {
  const actual = Reflect.ownKeys(value);
  return actual.length === keys.length &&
    keys.every(key => actual.includes(key));
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

function id(value: unknown): value is string {
  return typeof value === "string" && idPattern.test(value);
}

function result(
  status: CareBulkReceiptAssessment["status"],
  requestId: string | null = null,
  receipts: readonly CareBulkPerVisitorReceipt[] = [],
  unresolvedVisitorIds: readonly string[] = []
): CareBulkReceiptAssessment {
  return Object.freeze({
    status,
    requestId,
    receipts: Object.freeze([...receipts]),
    unresolvedVisitorIds: Object.freeze([...unresolvedVisitorIds]),
    inputRejected: status === "invalid_input",
    ...safety
  });
}

/**
 * Validates correlation with immutable membership only.
 * No receipt can establish that a writer ran or a mutation committed.
 */
export function assessCareBulkPerVisitorReceipts(
  input: unknown
): CareBulkReceiptAssessment {
  const invalid = () => result("invalid_input");

  try {
    if (input === null ||
        typeof input !== "object" ||
        Array.isArray(input) ||
        !exactKeys(input, ["membership", "receipts"])) {
      return invalid();
    }

    const membershipInput = ownData(input, "membership");
    const receiptsInput = ownData(input, "receipts");
    const parsed = parseCareBulkMembershipIntent(membershipInput);

    if (!parsed.intent ||
        !Array.isArray(receiptsInput) ||
        receiptsInput.length > parsed.intent.visitorIds.length) {
      return invalid();
    }

    const membership = parsed.intent;
    const intended = new Set(membership.visitorIds);
    const receiptIds = new Set<string>();
    const visitorIds = new Set<string>();
    const accepted: CareBulkPerVisitorReceipt[] = [];

    for (let i = 0; i < receiptsInput.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(receiptsInput, i)) {
        return invalid();
      }

      const entry = ownData(receiptsInput, String(i));

      if (entry === null ||
          typeof entry !== "object" ||
          Array.isArray(entry) ||
          !exactKeys(entry, [
            "receiptId", "requestId", "visitorId",
            "kind", "assigneeId", "observation"
          ])) {
        return invalid();
      }

      const receiptId = ownData(entry, "receiptId");
      const requestId = ownData(entry, "requestId");
      const visitorId = ownData(entry, "visitorId");
      const kind = ownData(entry, "kind");
      const assigneeId = ownData(entry, "assigneeId");
      const observation = ownData(entry, "observation");

      if (!id(receiptId) ||
          requestId !== membership.requestId ||
          !id(visitorId) ||
          !intended.has(visitorId) ||
          kind !== membership.kind ||
          assigneeId !== membership.assigneeId ||
          typeof observation !== "string" ||
          !observations.has(observation) ||
          receiptIds.has(receiptId) ||
          visitorIds.has(visitorId)) {
        return invalid();
      }

      receiptIds.add(receiptId);
      visitorIds.add(visitorId);

      accepted.push(Object.freeze({
        receiptId,
        requestId: membership.requestId,
        visitorId,
        kind: membership.kind,
        assigneeId: membership.assigneeId,
        observation: observation as CareBulkReceiptObservation
      }));
    }

    const evidence = new Map(
      accepted.map(receipt => [receipt.visitorId, receipt.observation])
    );

    const unresolved = membership.visitorIds.filter(
      visitorId => evidence.get(visitorId) !== "observed"
    );

    const contradictory = accepted.some(
      receipt => receipt.observation === "contradictory"
    );

    return result(
      contradictory
        ? "contradictory"
        : unresolved.length > 0
          ? "requires_reconciliation"
          : "observed_unverified",
      membership.requestId,
      accepted,
      unresolved
    );
  } catch {
    // Includes hostile proxies, accessors, and malformed evidence.
    return invalid();
  }
}
