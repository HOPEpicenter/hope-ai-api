import {
  evaluateStaffWriterCoordination,
  type StaffSecurityState,
  type StaffWriterCoordinationRequest,
  type StaffWriterMutationCategory
} from "./staffWriterCoordinationContract";
import {
  type CanonicalStaffIdentity,
  type StaffEvent,
  normalizeEntraStaffBinding
} from "./projectStaffDirectory";
import { classifyStaffSecurityMutation } from "./classifyStaffSecurityMutation";

export const STAFF_OPERATION_CORRELATION_SCHEMA_VERSION = 1;

export type StaffOperationCorrelationSource =
  | "staff_security_operation_receipts"
  | "staff_events"
  | "canonical_staff_projection"
  | "staff_binding_ownership"
  | "entra_invitation_outcomes";

export type StaffOperationCorrelationRecord<T> = Readonly<{
  recordId: string;
  persistence: "durable" | "external_observation";
  value: T;
}>;

export type StaffOperationCorrelationRead<T> =
  | Readonly<{
      status: "observed";
      sourceId: StaffOperationCorrelationSource;
      records: readonly StaffOperationCorrelationRecord<T>[];
    }>
  | Readonly<{
      status: "missing" | "unavailable" | "uncertain";
      sourceId: StaffOperationCorrelationSource;
    }>;

export type StaffOperationCorrelationSecurityEvidence = Readonly<{
  kind?: string;
  outcome?: "committed" | "rejected";
  verification?: "verified" | "unverified";
  operationId?: string;
  eventId?: string;
  staffId?: string;
  mutationCategory?: StaffWriterMutationCategory | string;
  expectedSecurityRevision?: number;
  resultingSecurityRevision?: number;
  revision?: number;
  previousStaffState?: StaffSecurityState;
  resultingStaffState?: StaffSecurityState;
  bindingIdentity?: Readonly<{
    entraTenantId: string;
    entraObjectId: string;
  }> | null;
}>;

export type StaffOperationCorrelationStaffEventEvidence =
  Readonly<{
    event: StaffEvent;
    operationId?: string;
    mutationCategory?: StaffWriterMutationCategory | string;
    expectedSecurityRevision?: number;
    resultingSecurityRevision?: number;
    bindingIdentity?: Readonly<{
      entraTenantId: string;
      entraObjectId: string;
    }> | null;
  }>;

export type StaffOperationCorrelationProjectionEvidence =
  Readonly<{
    identity: CanonicalStaffIdentity;
    operationId?: string;
    mutationCategory?: StaffWriterMutationCategory | string;
    securityRevision?: number;
    bindingIdentity?: Readonly<{
      entraTenantId: string;
      entraObjectId: string;
    }> | null;
  }>;

export type StaffOperationCorrelationBindingEvidence =
  Readonly<{
    staffId?: string;
    tenantId?: string;
    objectId?: string;
    operationId?: string;
    ownershipState?: string;
    securityRevision?: number;
  }>;

export type StaffOperationCorrelationInvitationEvidence =
  Readonly<{
    operationId?: string;
    outcome: "succeeded" | "failed" | "uncertain";
  }>;

export type StaffOperationCorrelationEnvelope = Readonly<{
  schemaVersion: number;
  request: StaffWriterCoordinationRequest;
  securityOperation: StaffOperationCorrelationRead<StaffOperationCorrelationSecurityEvidence>;
  staffEvent: StaffOperationCorrelationRead<StaffOperationCorrelationStaffEventEvidence>;
  projection: StaffOperationCorrelationRead<StaffOperationCorrelationProjectionEvidence>;
  bindingOwnership:
    | StaffOperationCorrelationRead<StaffOperationCorrelationBindingEvidence>
    | Readonly<{ status: "not_applicable" }>;
  invitationOutcome:
    | StaffOperationCorrelationRead<StaffOperationCorrelationInvitationEvidence>
    | Readonly<{ status: "not_applicable" }>;
}>;

export type StaffOperationCorrelationStatus =
  | "complete"
  | "incomplete"
  | "contradictory"
  | "stale_historical"
  | "rejected"
  | "uncertain"
  | "unavailable";

