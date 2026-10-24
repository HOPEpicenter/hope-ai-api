/**
 * Structural assessment of persisted formation assignment records.
 *
 * This module does not read storage, prove complete history, provide a
 * consistent snapshot, verify staff identity, or authorize any action.
 * A structurally valid result MUST NOT be converted to complete: true
 * for resolveTrustedStaffVisitorAssignmentScope.
 */

export type FormationAssignmentEvidenceAssessment = Readonly<{
  status: "structurally_valid" | "blocked";
  reason:
    | "record_shapes_valid_non_authorizing"
    | "invalid_input"
    | "excessive_records"
    | "invalid_record"
    | "wrong_visitor"
    | "invalid_event_identity"
    | "duplicate_event_id"
    | "invalid_assignment_metadata";
  authoritative: false;
  complete: false;
  authorizationPermitted: false;
}>;

const MAX_RECORDS = 10000;
const UTC_MILLISECONDS =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value);
}

function id(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value;
}

function validTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !UTC_MILLISECONDS.test(value)) {
    return false;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) &&
    new Date(parsed).toISOString() === value;
}

function result(
  status: FormationAssignmentEvidenceAssessment["status"],
  reason: FormationAssignmentEvidenceAssessment["reason"]
): FormationAssignmentEvidenceAssessment {
  return {
    status,
    reason,
    authoritative: false,
    complete: false,
    authorizationPermitted: false
  };
}

/**
 * Checks only the shape and internal consistency of supplied records.
 *
 * The caller must never interpret a successful assessment as proof of
 * freshness, storage provenance, successful pagination, or read atomicity.
 */
export function assessPersistedFormationAssignmentEvidence(
  expectedVisitorId: unknown,
  records: unknown
): FormationAssignmentEvidenceAssessment {
  try {
    if (!id(expectedVisitorId) || !Array.isArray(records)) {
      return result("blocked", "invalid_input");
    }

    if (records.length > MAX_RECORDS) {
      return result("blocked", "excessive_records");
    }

    const eventIds = new Set<string>();

    for (const value of records) {
      if (!object(value)) {
        return result("blocked", "invalid_record");
      }

      if (
        value.partitionKey !== expectedVisitorId ||
        value.visitorId !== expectedVisitorId
      ) {
        return result("blocked", "wrong_visitor");
      }

      if (
        !id(value.idempotencyKey) ||
        !validTimestamp(value.occurredAt) ||
        typeof value.rowKey !== "string" ||
        value.rowKey !==
          `${value.occurredAt}__${value.idempotencyKey}` ||
        typeof value.type !== "string" ||
        !id(value.type)
      ) {
        return result("blocked", "invalid_event_identity");
      }

      const eventId = value.idempotencyKey;

      if (eventIds.has(eventId)) {
        return result("blocked", "duplicate_event_id");
      }

      eventIds.add(eventId);

      if (
        value.type !== "FOLLOWUP_ASSIGNED" &&
        value.type !== "FOLLOWUP_UNASSIGNED"
      ) {
        continue;
      }

      if (typeof value.metadata !== "string") {
        return result("blocked", "invalid_assignment_metadata");
      }

      let metadata: unknown;

      try {
        metadata = JSON.parse(value.metadata);
      } catch {
        return result("blocked", "invalid_assignment_metadata");
      }

      if (!object(metadata) || !object(metadata.data)) {
        return result("blocked", "invalid_assignment_metadata");
      }

      if (
        value.type === "FOLLOWUP_ASSIGNED" &&
        !id(metadata.data.assigneeId)
      ) {
        return result("blocked", "invalid_assignment_metadata");
      }
    }

    return result(
      "structurally_valid",
      "record_shapes_valid_non_authorizing"
    );
  } catch {
    return result("blocked", "invalid_input");
  }
}