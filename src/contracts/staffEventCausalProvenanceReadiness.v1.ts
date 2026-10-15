import { types } from "node:util";

/**
 * Causal-provenance readiness v1.
 *
 * This is a pure, nonauthorizing assessment of evidence-state summaries.
 * It does not consume persisted rows, independently read a storage source,
 * verify causal attribution, or establish global identity uniqueness.
 */

export const STAFF_EVENT_CAUSAL_PROVENANCE_READINESS_VERSION = 1;

export type StaffEventCausalProvenanceReadinessStatus =
  | "consistent_but_unproven"
  | "insufficient_evidence"
  | "contradictory"
  | "unavailable"
  | "unsupported";

export type StaffEventCausalProvenanceReadinessInput = Readonly<{
  schemaVersion: 1;
  securityReceipt: "observed" | "missing" | "contradictory" | "unavailable";
  appendIntent: "recorded" | "not_required" | "legacy_unclassified"
    | "missing" | "contradictory" | "unavailable";
  staffEvent: "verified_match" | "missing" | "contradictory"
    | "unavailable" | "unclassified";
  operationUniqueness: "not_proven" | "duplicate" | "unavailable";
  causalLink: "writer_claim_only" | "missing"
    | "contradictory" | "unavailable";
}>;

export type StaffEventCausalProvenanceReadinessResult = Readonly<{
  status: StaffEventCausalProvenanceReadinessStatus;
  causalProvenanceVerified: false;
  globalOperationUniquenessVerified: false;
  authoritative: false;
  executionPermitted: false;
  retryPermitted: false;
  securityTransactionVerified: false;
  staffEventsAppendVerified: false;
}>;

const safety = {
  causalProvenanceVerified: false,
  globalOperationUniquenessVerified: false,
  authoritative: false,
  executionPermitted: false,
  retryPermitted: false,
  securityTransactionVerified: false,
  staffEventsAppendVerified: false
} as const;

function result(
  status: StaffEventCausalProvenanceReadinessStatus
): StaffEventCausalProvenanceReadinessResult {
  return { status, ...safety };
}

const allowed = {
  schemaVersion: [1],
  securityReceipt: ["observed", "missing", "contradictory", "unavailable"],
  appendIntent: [
    "recorded", "not_required", "legacy_unclassified", "missing",
    "contradictory", "unavailable"
  ],
  staffEvent: [
    "verified_match", "missing", "contradictory",
    "unavailable", "unclassified"
  ],
  operationUniqueness: ["not_proven", "duplicate", "unavailable"],
  causalLink: [
    "writer_claim_only", "missing", "contradictory", "unavailable"
  ]
} as const;

/**
 * Classifies only known evidence-state summaries. Unknown, malformed,
 * or future schemas are unsupported, never promoted to causal proof.
 *
 * No state in this version verifies provenance, uniqueness, authorization,
 * execution, or retry safety.
 */
export function assessStaffEventCausalProvenanceReadiness(
  input: unknown
): StaffEventCausalProvenanceReadinessResult {
  try {
    if (typeof input !== "object" || input === null ||
        Array.isArray(input)) {
      return result("unsupported");
    }

    // Reject proxies before reading descriptors or enumerating keys.
    // Only detached, ordinary evidence summaries are supported.
    if (types.isProxy(input)) return result("unsupported");

    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) {
      return result("unsupported");
    }

    const obj = input as Record<string, unknown>;
    const keys = Object.keys(obj);
    const expected = Object.keys(allowed);

    if (
      keys.length !== expected.length ||
      expected.some(key => !Object.prototype.hasOwnProperty.call(obj, key)) ||
      Object.getOwnPropertySymbols(obj).length > 0
    ) {
      return result("unsupported");
    }

    for (const key of expected) {
      const descriptor = Object.getOwnPropertyDescriptor(obj, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(
        descriptor, "value"
      )) {
        return result("unsupported");
      }
      const values = allowed[key as keyof typeof allowed] as readonly unknown[];
      if (!values.includes(descriptor.value)) return result("unsupported");
    }

    const securityReceipt = obj.securityReceipt;
    const appendIntent = obj.appendIntent;
    const staffEvent = obj.staffEvent;
    const operationUniqueness = obj.operationUniqueness;
    const causalLink = obj.causalLink;

    if (
      securityReceipt === "contradictory" ||
      appendIntent === "contradictory" ||
      staffEvent === "contradictory" ||
      operationUniqueness === "duplicate" ||
      causalLink === "contradictory"
    ) {
      return result("contradictory");
    }

    if (
      securityReceipt === "unavailable" ||
      appendIntent === "unavailable" ||
      staffEvent === "unavailable" ||
      operationUniqueness === "unavailable" ||
      causalLink === "unavailable"
    ) {
      return result("unavailable");
    }

    if (
      securityReceipt === "observed" &&
      appendIntent === "recorded" &&
      staffEvent === "verified_match" &&
      operationUniqueness === "not_proven" &&
      causalLink === "writer_claim_only"
    ) {
      return result("consistent_but_unproven");
    }

    return result("insufficient_evidence");
  } catch {
    // Hostile or uninspectable input cannot establish readiness.
    return result("unsupported");
  }
}
