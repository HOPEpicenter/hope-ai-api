import {
  evaluateStaffWriterCoordination,
  type StaffWriterCoordinationEvidence,
  type StaffWriterCoordinationRequest
} from "./staffWriterCoordinationContract";

/**
 * Synthetic-only staff writer fencing research.
 *
 * "candidate_consistent" describes observed evidence, never a grant to
 * perform a storage mutation. Production writers must not depend on this
 * assessment as an authorization or execution mechanism.
 */
export type StaffWriterFencingStatus =
  | "candidate_consistent"
  | "blocked";

export type StaffWriterFencingReason =
  | "consistent_evidence_non_authorizing"
  | "missing_or_incomplete_evidence"
  | "stale_or_contradictory_evidence"
  | "uncertain_or_unavailable_evidence"
  | "invalid_input";

export type StaffWriterFencingAssessment = Readonly<{
  status: StaffWriterFencingStatus;
  reason: StaffWriterFencingReason;
  authoritative: false;
  executionPermitted: false;
  retryPermitted: false;
  productionWriterFenced: false;
}>;

function assessment(
  status: StaffWriterFencingStatus,
  reason: StaffWriterFencingReason
): StaffWriterFencingAssessment {
  return {
    status,
    reason,
    authoritative: false,
    executionPermitted: false,
    retryPermitted: false,
    productionWriterFenced: false
  };
}

/**
 * Classifies synthetic coordination evidence without touching persistence.
 *
 * Missing or non-committed security evidence never qualifies as a
 * consistent candidate. No result authorizes a real writer or retry.
 */
export function assessStaffWriterFencingProof(
  request: StaffWriterCoordinationRequest,
  evidence: StaffWriterCoordinationEvidence
): StaffWriterFencingAssessment {
  try {
    if (
      request === null ||
      typeof request !== "object" ||
      evidence === null ||
      typeof evidence !== "object" ||
      Array.isArray(evidence)
    ) {
      return assessment("blocked", "invalid_input");
    }

    const record = evidence as unknown as Record<string, unknown>;
    const security = record.securityDecision;

    if (
      security === null ||
      typeof security !== "object" ||
      Array.isArray(security)
    ) {
      return assessment("blocked", "missing_or_incomplete_evidence");
    }

    const decision = security as Record<string, unknown>;

    if (
      decision.state === "missing" ||
      decision.state === "pending" ||
      decision.state === "not_required" ||
      decision.state === undefined
    ) {
      return assessment("blocked", "missing_or_incomplete_evidence");
    }

    if (
      decision.state === "uncertain" ||
      record.staffEventsPersistence === undefined ||
      record.projection === undefined
    ) {
      return assessment("blocked", "uncertain_or_unavailable_evidence");
    }

    const result = evaluateStaffWriterCoordination(request, evidence);

    if (
      result.status === "committed" &&
      result.reason === "evidence_complete"
    ) {
      return assessment(
        "candidate_consistent",
        "consistent_evidence_non_authorizing"
      );
    }

    if (result.status === "uncertain") {
      return assessment("blocked", "uncertain_or_unavailable_evidence");
    }

    if (result.status === "pending") {
      return assessment("blocked", "missing_or_incomplete_evidence");
    }

    return assessment("blocked", "stale_or_contradictory_evidence");
  } catch {
    return assessment("blocked", "invalid_input");
  }
}