export type StaffOperationCorrelationResult = Readonly<{
  schemaVersion: typeof STAFF_OPERATION_CORRELATION_SCHEMA_VERSION;
  status: StaffOperationCorrelationStatus;
  correlationIdentity: "matched" | "incomplete" | "contradictory";
  persistenceEvidence:
    | "durable"
    | "incomplete"
    | "uncertain"
    | "unavailable";
  currentAuthorityEvidence:
    | "consistent_current_evidence"
    | "incomplete"
    | "stale_historical"
    | "not_applicable";
  missingEvidence: readonly string[];
  diagnostic: string;
  authoritative: false;
  executionPermitted: false;
  retryPermitted: false;
}>;

const sourceIds = {
  securityOperation: "staff_security_operation_receipts",
  staffEvent: "staff_events",
  projection: "canonical_staff_projection",
  bindingOwnership: "staff_binding_ownership",
  invitationOutcome: "entra_invitation_outcomes"
} as const;

const supportedOperationReceiptKind = "staff.operation";
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const securityStates = new Set(["absent", "pending", "active", "revoked"]);
const nonAuthorizing = {
  authoritative: false,
  executionPermitted: false,
  retryPermitted: false
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && identifierPattern.test(value);
}

function makeResult(
  status: StaffOperationCorrelationStatus,
  values: Omit<
    StaffOperationCorrelationResult,
    | "schemaVersion"
    | "status"
    | "authoritative"
    | "executionPermitted"
    | "retryPermitted"
  >
): StaffOperationCorrelationResult {
  return {
    schemaVersion: STAFF_OPERATION_CORRELATION_SCHEMA_VERSION,
    status,
    ...values,
    ...nonAuthorizing
  };
}

function readState<T>(
  read: { status: string }
): "observed" | "missing" | "unavailable" | "uncertain" | "not_applicable" {
  return read.status as
    | "observed"
    | "missing"
    | "unavailable"
    | "uncertain"
    | "not_applicable";
}

function valueOf<T>(
  read: StaffOperationCorrelationRead<T>
): T | undefined {
  if (read.status !== "observed" ||
      !Array.isArray(read.records) ||
      read.records.length !== 1 ||
      !isRecord(read.records[0])) {
    return undefined;
  }
  return read.records[0].value as T;
}

function recordIssue<T>(
  read: StaffOperationCorrelationRead<T>,
  expectedSource: StaffOperationCorrelationSource,
  localEvidence: string[],
  label: string
): "missing" | "unavailable" | "uncertain" | "contradictory" | null {
  if (!isRecord(read) || read.sourceId !== expectedSource) {
    localEvidence.push(`${label}.sourceId`);
    return "contradictory";
  }
  if (read.status !== "observed") {
    if (read.status === "missing") localEvidence.push(`${label}.record`);
    return read.status;
  }
  if (!Array.isArray(read.records)) {
    localEvidence.push(`${label}.records_malformed`);
    return "contradictory";
  }
  if (read.records.length === 0) {
    localEvidence.push(`${label}.record`);
    return "missing";
  }
  if (
    read.records.length !== 1 ||
    read.records.some(record =>
      !isRecord(record) ||
      !isIdentifier(record.recordId) ||
      record.persistence !== "durable" &&
        !(label === "invitationOutcome" &&
          record.persistence === "external_observation") ||
      !isRecord(record.value)
    ) ||
    new Set(read.records.map(record => record.recordId)).size !==
      read.records.length
  ) {
    localEvidence.push(`${label}.duplicate_or_unverified_records`);
    return "contradictory";
  }
  return null;
}

function bindingIdentityMatches(
  value: unknown,
  request: StaffWriterCoordinationRequest
): boolean | null {
  if (request.bindingIdentity === null ||
      request.bindingIdentity === undefined) {
    return value === undefined || value === null ? true : false;
  }
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) return false;
  const normalized = normalizeEntraStaffBinding(
    value.entraTenantId,
    value.entraObjectId
  );
  const expected = normalizeEntraStaffBinding(
    request.bindingIdentity.entraTenantId,
    request.bindingIdentity.entraObjectId
  );
  if (!normalized || !expected) return false;
  return normalized.entraTenantId === expected.entraTenantId &&
    normalized.entraObjectId === expected.entraObjectId;
}

