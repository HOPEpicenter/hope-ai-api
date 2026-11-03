import { types } from "node:util";

/**
 * Synthetic staff-invitation access-audit assessment.
 *
 * This module does not emit an event, perform storage I/O,
 * authenticate an actor, inspect Azure diagnostics, or
 * establish independently verified audit coverage.
 *
 * Only fixed classifications may appear in the result.
 * No caller-supplied identifiers or personal information
 * are returned.
 */

export type AuditOperation = "create_attempt" | "read_attempt";

export type AuditOutcome =
  | "acknowledged"
  | "denied"
  | "failed"
  | "uncertain";

export type AuditAssessmentStatus =
  | "input_rejected"
  | "actor_unverified"
  | "outcome_uncertain"
  | "candidate_unverified";

export type AuditAssessment = Readonly<{
  status: AuditAssessmentStatus;
  operation: AuditOperation | null;
  outcome: AuditOutcome | null;
  advisoryOnly: true;
  authoritative: false;
  auditEventEmitted: false;
  actorIndependentlyVerified: false;
  outcomeIndependentlyVerified: false;
  accessAuditVerified: false;
  storageAccessPermitted: false;
  executionPermitted: false;
  retryPermitted: false;
  productionRolloutPermitted: false;
}>;

const denial = Object.freeze({
  advisoryOnly: true,
  authoritative: false,
  auditEventEmitted: false,
  actorIndependentlyVerified: false,
  outcomeIndependentlyVerified: false,
  accessAuditVerified: false,
  storageAccessPermitted: false,
  executionPermitted: false,
  retryPermitted: false,
  productionRolloutPermitted: false
} as const);

const keys = [
  "schemaVersion",
  "operation",
  "outcome",
  "operationId",
  "actorCorrelationId",
  "occurredAt"
] as const;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const operations = [
  "create_attempt",
  "read_attempt"
] as const;

const outcomes = [
  "acknowledged",
  "denied",
  "failed",
  "uncertain"
] as const;

function result(
  status: AuditAssessmentStatus,
  operation: AuditOperation | null = null,
  outcome: AuditOutcome | null = null
): AuditAssessment {
  return Object.freeze({
    status,
    operation,
    outcome,
    ...denial
  });
}

function validTimestamp(value: unknown): boolean {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    return false;
  }

  const date = new Date(value);

  return Number.isFinite(date.getTime()) &&
    date.toISOString() === value;
}

/**
 * Copy only exact, own, enumerable data properties.
 * Reject proxies, getters, extra properties and prototypes.
 */
function snapshot(input: unknown): Record<string, unknown> | null {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    types.isProxy(input)
  ) {
    return null;
  }

  const prototype = Object.getPrototypeOf(input);

  if (prototype !== Object.prototype && prototype !== null) {
    return null;
  }

  const found = Reflect.ownKeys(input);

  if (
    found.length !== keys.length ||
    found.some(
      key => typeof key !== "string" ||
        !keys.includes(key as typeof keys[number])
    )
  ) {
    return null;
  }

  const descriptors = Object.getOwnPropertyDescriptors(input);
  const copy: Record<string, unknown> = Object.create(null);

  for (const key of keys) {
    const descriptor = descriptors[key];

    if (
      !descriptor ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) {
      return null;
    }

    const value: unknown = descriptor.value;

    if (
      typeof value !== "string" &&
      typeof value !== "number"
    ) {
      return null;
    }

    copy[key] = value;
  }

  return copy;
}

export function assessStaffInvitationAccessAudit(
  input: unknown
): AuditAssessment {
  try {
    const value = snapshot(input);

    if (!value) {
      return result("input_rejected");
    }

    if (
      value.schemaVersion !== 1 ||
      typeof value.operation !== "string" ||
      !operations.includes(value.operation as AuditOperation) ||
      typeof value.outcome !== "string" ||
      !outcomes.includes(value.outcome as AuditOutcome) ||
      typeof value.operationId !== "string" ||
      !uuidPattern.test(value.operationId) ||
      !validTimestamp(value.occurredAt) ||
      typeof value.actorCorrelationId !== "string"
    ) {
      return result("input_rejected");
    }

    const operation = value.operation as AuditOperation;
    const outcome = value.outcome as AuditOutcome;

    if (!uuidPattern.test(value.actorCorrelationId)) {
      return result("actor_unverified", operation, outcome);
    }

    if (outcome === "uncertain") {
      return result("outcome_uncertain", operation, outcome);
    }

    // Actor and outcome remain unverified caller claims.
    // This is not proof an audit record exists anywhere.
    return result("candidate_unverified", operation, outcome);
  } catch {
    return result("input_rejected");
  }
}
