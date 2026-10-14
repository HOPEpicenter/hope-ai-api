import { types } from "node:util";
import type { StaffEvent } from "../domain/staff/projectStaffDirectory";
import {
  classifyStaffEventCorrelationEvidence,
  type StaffEventCorrelationEvidenceV1
} from "./staffEventCorrelationEvidence.v1";

export const STAFF_EVENT_APPEND_INTENT_SCHEMA_VERSION = 1;
export const STAFF_EVENT_APPEND_INTENT_SOURCE = "staff-events-append-intent";
// Conservative bound under the 64 KiB Azure Table string-property limit.
export const STAFF_EVENT_APPEND_INTENT_MAX_SERIALIZED_BYTES = 32768;

/**
 * Immutable description of the exact StaffEvent a committed security
 * operation intends to persist. Reuses the canonical StaffEvent and the
 * correlation evidence contract; it is not proof of any write and does not
 * authorize or execute anything.
 */
export type StaffEventAppendIntentV1 = Readonly<{
  schemaVersion: 1;
  sourceIdentity: typeof STAFF_EVENT_APPEND_INTENT_SOURCE;
  event: StaffEvent;
  correlation: StaffEventCorrelationEvidenceV1;
}>;

/** Identity of the committed operation, as read from its obligation/receipt. */
export type StaffEventAppendIntentOperation = Readonly<{
  operationId: string;
  eventId: string;
  staffId: string;
  mutationCategory: string;
  resultingSecurityRevision: number;
}>;

export type StaffEventAppendIntentStatus =
  | "valid"
  | "malformed"
  | "contradictory"
  | "unsupported_schema_version"
  | "oversized";

export type StaffEventAppendIntentResult = Readonly<{
  status: StaffEventAppendIntentStatus;
  diagnostic: string;
  intent?: StaffEventAppendIntentV1;
  authoritative: false;
  executionPermitted: false;
  retryPermitted: false;
  securityTransactionVerified: false;
  staffEventsAppendVerified: false;
}>;

const nonAuthorizing = {
  authoritative: false,
  executionPermitted: false,
  retryPermitted: false,
  securityTransactionVerified: false,
  staffEventsAppendVerified: false
} as const;
const intentFields = new Set(["schemaVersion", "sourceIdentity", "event", "correlation"]);
const eventFields = new Set(["eventId", "staffId", "type", "occurredAt", "actorId", "data"]);
const dataFields = new Set([
  "displayName", "roleLabel", "status", "reason", "entraTenantId",
  "entraObjectId", "email", "phone", "ministryAreaId"
]);

const MAX_SNAPSHOT_DEPTH = 8;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Copies plain data exactly once. Proxies, accessors, symbols, arrays,
 * non-plain prototypes, own `toJSON`, functions, and non-finite numbers are
 * unsupported and throw; the caller maps every throw to `malformed`. All later
 * validation reads only this copy, so the observed value cannot change.
 */
function snapshotPlainData(value: unknown, depth = 0): unknown {
  if (value === undefined) throw new Error("unsupported");
  if (value === null) return value;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("unsupported");
    return value;
  }
  if (typeof value !== "object" || depth >= MAX_SNAPSHOT_DEPTH || types.isProxy(value)) {
    throw new Error("unsupported");
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) throw new Error("unsupported");
  if (Reflect.ownKeys(value).some(key => typeof key !== "string" || key === "toJSON")) {
    throw new Error("unsupported");
  }
  const copy: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!("value" in descriptor) || !descriptor.enumerable) throw new Error("unsupported");
    Object.defineProperty(copy, key, {
      value: snapshotPlainData(descriptor.value, depth + 1),
      enumerable: true,
      writable: true,
      configurable: true
    });
  }
  return copy;
}

