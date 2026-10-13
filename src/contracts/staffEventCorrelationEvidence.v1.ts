import {
  STAFF_WRITER_MUTATION_CATEGORIES,
  evaluateStaffWriterCoordination,
  type StaffSecurityState,
  type StaffWriterMutationCategory
} from "../domain/staff/staffWriterCoordinationContract";
import {
  normalizeEntraStaffBinding,
  type StaffEvent
} from "../domain/staff/projectStaffDirectory";
import { classifyStaffSecurityMutation } from "../domain/staff/classifyStaffSecurityMutation";

export const STAFF_EVENT_CORRELATION_EVIDENCE_SCHEMA_VERSION = 1;
export const STAFF_EVENT_CORRELATION_EVIDENCE_SOURCE =
  "staff-events-correlation-evidence";

export type StaffEventCorrelationBindingV1 = Readonly<{
  identity: Readonly<{
    entraTenantId: string;
    entraObjectId: string;
  }>;
  transition: "acquire" | "release";
  expectedOwnerStaffId?: string;
}>;

export type StaffEventCorrelationEvidenceV1 = Readonly<{
  schemaVersion: 1;
  sourceIdentity: typeof STAFF_EVENT_CORRELATION_EVIDENCE_SOURCE;
  evidenceProvenance: "writer_supplied_metadata";
  operationId: string;
  eventId: string;
  staffId: string;
  mutationCategory: StaffWriterMutationCategory;
  expectedSecurityRevision: number;
  resultingSecurityRevision: number;
  previousStaffState: StaffSecurityState;
  resultingStaffState: StaffSecurityState;
  binding?: StaffEventCorrelationBindingV1;
}>;

export type StaffEventCorrelationEvidenceStatus =
  | "valid"
  | "legacy"
  | "incomplete"
  | "malformed"
  | "contradictory"
  | "unsupported_schema_version";

export type StaffEventCorrelationEvidenceResult = Readonly<{
  status: StaffEventCorrelationEvidenceStatus;
  diagnostic: string;
  normalizedEvidence?: StaffEventCorrelationEvidenceV1;
  authoritative: false;
  executionPermitted: false;
  retryPermitted: false;
  securityTransactionVerified: false;
  staffEventsAppendVerified: false;
}>;

export type StaffEventCorrelationCollectionItem = Readonly<{
  event: unknown;
  metadata?: unknown;
}>;

