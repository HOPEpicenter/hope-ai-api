import type {
  StaffEventCorrelationBindingV1,
  StaffEventCorrelationEvidenceV1
} from "../../contracts/staffEventCorrelationEvidence.v1";
import {
  STAFF_WRITER_MUTATION_CATEGORIES,
  evaluateStaffWriterCoordination,
  type StaffSecurityState
} from "../../domain/staff/staffWriterCoordinationContract";
import { normalizeEntraStaffBinding } from "../../domain/staff/projectStaffDirectory";
import {
  STAFF_EVENTS_APPEND_OBLIGATION_SCHEMA_VERSION,
  STAFF_EVENTS_APPEND_OBLIGATION_SOURCE,
  STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
  STAFF_OPERATION_CORRELATION_PROTOTYPE_SCHEMA_VERSION,
  STAFF_OPERATION_CORRELATION_PROTOTYPE_SOURCE,
  staffEventsAppendObligationRowKey
} from "../../repositories/staffOperationCorrelationPrototypeRepository";
import {
  StaffEventCorrelationStoragePrototype,
  type StaffEventCorrelationReadResult
} from "../../repositories/staffEventCorrelationStoragePrototype";

/**
 * Read-only, non-authorizing research comparison of one synthetic security
 * receipt and one StaffEvents correlation metadata record. Agreement between
 * two independently read rows does not prove cross-table atomicity, complete
 * historical coverage, current authorization, or operation-ID uniqueness.
 */
export type ReconciliationReadPort = {
  getEntity(
    partitionKey: string,
    rowKey: string
  ): Promise<Record<string, unknown>>;
};

export type ReconciliationStaffEventsPort = ReconciliationReadPort & {
  readonly tableName: string;
};

export type StaffEventCorrelationReconciliationRequest = Readonly<{
  operationId: string;
  eventId: string;
  staffId: string;
  occurredAt: string;
}>;

export type StaffEventCorrelationReconciliationStatus =
  | "consistent_observed_evidence"
  | "missing_security_receipt"
  | "missing_staff_event"
  | "legacy_event_without_metadata"
  | "incomplete_metadata"
  | "malformed_evidence"
  | "contradictory_evidence"
  | "unsupported_schema_version"
  | "storage_unavailable"
  | "uncertain"
  | "invalid_request";

export type ReconciliationSourceStatus =
  | "observed"
  | "missing"
  | "legacy"
  | "incomplete"
  | "malformed"
  | "contradictory"
  | "unsupported_schema_version"
  | "unavailable";

export type StaffEventCorrelationReconciliationOptions = Readonly<{
  /** Opt in to reading the append obligation from the security port. */
  inspectAppendObligation?: boolean;
}>;

/**
 * Describes only the obligation row. `observed_pending` means a pending
 * obligation exists; it never indicates that StaffEvents was appended.
 */
export type StaffEventsAppendObligationEvidenceStatus =
  | "not_inspected"
  | "observed_pending"
  | "missing"
  | "malformed"
  | "contradictory"
  | "unavailable";

export type StaffEventsAppendObligationEvidence = Readonly<{
  status: StaffEventsAppendObligationEvidenceStatus;
  diagnostic: string;
  mismatchedFields: readonly string[];
}>;

export type StaffEventCorrelationReconciliationResult = Readonly<{
  status: StaffEventCorrelationReconciliationStatus;
  diagnostics: readonly string[];
  mismatchedFields: readonly string[];
  sources: Readonly<{
    securityReceipt: ReconciliationSourceStatus;
    staffEvent: ReconciliationSourceStatus;
  }>;
  appendObligation: StaffEventsAppendObligationEvidence;
  authoritative: false;
  executionPermitted: false;
  retryPermitted: false;
  securityTransactionVerified: false;
  staffEventsAppendVerified: false;
  operationIdUniquenessEnforced: false;
}>;

type ReceiptView = Readonly<{
  operationId: string;
  eventId: string;
  staffId: string;
  mutationCategory: string;
  expectedRevision: number;
  resultingRevision: number;
  previousStaffState: StaffSecurityState;
  resultingStaffState: StaffSecurityState;
  binding: Readonly<{
    identity: Readonly<{ entraTenantId: string; entraObjectId: string }>;
    transition: "acquire" | "release";
    expectedOwnerStaffId?: string;
  }> | null;
}>;