function requestIsValid(
  request: StaffWriterCoordinationRequest
): boolean {
  if (!isRecord(request)) return false;
  const evidence = evaluateStaffWriterCoordination(request, {
    securityDecision: { state: "missing" },
    staffEventsPersistence: { state: "missing" },
    projection: { state: "missing" },
    invitationSideEffect:
      request.mutationCategory === "invitation"
        ? "not_started"
        : "not_applicable"
  });
  return evidence.reason !== "unsupported_mutation_category" &&
    evidence.reason !== "invalid_or_contradictory_evidence";
}

/**
 * Evaluates supplied evidence for internal consistency only. It does not
 * verify a production source, make separate stores atomic, or authorize work.
 */
export function evaluateStaffOperationCorrelation(
  input: unknown
): StaffOperationCorrelationResult {
  const missingEvidence: string[] = [];
  if (!isRecord(input)) {
    return makeResult("contradictory", {
      correlationIdentity: "contradictory",
      persistenceEvidence: "incomplete",
      currentAuthorityEvidence: "incomplete",
      missingEvidence: ["envelope"],
      diagnostic: "malformed_envelope"
    });
  }
  if (input.schemaVersion !== STAFF_OPERATION_CORRELATION_SCHEMA_VERSION) {
    return makeResult("contradictory", {
      correlationIdentity: "contradictory",
      persistenceEvidence: "incomplete",
      currentAuthorityEvidence: "incomplete",
      missingEvidence: ["schemaVersion"],
      diagnostic: "unsupported_schema_version"
    });
  }
  if (!isRecord(input.request)) {
    return makeResult("contradictory", {
      correlationIdentity: "contradictory",
      persistenceEvidence: "incomplete",
      currentAuthorityEvidence: "incomplete",
      missingEvidence: ["request"],
      diagnostic: "malformed_request"
    });
  }

  const request = input.request as unknown as StaffWriterCoordinationRequest;
  if (!requestIsValid(request)) {
    return makeResult("contradictory", {
      correlationIdentity: "contradictory",
      persistenceEvidence: "incomplete",
      currentAuthorityEvidence: "incomplete",
      missingEvidence: ["request.identifiers_or_context"],
      diagnostic: "invalid_correlation_identity"
    });
  }

  const reads: Record<string, unknown> = {
    securityOperation: input.securityOperation,
    staffEvent: input.staffEvent,
    projection: input.projection,
    bindingOwnership: input.bindingOwnership,
    invitationOutcome: input.invitationOutcome
  };
  const bindingRequired = request.bindingIdentity !== null &&
    request.bindingIdentity !== undefined;
  const invitationRequired = request.mutationCategory === "invitation";

  for (const name of ["securityOperation", "staffEvent", "projection"] as const) {
    if (!isRecord(reads[name]) ||
        !["observed", "missing", "unavailable", "uncertain"].includes(
          String(reads[name].status)
        )) {
      missingEvidence.push(`${name}.observation`);
    }
  }
  if (
    bindingRequired &&
    (!isRecord(reads.bindingOwnership) ||
      !["observed", "missing", "unavailable", "uncertain"].includes(
        String(reads.bindingOwnership.status)
      ))
  ) {
    missingEvidence.push("bindingOwnership.observation");
  }
  if (
    !bindingRequired &&
    (!isRecord(reads.bindingOwnership) ||
      reads.bindingOwnership.status !== "not_applicable")
  ) {
    missingEvidence.push("bindingOwnership.not_applicable");
  }
  if (
    invitationRequired &&
    (!isRecord(reads.invitationOutcome) ||
      !["observed", "missing", "unavailable", "uncertain"].includes(
        String(reads.invitationOutcome.status)
      ))
  ) {
    missingEvidence.push("invitationOutcome.observation");
  }
  if (
    !invitationRequired &&
    (!isRecord(reads.invitationOutcome) ||
      reads.invitationOutcome.status !== "not_applicable")
  ) {
    missingEvidence.push("invitationOutcome.not_applicable");
  }
  if (missingEvidence.length > 0) {
    return makeResult("contradictory", {
      correlationIdentity: "contradictory",
      persistenceEvidence: "incomplete",
      currentAuthorityEvidence: "incomplete",
      missingEvidence,
      diagnostic: "malformed_source_observation"
    });
  }

  const securityRead = input.securityOperation as StaffOperationCorrelationRead<StaffOperationCorrelationSecurityEvidence>;
  const eventRead = input.staffEvent as StaffOperationCorrelationRead<StaffOperationCorrelationStaffEventEvidence>;
  const projectionRead = input.projection as StaffOperationCorrelationRead<StaffOperationCorrelationProjectionEvidence>;
  let bindingRead:
    | StaffOperationCorrelationRead<StaffOperationCorrelationBindingEvidence>
    | { status: "not_applicable" } = { status: "not_applicable" };
  let invitationRead:
    | StaffOperationCorrelationRead<StaffOperationCorrelationInvitationEvidence>
    | { status: "not_applicable" } = { status: "not_applicable" };
  if (bindingRequired) {
    bindingRead = input.bindingOwnership as StaffOperationCorrelationRead<StaffOperationCorrelationBindingEvidence>;
  }
  if (invitationRequired) {
    invitationRead = input.invitationOutcome as StaffOperationCorrelationRead<StaffOperationCorrelationInvitationEvidence>;
  }

  const issues = [
    recordIssue(
      securityRead,
      sourceIds.securityOperation,
      missingEvidence,
      "securityOperation"
    ),
    recordIssue(eventRead, sourceIds.staffEvent, missingEvidence, "staffEvent"),
    recordIssue(
      projectionRead,
      sourceIds.projection,
      missingEvidence,
      "projection"
    ),
    bindingRead.status !== "not_applicable"
      ? recordIssue(
          bindingRead,
          sourceIds.bindingOwnership,
          missingEvidence,
          "bindingOwnership"
        )
      : null,
    invitationRead.status !== "not_applicable"
      ? recordIssue(
          invitationRead,
          sourceIds.invitationOutcome,
          missingEvidence,
          "invitationOutcome"
        )
      : null
  ];
  const security = valueOf(securityRead);
  const eventEvidence = valueOf(eventRead);
  const projectionEvidence = valueOf(projectionRead);
  const bindingEvidence =
    bindingRead.status !== "not_applicable" ? valueOf(bindingRead) : undefined;
  const invitationEvidence =
    invitationRead.status !== "not_applicable"
      ? valueOf(invitationRead)
      : undefined;
  let contradictory = issues.includes("contradictory");
  let historical = false;
  let rejected = false;

  const identitySources: Array<{
    label: string;
    value: Record<string, unknown> | undefined;
  }> = [
    { label: "securityOperation", value: security },
    {
      label: "staffEvent",
      value: eventEvidence
        ? {
            operationId: eventEvidence.operationId,
            eventId: eventEvidence.event?.eventId,
            staffId: eventEvidence.event?.staffId,
            mutationCategory: eventEvidence.mutationCategory
          }
        : undefined
    },
    {
      label: "projection",
      value: projectionEvidence
        ? {
            operationId: projectionEvidence.operationId,
            eventId: projectionEvidence.identity?.lastEventId,
            staffId: projectionEvidence.identity?.staffId,
            mutationCategory: projectionEvidence.mutationCategory
          }
        : undefined
    }
  ];

  for (const source of identitySources) {
    if (!source.value) continue;
    for (const [field, expected] of [
      ["operationId", request.operationId],
      ["eventId", request.eventId],
      ["staffId", request.expectedStaffId],
      ["mutationCategory", request.mutationCategory]
    ] as const) {
      const actual = source.value[field];
      if (actual === undefined || actual === null) {
        missingEvidence.push(`${source.label}.${field}`);
      } else if (actual !== expected) {
        missingEvidence.push(`${source.label}.${field}_mismatch`);
        contradictory = true;
      }
    }
  }

  if (security) {
    if (security.verification !== "verified") {
      missingEvidence.push("securityOperation.verified_receipt");
    }
    if (security.kind === "binding.released" ||
        security.kind === "binding.reserved") {
      historical = true;
      missingEvidence.push("securityOperation.legacy_binding_receipt");
    } else if (security.kind !== supportedOperationReceiptKind) {
      contradictory = true;
      missingEvidence.push("securityOperation.kind");
    }
    if (security.outcome === "rejected") {
      rejected = security.verification === "verified";
    } else if (security.outcome !== "committed") {
      if (security.outcome === undefined) {
        missingEvidence.push("securityOperation.outcome");
      } else {
        contradictory = true;
        missingEvidence.push("securityOperation.outcome_malformed");
      }
    }
    if (security.expectedSecurityRevision === undefined) {
      missingEvidence.push("securityOperation.expectedSecurityRevision");
    } else if (
      !Number.isSafeInteger(security.expectedSecurityRevision)
    ) {
      contradictory = true;
      missingEvidence.push("securityOperation.expectedSecurityRevision_malformed");
    } else if (
      security.expectedSecurityRevision !== request.expectedSecurityRevision
    ) {
      historical = true;
      missingEvidence.push("securityOperation.expectedSecurityRevision_stale");
    }
    const resultingRevision =
      security.resultingSecurityRevision ?? security.revision;
    if (resultingRevision === undefined) {
      missingEvidence.push("securityOperation.resultingSecurityRevision");
    } else if (!Number.isSafeInteger(resultingRevision)) {
      contradictory = true;
      missingEvidence.push("securityOperation.resultingSecurityRevision_malformed");
    } else if (
      resultingRevision !== request.expectedSecurityRevision + 1
    ) {
      historical = true;
      missingEvidence.push("securityOperation.resultingSecurityRevision_stale");
    }
    if (security.resultingSecurityRevision !== undefined &&
        security.revision !== undefined &&
        security.resultingSecurityRevision !== security.revision) {
      contradictory = true;
      missingEvidence.push("securityOperation.revision_conflict");
    }
    if (security.previousStaffState === undefined) {
      missingEvidence.push("securityOperation.previousStaffState");
    } else if (!securityStates.has(security.previousStaffState)) {
      contradictory = true;
      missingEvidence.push("securityOperation.previousStaffState_malformed");
    } else if (security.previousStaffState !== request.expectedStaffState) {
      contradictory = true;
      missingEvidence.push("securityOperation.previousStaffState_mismatch");
    }
    if (security.resultingStaffState === undefined) {
      missingEvidence.push("securityOperation.resultingStaffState");
    } else if (!securityStates.has(security.resultingStaffState)) {
      contradictory = true;
      missingEvidence.push("securityOperation.resultingStaffState_malformed");
    } else if (
      request.targetStaffState !== undefined &&
      security.resultingStaffState !== request.targetStaffState
    ) {
      contradictory = true;
      missingEvidence.push("securityOperation.resultingStaffState_mismatch");
    }
    const bindingMatch = bindingIdentityMatches(
      security.bindingIdentity,
      request
    );
    if (bindingMatch === null) {
      missingEvidence.push("securityOperation.bindingIdentity");
    } else if (!bindingMatch) {
      contradictory = true;
      missingEvidence.push("securityOperation.bindingIdentity_mismatch");
    }
  }

  if (eventEvidence) {
    if (!eventEvidence.event || typeof eventEvidence.event !== "object") {
      contradictory = true;
      missingEvidence.push("staffEvent.event");
    } else {
      const classifiedMutation =
        classifyStaffSecurityMutation(eventEvidence.event);
      if (classifiedMutation.kind === "unknown") {
        missingEvidence.push("staffEvent.mutationCategory_unverifiable");
      } else if (
        classifiedMutation.kind !== request.mutationCategory
      ) {
        contradictory = true;
        missingEvidence.push("staffEvent.mutationCategory_conflicts_with_event");
      }
    }
    const eventCategory = eventEvidence.mutationCategory;
    if (eventCategory !== undefined &&
        eventCategory !== request.mutationCategory) {
      contradictory = true;
      missingEvidence.push("staffEvent.mutationCategory_mismatch");
    }
    for (const field of [
      "expectedSecurityRevision",
      "resultingSecurityRevision"
    ] as const) {
      if (eventEvidence[field] === undefined) {
        missingEvidence.push(`staffEvent.${field}`);
      } else if (
        eventEvidence[field] !==
          (field === "expectedSecurityRevision"
            ? request.expectedSecurityRevision
            : request.expectedSecurityRevision + 1)
      ) {
        contradictory = true;
        missingEvidence.push(`staffEvent.${field}_mismatch`);
      }
    }
    const bindingMatch = bindingIdentityMatches(
      eventEvidence.bindingIdentity,
      request
    );
    if (bindingMatch === null) {
      missingEvidence.push("staffEvent.bindingIdentity");
    } else if (!bindingMatch) {
      contradictory = true;
      missingEvidence.push("staffEvent.bindingIdentity_mismatch");
    }
  }

  if (projectionEvidence) {
    if (projectionEvidence.operationId === undefined) {
      missingEvidence.push("projection.operationId");
    }
    if (projectionEvidence.mutationCategory === undefined) {
      missingEvidence.push("projection.mutationCategory");
    }
    if (projectionEvidence.securityRevision === undefined) {
      missingEvidence.push("projection.securityRevision");
    } else if (
      projectionEvidence.securityRevision !==
      request.expectedSecurityRevision + 1
    ) {
      historical = true;
      missingEvidence.push("projection.securityRevision_stale");
    }
    const bindingMatch = bindingIdentityMatches(
      projectionEvidence.bindingIdentity,
      request
    );
    if (bindingMatch === null) {
      missingEvidence.push("projection.bindingIdentity");
    } else if (!bindingMatch) {
      contradictory = true;
      missingEvidence.push("projection.bindingIdentity_mismatch");
    }
  }

  if (bindingRequired && bindingEvidence) {
    if (
      bindingEvidence.ownershipState === "released"
    ) {
      historical = true;
      missingEvidence.push("bindingOwnership.released");
    } else if (bindingEvidence.ownershipState !== "active") {
      missingEvidence.push("bindingOwnership.ownershipState");
    }
    if (bindingEvidence.staffId !== request.expectedStaffId) {
      if (bindingEvidence.staffId === undefined) {
        missingEvidence.push("bindingOwnership.staffId");
      } else {
        contradictory = true;
        missingEvidence.push("bindingOwnership.staffId_mismatch");
      }
    }
    const bindingMatch = bindingIdentityMatches(
      bindingEvidence.tenantId !== undefined ||
        bindingEvidence.objectId !== undefined
        ? {
            entraTenantId: bindingEvidence.tenantId,
            entraObjectId: bindingEvidence.objectId
          }
        : undefined,
      request
    );
    if (bindingMatch === null) {
      missingEvidence.push("bindingOwnership.bindingIdentity");
    } else if (!bindingMatch) {
      contradictory = true;
      missingEvidence.push("bindingOwnership.bindingIdentity_mismatch");
    }
    if (
      bindingEvidence.operationId !== undefined &&
      bindingEvidence.operationId !== request.operationId
    ) {
      historical = true;
      missingEvidence.push("bindingOwnership.operationId_historical");
    } else if (bindingEvidence.operationId === undefined) {
      missingEvidence.push("bindingOwnership.operationId");
    }
    if (bindingEvidence.securityRevision === undefined) {
      missingEvidence.push("bindingOwnership.securityRevision");
    } else if (
      bindingEvidence.securityRevision !==
      request.expectedSecurityRevision + 1
    ) {
      historical = true;
      missingEvidence.push("bindingOwnership.securityRevision_stale");
    }
  }

  if (invitationRequired && invitationEvidence) {
    const invitationRecord = invitationRead.status === "observed" &&
        invitationRead.records.length === 1
      ? invitationRead.records[0]
      : undefined;
    if (
      invitationEvidence.outcome === "succeeded" &&
      invitationRecord?.persistence !== "durable"
    ) {
      missingEvidence.push("invitationOutcome.durable_local_evidence");
    }
    if (invitationEvidence.operationId !== request.operationId) {
      if (invitationEvidence.operationId === undefined) {
        missingEvidence.push("invitationOutcome.operationId");
      } else {
        contradictory = true;
        missingEvidence.push("invitationOutcome.operationId_mismatch");
      }
    }
    if (invitationEvidence.outcome === "uncertain") {
      issues.push("uncertain");
    } else if (invitationEvidence.outcome === "failed") {
      rejected = true;
    }
  }

  if (security?.outcome === "rejected" &&
      (eventEvidence !== undefined ||
        projectionEvidence !== undefined ||
        invitationEvidence?.outcome === "succeeded")) {
    contradictory = true;
    missingEvidence.push("security_rejection_conflicts_with_persistence");
  }
  if (
    security?.outcome === "rejected" &&
    bindingEvidence?.ownershipState === "active" &&
    bindingEvidence.operationId === request.operationId
  ) {
    contradictory = true;
    missingEvidence.push("security_rejection_conflicts_with_active_binding");
  }

  const hasUnavailable =
    issues.includes("unavailable") ||
    ([securityRead, eventRead, projectionRead, bindingRead, invitationRead]
      .some(read => readState(read) === "unavailable"));
  const hasUncertain =
    issues.includes("uncertain") ||
    ([securityRead, eventRead, projectionRead, bindingRead, invitationRead]
      .some(read => readState(read) === "uncertain"));
  const hasMissing =
    issues.includes("missing") ||
    missingEvidence.length > 0 ||
    ([securityRead, eventRead, projectionRead, bindingRead, invitationRead]
      .some(read => readState(read) === "missing"));
  const bindingIdentityConsistent =
    bindingEvidence !== undefined &&
    bindingEvidence.staffId === request.expectedStaffId &&
    bindingIdentityMatches(
      bindingEvidence.tenantId !== undefined ||
        bindingEvidence.objectId !== undefined
        ? {
            entraTenantId: bindingEvidence.tenantId,
            entraObjectId: bindingEvidence.objectId
          }
        : undefined,
      request
    ) === true;
  const currentAuthorityEvidence =
    !bindingRequired
      ? "not_applicable" as const
      : historical
        ? "stale_historical" as const
        : bindingEvidence?.ownershipState === "active" &&
            bindingEvidence.operationId === request.operationId &&
            bindingEvidence.securityRevision ===
              request.expectedSecurityRevision + 1 &&
            bindingIdentityConsistent
          ? "consistent_current_evidence" as const
          : "incomplete" as const;
  const correlationIdentity =
    contradictory
      ? "contradictory" as const
      : identitySources.every(source =>
          source.value &&
          ["operationId", "eventId", "staffId", "mutationCategory"].every(
            field => source.value![field] !== undefined
          )
        )
        ? "matched" as const
        : "incomplete" as const;
  const persistenceEvidence =
    hasUnavailable
      ? "unavailable" as const
      : hasUncertain
        ? "uncertain" as const
        : !hasMissing &&
            [securityRead, eventRead, projectionRead]
              .every(read => read.status === "observed" &&
                read.records[0]?.persistence === "durable")
          ? "durable" as const
          : "incomplete" as const;
  const status: StaffOperationCorrelationStatus =
    hasUnavailable
      ? "unavailable"
      : hasUncertain
        ? "uncertain"
        : contradictory
          ? "contradictory"
          : historical
            ? "stale_historical"
            : rejected
              ? "rejected"
              : hasMissing ||
                  currentAuthorityEvidence === "incomplete"
                ? "incomplete"
                : "complete";
  return makeResult(status, {
    correlationIdentity,
    persistenceEvidence,
    currentAuthorityEvidence,
    missingEvidence: [...new Set(missingEvidence)],
    diagnostic:
      status === "complete"
        ? "internally_consistent_supplied_evidence"
        : status
  });
}