export type StaffEventCorrelationCollectionResult = Readonly<{
  status:
    | StaffEventCorrelationEvidenceStatus
    | "consistent"
    | "identical_replay";
  diagnostics: readonly string[];
  results: readonly StaffEventCorrelationEvidenceResult[];
  authoritative: false;
  executionPermitted: false;
  retryPermitted: false;
  securityTransactionVerified: false;
  staffEventsAppendVerified: false;
}>;

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const states = new Set<string>(["absent", "pending", "active", "revoked"]);
const categories = new Set<string>(STAFF_WRITER_MUTATION_CATEGORIES);
const nonAuthorizing = {
  authoritative: false,
  executionPermitted: false,
  retryPermitted: false,
  securityTransactionVerified: false,
  staffEventsAppendVerified: false
} as const;
const requiredFields = [
  "schemaVersion",
  "sourceIdentity",
  "evidenceProvenance",
  "operationId",
  "eventId",
  "staffId",
  "mutationCategory",
  "expectedSecurityRevision",
  "resultingSecurityRevision",
  "previousStaffState",
  "resultingStaffState"
] as const;
const allowedFields = new Set<string>([...requiredFields, "binding"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function result(
  status: StaffEventCorrelationEvidenceStatus,
  diagnostic: string,
  normalizedEvidence?: StaffEventCorrelationEvidenceV1
): StaffEventCorrelationEvidenceResult {
  return {
    status,
    diagnostic,
    ...(normalizedEvidence ? { normalizedEvidence } : {}),
    ...nonAuthorizing
  };
}

function isValidIdentifier(value: unknown): value is string {
  return typeof value === "string" && identifierPattern.test(value);
}

function isValidState(value: unknown): value is StaffSecurityState {
  return typeof value === "string" && states.has(value);
}

function normalizeBinding(
  value: unknown
): StaffEventCorrelationBindingV1 | null {
  if (!isRecord(value)) return null;
  const expectedOwnerStaffId = value.expectedOwnerStaffId;
  const identity = normalizeEntraStaffBinding(
    isRecord(value.identity) ? value.identity.entraTenantId : undefined,
    isRecord(value.identity) ? value.identity.entraObjectId : undefined
  );
  if (
    !identity ||
    (value.transition !== "acquire" && value.transition !== "release")
  ) {
    return null;
  }
  if (value.transition === "release") {
    if (!isValidIdentifier(expectedOwnerStaffId)) return null;
  } else if (expectedOwnerStaffId !== undefined) {
    return null;
  }
  const ownerStaffId = value.transition === "release"
    ? expectedOwnerStaffId as string
    : undefined;
  return {
    identity,
    transition: value.transition,
    ...(ownerStaffId === undefined
      ? {}
      : { expectedOwnerStaffId: ownerStaffId })
  };
}

function isStaffEvent(value: unknown): value is StaffEvent {
  if (!isRecord(value) || !isRecord(value.data)) return false;
  const types = [
    "staff.created",
    "staff.updated",
    "staff.deactivated",
    "staff.invited",
    "staff.activated"
  ];
  return isValidIdentifier(value.eventId) &&
    isValidIdentifier(value.staffId) &&
    types.includes(String(value.type)) &&
    typeof value.actorId === "string" &&
    value.actorId.trim().length > 0 &&
    typeof value.occurredAt === "string" &&
    Number.isFinite(Date.parse(value.occurredAt));
}

function eventBindingMatches(
  event: StaffEvent,
  binding: StaffEventCorrelationBindingV1
): boolean {
  const tenant = event.data.entraTenantId;
  const object = event.data.entraObjectId;
  if (binding.transition === "release" &&
      (tenant === null || tenant === undefined) &&
      (object === null || object === undefined)) {
    return true;
  }
  const eventBinding = normalizeEntraStaffBinding(tenant, object);
  return eventBinding !== null &&
    eventBinding.entraTenantId === binding.identity.entraTenantId &&
    eventBinding.entraObjectId === binding.identity.entraObjectId;
}

function validateStateTransition(
  metadata: Record<string, unknown>,
  binding: StaffEventCorrelationBindingV1 | undefined
): boolean {
  const request = {
    mutationCategory: metadata.mutationCategory as string,
    operationId: metadata.operationId as string,
    eventId: metadata.eventId as string,
    expectedSecurityRevision: metadata.expectedSecurityRevision as number,
    expectedStaffId: metadata.staffId as string,
    expectedStaffState: metadata.previousStaffState as StaffSecurityState,
    targetStaffState: metadata.resultingStaffState as StaffSecurityState,
    bindingIdentity: binding?.identity ?? null
  };
  const check = evaluateStaffWriterCoordination(request, {
    securityDecision: { state: "missing" },
    staffEventsPersistence: { state: "missing" },
    projection: { state: "missing" },
    invitationSideEffect: metadata.mutationCategory === "invitation"
      ? "not_started"
      : "not_applicable"
  });
  return check.reason !== "unsupported_mutation_category" &&
    check.reason !== "invalid_or_contradictory_evidence";
}

/**
 * Classifies metadata against one independently supplied StaffEvent.
 * This validates envelope consistency only; it does not prove persistence.
 */
export function classifyStaffEventCorrelationEvidence(
  event: unknown,
  metadata: unknown
): StaffEventCorrelationEvidenceResult {
  if (metadata === undefined || metadata === null) {
    return result(
      isStaffEvent(event) ? "legacy" : "incomplete",
      isStaffEvent(event) ? "legacy_event_without_metadata" : "staff_event_missing_or_malformed"
    );
  }
  if (!isRecord(metadata)) {
    return result("malformed", "metadata_not_an_object");
  }
  if (metadata.schemaVersion !== STAFF_EVENT_CORRELATION_EVIDENCE_SCHEMA_VERSION) {
    return result("unsupported_schema_version", "unsupported_schema_version");
  }
  if (!isStaffEvent(event)) {
    return result("incomplete", "staff_event_missing_or_malformed");
  }
  if (requiredFields.some(field => !Object.prototype.hasOwnProperty.call(metadata, field))) {
    return result("incomplete", "required_metadata_missing");
  }
  if (Object.keys(metadata).some(field => !allowedFields.has(field))) {
    return result("malformed", "unexpected_metadata_field");
  }
  if (
    metadata.sourceIdentity !== STAFF_EVENT_CORRELATION_EVIDENCE_SOURCE ||
    metadata.evidenceProvenance !== "writer_supplied_metadata" ||
    !isValidIdentifier(metadata.operationId) ||
    !isValidIdentifier(metadata.eventId) ||
    !isValidIdentifier(metadata.staffId) ||
    typeof metadata.mutationCategory !== "string" ||
    !categories.has(metadata.mutationCategory) ||
    !Number.isSafeInteger(metadata.expectedSecurityRevision) ||
    (metadata.expectedSecurityRevision as number) < 0 ||
    !Number.isSafeInteger(metadata.resultingSecurityRevision) ||
    (metadata.resultingSecurityRevision as number) < 0 ||
    !isValidState(metadata.previousStaffState) ||
    !isValidState(metadata.resultingStaffState)
  ) {
    return result("malformed", "invalid_metadata_value");
  }
  if (
    !Number.isSafeInteger(
      (metadata.expectedSecurityRevision as number) + 1
    )
  ) {
    return result("malformed", "revision_overflow");
  }
  if (
    metadata.resultingSecurityRevision !==
      (metadata.expectedSecurityRevision as number) + 1
  ) {
    return result("contradictory", "nonconsecutive_security_revisions");
  }
  if (metadata.eventId !== event.eventId || metadata.staffId !== event.staffId) {
    return result("contradictory", "event_or_staff_identity_mismatch");
  }

  const bindingWasSupplied = Object.prototype.hasOwnProperty.call(metadata, "binding");
  const parsedBinding = bindingWasSupplied
    ? normalizeBinding(metadata.binding)
    : null;
  if (bindingWasSupplied && !parsedBinding) {
    return result("malformed", "malformed_binding_evidence");
  }
  const binding = parsedBinding ?? undefined;
  if (
    binding?.transition === "release" &&
    binding.expectedOwnerStaffId !== metadata.staffId
  ) {
    return result("contradictory", "release_owner_mismatch");
  }
  if (
    (metadata.mutationCategory === "binding_change" ||
      metadata.mutationCategory === "invitation" ||
      metadata.mutationCategory === "activation") &&
    !binding
  ) {
    return result("incomplete", "binding_evidence_missing");
  }
  if (binding && !eventBindingMatches(event, binding)) {
    return result("contradictory", "event_binding_identity_mismatch");
  }
  if (!validateStateTransition(metadata, binding)) {
    return result("contradictory", "invalid_state_transition");
  }

  const classification = classifyStaffSecurityMutation(event);
  if (classification.kind !== metadata.mutationCategory) {
    return result("contradictory", "mutation_category_mismatch");
  }

  return result(
    "valid",
    "metadata_consistent_not_independently_verified",
    {
      schemaVersion: 1,
      sourceIdentity: STAFF_EVENT_CORRELATION_EVIDENCE_SOURCE,
      evidenceProvenance: "writer_supplied_metadata",
      operationId: metadata.operationId,
      eventId: metadata.eventId,
      staffId: metadata.staffId,
      mutationCategory: metadata.mutationCategory as StaffWriterMutationCategory,
      expectedSecurityRevision: metadata.expectedSecurityRevision as number,
      resultingSecurityRevision: metadata.resultingSecurityRevision as number,
      previousStaffState: metadata.previousStaffState as StaffSecurityState,
      resultingStaffState: metadata.resultingStaffState as StaffSecurityState,
      ...(binding ? { binding } : {})
    }
  );
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map(key =>
      `${JSON.stringify(key)}:${stableStringify(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Detects duplicate identities only in the supplied collection. It does not
 * prove global uniqueness, complete historical coverage, current security
 * head state, source persistence, or transaction completion.
 */
export function inspectStaffEventCorrelationCollection(
  items: readonly StaffEventCorrelationCollectionItem[]
): StaffEventCorrelationCollectionResult {
  const results = items.map(item =>
    classifyStaffEventCorrelationEvidence(item.event, item.metadata)
  );
  const diagnostics: string[] = [];
  const validItems = items.flatMap((item, index) =>
    results[index].status === "valid" &&
      results[index].normalizedEvidence
      ? [{ item, evidence: results[index].normalizedEvidence }]
      : []
  );
  const operationIds = new Map<string, string>();
  const eventIds = new Map<string, string>();
  let hasDuplicate = false;
  let hasConflict = false;

  for (const { item, evidence } of validItems) {
    const fingerprint = stableStringify({
      event: item.event,
      metadata: evidence
    });
    const priorOperation = operationIds.get(evidence.operationId);
    const priorEvent = eventIds.get(evidence.eventId);
    if (priorOperation !== undefined || priorEvent !== undefined) {
      hasDuplicate = true;
      if (priorOperation !== fingerprint || priorEvent !== fingerprint) {
        hasConflict = true;
      }
    }
    operationIds.set(evidence.operationId, fingerprint);
    eventIds.set(evidence.eventId, fingerprint);
  }
  if (hasConflict) diagnostics.push("duplicate_identity_conflict");
  else if (hasDuplicate) diagnostics.push("identical_replay_in_supplied_collection");

  const staffStreams = new Map<
    string,
    Array<(typeof validItems)[number]>
  >();
  const seenTransitions = new Set<string>();
  for (const entry of validItems) {
    const fingerprint = stableStringify({
      event: entry.item.event,
      metadata: entry.evidence
    });
    if (seenTransitions.has(fingerprint)) continue;
    seenTransitions.add(fingerprint);
    const stream = staffStreams.get(entry.evidence.staffId) ?? [];
    stream.push(entry);
    staffStreams.set(entry.evidence.staffId, stream);
  }

  let hasRevisionGap = false;
  for (const stream of staffStreams.values()) {
    const byRevision = stream.sort((left, right) =>
      left.evidence.expectedSecurityRevision -
        right.evidence.expectedSecurityRevision
    );
    for (let index = 1; index < byRevision.length; index += 1) {
      if (
        byRevision[index - 1].evidence.resultingSecurityRevision !==
        byRevision[index].evidence.expectedSecurityRevision
      ) {
        hasRevisionGap = true;
        diagnostics.push("security_revision_gap_in_supplied_collection");
      }
      const earlier = byRevision[index - 1].item.event as StaffEvent;
      const later = byRevision[index].item.event as StaffEvent;
      if (earlier.occurredAt > later.occurredAt) {
        diagnostics.push("timestamps_not_revision_ordered");
      }
    }
  }

  const invalidEvidence = results.find(value => value.status !== "valid");
  const status: StaffEventCorrelationCollectionResult["status"] =
    hasConflict || results.some(value => value.status === "contradictory")
      ? "contradictory"
      : invalidEvidence?.status ??
        (hasRevisionGap
          ? "incomplete"
          : hasDuplicate
            ? "identical_replay"
            : "consistent");
  return {
    status,
    diagnostics,
    results,
    ...nonAuthorizing
  };
}