type ReceiptRead = Readonly<{
  status: ReconciliationSourceStatus;
  diagnostic: string;
  receipt?: ReceiptView;
}>;

const identifiers = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const categories = new Set<string>(STAFF_WRITER_MUTATION_CATEGORIES);
const states = new Set<string>(["absent", "pending", "active", "revoked"]);

function httpStatus(error: unknown): number {
  const value = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof value === "number" ? value : 0;
}

function isTableNotFound(error: unknown): boolean {
  const e = error as {
    code?: unknown;
    details?: { odataError?: { code?: unknown } };
    message?: unknown;
  } | null;
  return e?.code === "TableNotFound" ||
    e?.details?.odataError?.code === "TableNotFound" ||
    (typeof e?.message === "string" && e.message.includes("TableNotFound"));
}

// A missing table is unavailable storage, not a missing row.
function readGuard(port: ReconciliationReadPort): ReconciliationReadPort {
  return {
    getEntity: async (pk, rk) => {
      try {
        return await port.getEntity(pk, rk);
      } catch (error) {
        if (isTableNotFound(error)) {
          throw Object.assign(new Error("table_unavailable"), { statusCode: 503 });
        }
        throw error;
      }
    }
  };
}

const notInspected: StaffEventsAppendObligationEvidence = {
  status: "not_inspected",
  diagnostic: "append_obligation_not_inspected",
  mismatchedFields: []
};

function obligationEvidence(
  status: StaffEventsAppendObligationEvidenceStatus,
  diagnostic: string,
  mismatchedFields: string[] = []
): StaffEventsAppendObligationEvidence {
  return { status, diagnostic, mismatchedFields };
}

async function readAppendObligation(
  port: ReconciliationReadPort,
  request: StaffEventCorrelationReconciliationRequest,
  receipt: ReceiptView | undefined
): Promise<StaffEventsAppendObligationEvidence> {
  const rowKey = staffEventsAppendObligationRowKey(request.operationId);
  let entity: Record<string, unknown>;
  try {
    entity = await port.getEntity(
      STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
      rowKey
    );
  } catch (error) {
    return httpStatus(error) === 404
      ? obligationEvidence("missing", "append_obligation_not_found")
      : obligationEvidence("unavailable", "append_obligation_read_failed");
  }

  if (
    entity.partitionKey !== STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION ||
    entity.rowKey !== rowKey
  ) {
    return obligationEvidence("contradictory", "append_obligation_key_mismatch");
  }
  if (
    entity.schemaVersion !== STAFF_EVENTS_APPEND_OBLIGATION_SCHEMA_VERSION ||
    entity.source !== STAFF_EVENTS_APPEND_OBLIGATION_SOURCE
  ) {
    return obligationEvidence("malformed", "append_obligation_schema_or_source_invalid");
  }
  const {
    operationId, eventId, staffId, mutationCategory,
    resultingSecurityRevision, status
  } = entity;
  if (
    typeof operationId !== "string" || !identifiers.test(operationId) ||
    typeof eventId !== "string" || !identifiers.test(eventId) ||
    typeof staffId !== "string" || !identifiers.test(staffId) ||
    typeof mutationCategory !== "string" || !categories.has(mutationCategory) ||
    typeof resultingSecurityRevision !== "number" ||
    !Number.isSafeInteger(resultingSecurityRevision) ||
    resultingSecurityRevision < 1 ||
    typeof status !== "string"
  ) {
    return obligationEvidence("malformed", "append_obligation_fields_invalid");
  }

  const mismatched: string[] = [];
  if (operationId !== request.operationId) mismatched.push("operationId");
  if (eventId !== request.eventId) mismatched.push("eventId");
  if (staffId !== request.staffId) mismatched.push("staffId");
  // Category and revision are comparable only against an observed receipt.
  if (receipt) {
    if (operationId !== receipt.operationId && !mismatched.includes("operationId")) {
      mismatched.push("operationId");
    }
    if (eventId !== receipt.eventId && !mismatched.includes("eventId")) {
      mismatched.push("eventId");
    }
    if (staffId !== receipt.staffId && !mismatched.includes("staffId")) {
      mismatched.push("staffId");
    }
    if (mutationCategory !== receipt.mutationCategory) {
      mismatched.push("mutationCategory");
    }
    if (resultingSecurityRevision !== receipt.resultingRevision) {
      mismatched.push("resultingSecurityRevision");
    }
  }
  if (mismatched.length > 0) {
    return obligationEvidence(
      "contradictory",
      "append_obligation_differs_from_security_evidence",
      mismatched
    );
  }
  if (status !== "pending") {
    return obligationEvidence("contradictory", "append_obligation_status_not_pending");
  }
  return obligationEvidence(
    "observed_pending",
    "append_obligation_pending_not_proof_of_staff_events_append"
  );
}

