/**
 * E149C synthetic-only legacy projection fencing model.
 *
 * This classifies invented evidence; it does NOT attest to storage identity,
 * grant authority, read Azure/StaffEvents, or fence a deployed legacy writer.
 * All results are non-authorizing. Real storage permissions and read-path
 * isolation must be proven separately before any rollout.
 */
export type SyntheticProjectionFenceAssessment = Readonly<{
  classification: "historical_only" | "candidate_consistent" | "blocked";
  reason:
    | "legacy_projection_not_authority"
    | "matching_evidence_non_authorizing"
    | "missing_authority"
    | "revoked_authority"
    | "unverified_projection"
    | "contradictory_evidence"
    | "invalid_input";
  authoritative: false;
  bindingOwnershipGranted: false;
  staffActivationPermitted: false;
  oauthExecutionPermitted: false;
  retryPermitted: false;
  productionWriterFenced: false;
}>;

function result(
  classification: SyntheticProjectionFenceAssessment["classification"],
  reason: SyntheticProjectionFenceAssessment["reason"]
): SyntheticProjectionFenceAssessment {
  return {
    classification, reason,
    authoritative: false,
    bindingOwnershipGranted: false,
    staffActivationPermitted: false,
    oauthExecutionPermitted: false,
    retryPermitted: false,
    productionWriterFenced: false
  };
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function own(value: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}
function identifier(value: unknown): value is string {
  return typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}
function validRevision(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) && value >= 0;
}

/**
 * Input is wholly synthetic. An "authority" object supplied by a caller
 * cannot authenticate itself: even matching evidence remains non-authorizing.
 */
export function assessSyntheticLegacyProjectionFence(
  input: unknown
): SyntheticProjectionFenceAssessment {
  try {
    if (!record(input)) return result("blocked", "invalid_input");
    const provenance = own(input, "provenance");
    if (provenance === "historical_legacy" ||
        provenance === "direct_legacy_append") {
      return result("historical_only", "legacy_projection_not_authority");
    }
    if (provenance !== "claimed_authority_projection") {
      return result("blocked", "unverified_projection");
    }
    const authority = own(input, "authority");
    const projection = own(input, "projection");
    if (authority === null || authority === undefined) {
      return result("blocked", "missing_authority");
    }
    if (!record(authority) || !record(projection)) {
      return result("blocked", "invalid_input");
    }
    const state = own(authority, "state");
    if (state === "revoked") {
      return result("blocked", "revoked_authority");
    }
    if (state !== "active") return result("blocked", "missing_authority");
    const staffId = own(authority, "staffId");
    const operationId = own(authority, "operationId");
    const eventId = own(authority, "eventId");
    const revision = own(authority, "revision");
    if (!identifier(staffId) || !identifier(operationId) ||
        !identifier(eventId) || !validRevision(revision)) {
      return result("blocked", "invalid_input");
    }
    const projectionStaffId = own(projection, "staffId");
    const projectionOperationId = own(projection, "operationId");
    const projectionEventId = own(projection, "eventId");
    const projectionRevision = own(projection, "revision");
    if (!identifier(projectionStaffId) || !identifier(projectionOperationId) ||
        !identifier(projectionEventId) || !validRevision(projectionRevision)) {
      return result("blocked", "unverified_projection");
    }
    if (staffId !== projectionStaffId ||
        operationId !== projectionOperationId ||
        eventId !== projectionEventId ||
        revision !== projectionRevision) {
      return result("blocked", "contradictory_evidence");
    }
    return result("candidate_consistent", "matching_evidence_non_authorizing");
  } catch {
    return result("blocked", "invalid_input");
  }
}