function result(
  status: StaffEventAppendIntentStatus,
  diagnostic: string,
  intent?: StaffEventAppendIntentV1
): StaffEventAppendIntentResult {
  return { status, diagnostic, ...(intent ? { intent } : {}), ...nonAuthorizing };
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * Validates one intent against the committed operation's identity, category
 * and resulting revision. Pure: performs no reads, writes, or authorization,
 * never mutates its input, and returns a deeply frozen detached copy.
 */
export function validateStaffEventAppendIntent(
  input: unknown,
  operation: StaffEventAppendIntentOperation
): StaffEventAppendIntentResult {
  // Any failure while inspecting or classifying hostile input is a rejection,
  // never a success; neither the payload nor the error message is surfaced.
  try {
    return validateSnapshots(
      snapshotPlainData(input),
      snapshotPlainData(operation) as StaffEventAppendIntentOperation
    );
  } catch {
    return result("malformed", "intent_unsupported_or_uninspectable");
  }
}

function validateSnapshots(
  input: unknown,
  operation: StaffEventAppendIntentOperation
): StaffEventAppendIntentResult {
  if (!isRecord(operation)) return result("malformed", "operation_not_an_object");
  if (!isRecord(input)) return result("malformed", "intent_not_an_object");
  if (input.schemaVersion !== STAFF_EVENT_APPEND_INTENT_SCHEMA_VERSION) {
    return result("unsupported_schema_version", "unsupported_schema_version");
  }
  if (
    Object.keys(input).some(key => !intentFields.has(key)) ||
    input.sourceIdentity !== STAFF_EVENT_APPEND_INTENT_SOURCE
  ) {
    return result("malformed", "intent_envelope_invalid");
  }

  const event = input.event;
  if (!isRecord(event) || !isRecord(event.data)) {
    return result("malformed", "event_not_an_object");
  }
  if (Object.keys(event).some(key => !eventFields.has(key))) {
    return result("malformed", "unexpected_event_field");
  }
  for (const [key, value] of Object.entries(event.data)) {
    if (!dataFields.has(key)) return result("malformed", "unexpected_event_data_field");
    if (typeof value !== "string" && value !== null) {
      return result("malformed", "event_data_value_not_serializable");
    }
  }

  // Deterministic, detached JSON copy; also catches non-serializable input.
  let serialized: string;
  try {
    serialized = JSON.stringify({ event, correlation: input.correlation });
  } catch {
    return result("malformed", "intent_not_serializable");
  }
  if (typeof serialized !== "string") return result("malformed", "intent_not_serializable");
  if (Buffer.byteLength(serialized, "utf8") > STAFF_EVENT_APPEND_INTENT_MAX_SERIALIZED_BYTES) {
    return result("oversized", "serialized_intent_exceeds_limit");
  }
  const copy = JSON.parse(serialized) as { event: StaffEvent; correlation: unknown };

  const check = classifyStaffEventCorrelationEvidence(copy.event, copy.correlation);
  if (check.status !== "valid" || !check.normalizedEvidence) {
    return result(
      check.status === "unsupported_schema_version" ? "unsupported_schema_version"
        : check.status === "contradictory" ? "contradictory"
        : "malformed",
      `correlation_${check.status}:${check.diagnostic}`
    );
  }
  const evidence = check.normalizedEvidence;
  if (
    evidence.operationId !== operation.operationId ||
    evidence.eventId !== operation.eventId ||
    evidence.staffId !== operation.staffId ||
    evidence.mutationCategory !== operation.mutationCategory ||
    evidence.resultingSecurityRevision !== operation.resultingSecurityRevision
  ) {
    return result("contradictory", "intent_differs_from_security_operation");
  }

  return result("valid", "intent_consistent_not_proof_of_append", deepFreeze({
    schemaVersion: STAFF_EVENT_APPEND_INTENT_SCHEMA_VERSION,
    sourceIdentity: STAFF_EVENT_APPEND_INTENT_SOURCE,
    event: copy.event,
    correlation: evidence
  }));
}