function build(
  status: StaffEventCorrelationReconciliationStatus,
  securityReceipt: ReconciliationSourceStatus,
  staffEvent: ReconciliationSourceStatus,
  diagnostics: string[],
  mismatchedFields: string[] = [],
  appendObligation: StaffEventsAppendObligationEvidence = notInspected
): StaffEventCorrelationReconciliationResult {
  return {
    status,
    diagnostics,
    mismatchedFields,
    sources: { securityReceipt, staffEvent },
    appendObligation,
    authoritative: false,
    executionPermitted: false,
    retryPermitted: false,
    securityTransactionVerified: false,
    staffEventsAppendVerified: false,
    operationIdUniquenessEnforced: false
  };
}

async function readReceipt(
  port: ReconciliationReadPort,
  request: StaffEventCorrelationReconciliationRequest
): Promise<ReceiptRead> {
  const rowKey = `operation-${request.operationId}`;
  let entity: Record<string, unknown>;
  try {
    entity = await port.getEntity(
      STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
      rowKey
    );
  } catch (error) {
    return httpStatus(error) === 404
      ? { status: "missing", diagnostic: "security_receipt_not_found" }
      : { status: "unavailable", diagnostic: "security_receipt_read_failed" };
  }

  if (
    entity.partitionKey !== STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION ||
    entity.rowKey !== rowKey
  ) {
    return { status: "contradictory", diagnostic: "security_receipt_key_mismatch" };
  }
  if (
    entity.schemaVersion !== undefined &&
    entity.schemaVersion !== STAFF_OPERATION_CORRELATION_PROTOTYPE_SCHEMA_VERSION
  ) {
    return {
      status: "unsupported_schema_version",
      diagnostic: "security_receipt_unsupported_schema_version"
    };
  }

  const malformed = (diagnostic: string): ReceiptRead => ({
    status: "malformed",
    diagnostic
  });
  if (entity.schemaVersion !== STAFF_OPERATION_CORRELATION_PROTOTYPE_SCHEMA_VERSION) {
    return malformed("security_receipt_schema_missing");
  }
  if (entity.source !== STAFF_OPERATION_CORRELATION_PROTOTYPE_SOURCE) {
    return malformed("security_receipt_source_invalid");
  }
  if (entity.outcome !== "committed") {
    return malformed("security_receipt_outcome_invalid");
  }
  const {
    operationId, eventId, staffId, mutationCategory,
    expectedRevision, resultingRevision,
    previousStaffState, resultingStaffState
  } = entity;
  if (
    typeof operationId !== "string" || !identifiers.test(operationId) ||
    typeof eventId !== "string" || !identifiers.test(eventId) ||
    typeof staffId !== "string" || !identifiers.test(staffId) ||
    typeof mutationCategory !== "string" || !categories.has(mutationCategory) ||
    typeof expectedRevision !== "number" ||
    !Number.isSafeInteger(expectedRevision) || expectedRevision < 0 ||
    typeof resultingRevision !== "number" ||
    !Number.isSafeInteger(resultingRevision) ||
    typeof previousStaffState !== "string" || !states.has(previousStaffState) ||
    typeof resultingStaffState !== "string" || !states.has(resultingStaffState)
  ) {
    return malformed("security_receipt_fields_invalid");
  }
  if (resultingRevision !== expectedRevision + 1) {
    return {
      status: "contradictory",
      diagnostic: "security_receipt_nonconsecutive_revisions"
    };
  }
  if (
    operationId !== request.operationId ||
    eventId !== request.eventId ||
    staffId !== request.staffId
  ) {
    return {
      status: "contradictory",
      diagnostic: "security_receipt_identity_differs_from_requested_identity"
    };
  }

  let binding: ReceiptView["binding"] = null;
  const hasBindingFields = entity.tenantId !== undefined ||
    entity.objectId !== undefined || entity.bindingTransition !== undefined;
  if (hasBindingFields) {
    const identity = normalizeEntraStaffBinding(entity.tenantId, entity.objectId);
    const transition = entity.bindingTransition;
    if (!identity || (transition !== "acquire" && transition !== "release")) {
      return malformed("security_receipt_binding_invalid");
    }
    const owner = entity.expectedOwnerStaffId;
    if (transition === "release") {
      if (typeof owner !== "string" || !identifiers.test(owner)) {
        return malformed("security_receipt_release_owner_invalid");
      }
      if (owner !== staffId) {
        return {
          status: "contradictory",
          diagnostic: "security_receipt_release_owner_differs_from_staff"
        };
      }
    } else if (owner !== undefined) {
      return malformed("security_receipt_acquire_owner_unexpected");
    }
    binding = {
      identity,
      transition,
      ...(transition === "release" ? { expectedOwnerStaffId: owner as string } : {})
    };
  } else if (entity.expectedOwnerStaffId !== undefined) {
    return malformed("security_receipt_owner_without_binding");
  }

  // Reuse the existing coordination rules; no separate transition policy.
  const transitionCheck = evaluateStaffWriterCoordination(
    {
      mutationCategory,
      operationId,
      eventId,
      expectedSecurityRevision: expectedRevision,
      expectedStaffId: staffId,
      expectedStaffState: previousStaffState as StaffSecurityState,
      targetStaffState: resultingStaffState as StaffSecurityState,
      bindingIdentity: binding?.identity ?? null
    },
    {
      securityDecision: { state: "missing" },
      staffEventsPersistence: { state: "missing" },
      projection: { state: "missing" },
      invitationSideEffect: mutationCategory === "invitation"
        ? "not_started"
        : "not_applicable"
    }
  );
  if (
    transitionCheck.reason === "unsupported_mutation_category" ||
    transitionCheck.reason === "invalid_or_contradictory_evidence"
  ) {
    return {
      status: "contradictory",
      diagnostic: "security_receipt_prohibited_or_contradictory_transition"
    };
  }

  return {
    status: "observed",
    diagnostic: "security_receipt_observed_not_authoritative",
    receipt: {
      operationId, eventId, staffId, mutationCategory,
      expectedRevision, resultingRevision,
      previousStaffState: previousStaffState as StaffSecurityState,
      resultingStaffState: resultingStaffState as StaffSecurityState,
      binding
    }
  };
}

function eventSource(
  read: StaffEventCorrelationReadResult
): { status: ReconciliationSourceStatus } {
  switch (read.status) {
    case "valid": return { status: "observed" };
    case "legacy": return { status: "legacy" };
    case "incomplete": return { status: "incomplete" };
    case "unsupported_schema_version":
      return { status: "unsupported_schema_version" };
    case "not_found": return { status: "missing" };
    case "read_failed": return { status: "unavailable" };
    case "malformed":
    case "malformed_entity":
      return { status: "malformed" };
    default: return { status: "contradictory" };
  }
}

function sameBinding(
  a: StaffEventCorrelationBindingV1 | undefined,
  b: ReceiptView["binding"]
): string[] {
  if (!a && !b) return [];
  if (!a || !b) return ["binding"];
  const out: string[] = [];
  if (
    a.identity.entraTenantId !== b.identity.entraTenantId ||
    a.identity.entraObjectId !== b.identity.entraObjectId
  ) out.push("binding.identity");
  if (a.transition !== b.transition) out.push("binding.transition");
  if (a.expectedOwnerStaffId !== b.expectedOwnerStaffId) {
    out.push("binding.expectedOwnerStaffId");
  }
  return out;
}

function compare(
  receipt: ReceiptView,
  evidence: StaffEventCorrelationEvidenceV1
): string[] {
  const out: string[] = [];
  if (receipt.operationId !== evidence.operationId) out.push("operationId");
  if (receipt.eventId !== evidence.eventId) out.push("eventId");
  if (receipt.staffId !== evidence.staffId) out.push("staffId");
  if (receipt.mutationCategory !== evidence.mutationCategory) {
    out.push("mutationCategory");
  }
  if (receipt.expectedRevision !== evidence.expectedSecurityRevision) {
    out.push("expectedSecurityRevision");
  }
  if (receipt.resultingRevision !== evidence.resultingSecurityRevision) {
    out.push("resultingSecurityRevision");
  }
  if (receipt.previousStaffState !== evidence.previousStaffState) {
    out.push("previousStaffState");
  }
  if (receipt.resultingStaffState !== evidence.resultingStaffState) {
    out.push("resultingStaffState");
  }
  return [...out, ...sameBinding(evidence.binding, receipt.binding)];
}

/**
 * Performs reads only. The StaffEvents port is wrapped so any write attempt
 * through the reused storage-prototype reader would throw.
 */
export async function inspectStaffEventCorrelationReconciliation(
  request: StaffEventCorrelationReconciliationRequest,
  securityTable: ReconciliationReadPort,
  staffEventsTable: ReconciliationStaffEventsPort,
  options?: StaffEventCorrelationReconciliationOptions
): Promise<StaffEventCorrelationReconciliationResult> {
  if (
    !request ||
    !identifiers.test(String(request.operationId)) ||
    !identifiers.test(String(request.eventId)) ||
    !identifiers.test(String(request.staffId)) ||
    typeof request.occurredAt !== "string" ||
    !Number.isFinite(Date.parse(request.occurredAt))
  ) {
    return build("invalid_request", "unavailable", "unavailable", ["invalid_request_identity"]);
  }

  const guardedEvents = readGuard(staffEventsTable);
  let reader: StaffEventCorrelationStoragePrototype;
  try {
    reader = new StaffEventCorrelationStoragePrototype({
      tableName: staffEventsTable.tableName,
      createEntity: async () => {
        throw new Error("read_only_reconciliation_forbids_writes");
      },
      getEntity: (pk, rk) => guardedEvents.getEntity(pk, rk)
    });
  } catch {
    return build("invalid_request", "unavailable", "unavailable", ["isolated_proof_table_required"]);
  }

  const guardedSecurity = readGuard(securityTable);
  const [receiptRead, eventRead] = await Promise.all([
    readReceipt(guardedSecurity, request),
    reader.read({
      staffId: request.staffId,
      eventId: request.eventId,
      occurredAt: request.occurredAt
    })
  ]);
  // Informational only: never changes the top-level status.
  const appendObligation = options?.inspectAppendObligation === true
    ? await readAppendObligation(
        guardedSecurity,
        request,
        receiptRead.status === "observed" ? receiptRead.receipt : undefined
      )
    : notInspected;
  const security = receiptRead.status;
  const event = eventSource(eventRead).status;
  const diagnostics = [
    receiptRead.diagnostic,
    `staff_event:${eventRead.status}:${eventRead.diagnostic}`
  ];
  const done = (
    status: StaffEventCorrelationReconciliationStatus,
    mismatched: string[] = []
  ) => build(status, security, event, diagnostics, mismatched, appendObligation);

  if (security === "unavailable" && event === "unavailable") {
    return done("storage_unavailable");
  }
  // One source unreadable: the other source cannot support a conclusion.
  if (security === "unavailable" || event === "unavailable") {
    return done("uncertain");
  }
  if (security === "contradictory" || event === "contradictory") {
    return done("contradictory_evidence");
  }
  if (security === "malformed" || event === "malformed") {
    return done("malformed_evidence");
  }
  if (
    security === "unsupported_schema_version" ||
    event === "unsupported_schema_version"
  ) {
    return done("unsupported_schema_version");
  }
  if (security === "missing") return done("missing_security_receipt");
  if (event === "missing") return done("missing_staff_event");
  if (event === "incomplete") return done("incomplete_metadata");
  if (event === "legacy") return done("legacy_event_without_metadata");

  const receipt = receiptRead.receipt as ReceiptView;
  const evidence = eventRead.evidence as StaffEventCorrelationEvidenceV1;
  const mismatched = compare(receipt, evidence);
  if (mismatched.length > 0) {
    diagnostics.push(`mismatched:${mismatched.join(",")}`);
    return done("contradictory_evidence", mismatched);
  }
  diagnostics.push("observed_evidence_agrees_not_proof_of_atomicity_or_authorization");
  return done("consistent_observed_evidence");
}
